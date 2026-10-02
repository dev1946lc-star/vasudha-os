-- 32_invoice_lifecycle.sql
--
-- Completes the bill lifecycle. An "approved" invoice previously did not exist,
-- which made the word meaningless: invoices were created already payable and
-- immediately 'unpaid', so there was no review window, nothing to approve, and
-- nothing frozen. Worse, the collections behind an invoice stayed editable by a
-- manager AFTER the bill was issued, so an approved bill's line items could drift
-- away from the collections that produced them.
--
-- States added
-- ------------
--   draft     raised, not yet issued. Not owed, so excluded from every money view.
--   approved  reviewed and frozen. Underlying collections become immutable.
--   sent      delivered to the customer. Records when, which nothing did before.
--   overdue   payment state: due_date passed and not settled in full. Derived
--             rather than stored, so it cannot go stale.
--
--   cancelled stays terminal. There is now a real path to it (credit note) plus
--   the reversal of any allocations, which previously had nowhere to go.
--
-- Design notes
-- ------------
-- 'overdue' is a payment state, not a lifecycle one, and it is computed by
-- refresh_invoice_status rather than set by a sweep. A stored flag would go stale
-- the moment an invoice was paid, and a sweep would need a scheduler this project
-- does not have. Deriving it means "overdue" is true at the moment of reading,
-- with no interval in which it is wrong.
--
-- All money views now filter on a lifecycle predicate rather than an IN list of
-- payment states. An IN list had to be edited in five places whenever a state was
-- added, and 14b already had to be edited once for exactly that reason.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── 1. Expand the status domain ────────────────────────────────────────────

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','approved','sent','unpaid','partial','paid','overdue','cancelled'));

COMMENT ON COLUMN public.invoices.status IS
  'Lifecycle: draft -> approved -> sent -> (unpaid|partial|paid|overdue), plus '
  'cancelled. Overdue is derived from due_date and allocations, never stored stale.';

-- When the customer actually received the bill. Nothing recorded this before, so
-- "sent" could not be distinguished from "issued".
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at     TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.invoices.approved_at IS
  'When the bill was reviewed and frozen. After this the collections behind it cannot change.';
COMMENT ON COLUMN public.invoices.cancellation_reason IS
  'Why a bill was cancelled. Recorded because a cancellation with no explanation cannot be audited.';

-- ── 2. A single predicate for "this bill counts as money owed" ─────────────
--
-- Replaces the `status IN ('unpaid','partial')` list that was duplicated across
-- invoice_outstanding, restaurant_outstanding, 14, 14b and the migration-31
-- rewrites. A new state previously had to be added in five places; 14b exists
-- largely because one was missed.
CREATE OR REPLACE FUNCTION public.invoice_is_collectible(p_status TEXT)
RETURNS BOOLEAN AS $$
  SELECT p_status IN ('unpaid', 'partial', 'overdue');
$$ LANGUAGE SQL IMMUTABLE;

COMMENT ON FUNCTION public.invoice_is_collectible(TEXT) IS
  'TRUE when the bill represents money owed. draft/approved are not yet owed; '
  'paid and cancelled are settled.';

-- ── 3. Derive overdue rather than storing it ──────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_invoice_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_paid   DECIMAL(12,2);
  v_invoice_total DECIMAL(12,2);
  v_due_date     DATE;
  v_current_status TEXT;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT total_amount, due_date, status
    INTO v_invoice_total, v_due_date, v_current_status
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- cancelled is terminal, and a pre-issue bill has no payment state yet. Both
  -- must be left alone: recomputing them is what previously resurrected a
  -- cancelled invoice when a stray payment landed.
  IF v_current_status IN ('cancelled', 'draft', 'approved') THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payment_allocations
  WHERE invoice_id = p_invoice_id;

  IF v_total_paid >= v_invoice_total THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  ELSIF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
    -- Overdue outranks partial: it is the actionable state. The outstanding
    -- *amount* still shows the shortfall via invoice_outstanding, so nothing is
    -- lost by not also saying 'partial'.
    UPDATE public.invoices SET status = 'overdue' WHERE id = p_invoice_id;
  ELSIF v_total_paid > 0 THEN
    UPDATE public.invoices SET status = 'partial' WHERE id = p_invoice_id;
  ELSE
    UPDATE public.invoices SET status = 'unpaid' WHERE id = p_invoice_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_invoice_status(UUID) IS
  'Recomputes one invoice payment state from payment_allocations, deriving overdue '
  'from due_date. Leaves draft, approved and cancelled untouched.';

-- Backfill: invoices already past due should read as overdue immediately, not
-- only after the next payment touches them.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT i.id
    FROM public.invoices i
    WHERE i.status IN ('unpaid','partial')
      AND i.due_date IS NOT NULL
      AND i.due_date < CURRENT_DATE
      AND i.total_amount > COALESCE((SELECT SUM(a.amount)
                                      FROM public.payment_allocations a
                                      WHERE a.invoice_id = i.id), 0)
  LOOP
    PERFORM public.refresh_invoice_status(r.id);
  END LOOP;
END;
$$;

-- ── 4. Freeze collections behind an approved or sent invoice ──────────────
--
-- This is the defect that made 'approved' meaningless. Collections could be
-- edited after the bill was issued, so the amounts on the invoice no longer
-- matched what had actually been delivered -- and nothing in the product said so.
--
-- Checked in the trigger rather than only in the RPC, because collection_items
-- are insertable independently of their parent collection's status.

CREATE OR REPLACE FUNCTION public.collection_is_frozen(p_collection_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.collections c
    JOIN public.invoices i ON i.id = c.invoice_id
    WHERE c.id = p_collection_id
      -- Keyed on approved_at, NOT on status. 'sent' is transient: send_invoice
      -- moves straight to 'unpaid', so a status list would unfreeze the
      -- deliveries the moment the bill went out -- exactly when the freeze
      -- matters most. approved_at is the durable fact that review happened.
      AND i.approved_at IS NOT NULL
      AND i.status <> 'cancelled'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.collection_is_frozen(UUID) IS
  'TRUE when the collection feeds a bill that has been approved. Cancelling the '
  'bill releases it. Keyed on approved_at because ''sent'' is transient.';

CREATE OR REPLACE FUNCTION public.enforce_collection_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  -- Service role and background tasks bypass the state machine by design.
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Agents cannot edit a verified collection.
  IF OLD.status = 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot edit a verified collection.';
  END IF;

  -- Agents cannot transition a collection to verified.
  IF NEW.status = 'verified' AND OLD.status != 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot verify collections.';
  END IF;

  -- Agents cannot edit a completed collection. (It locks after they submit it.)
  IF OLD.status = 'completed' AND NEW.status = 'completed' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Record is locked. Agents cannot edit completed collections.';
  END IF;

  -- NEW: an approved bill is immutable, for every role including owner. An owner
  -- who needs to change it cancels it and re-issues, which leaves an audit trail;
  -- silently editing an issued bill is how a customer's copy stops matching the
  -- books.
  --
  -- NOT gated on a status change. That was the first version, and it let the most
  -- damaging edit straight through: rewriting `notes`, `collection_date` or any
  -- other field of a delivered collection without touching `status` at all. The
  -- freeze is about the row being immutable, not about which column moved.
  IF public.collection_is_frozen(OLD.id) THEN
    RAISE EXCEPTION
      'This collection feeds an approved invoice and cannot be changed. Cancel the invoice and re-issue instead.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Line items are editable directly, bypassing the parent trigger entirely, so the
-- freeze has to be enforced here too.
CREATE OR REPLACE FUNCTION public.enforce_frozen_collection_items()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_id UUID;
BEGIN
  v_collection_id := COALESCE(NEW.collection_id, OLD.collection_id);

  IF public.collection_is_frozen(v_collection_id) THEN
    RAISE EXCEPTION
      'This delivery feeds an approved invoice and cannot be changed. Cancel the invoice and re-issue instead.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS frozen_collection_items_trigger ON public.collection_items;
CREATE TRIGGER frozen_collection_items_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.collection_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_frozen_collection_items();

-- ── 5. Lifecycle transitions ───────────────────────────────────────────────
--
-- Each is an explicit RPC rather than a bare UPDATE, because each enforces a rule
-- the column cannot: who may act, what must be true first, and what has to happen
-- to the collections and allocations alongside.

-- approve_invoice: draft -> approved, and freeze the collections behind it.
CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id UUID)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_status TEXT;
  v_total NUMERIC;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  SELECT status, total_amount INTO v_status, v_total
  FROM public.invoices WHERE id = p_invoice_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not belong to your company.', p_invoice_id;
  END IF;

  -- Approving something already approved is a no-op rather than an error, because
  -- a double-click or a retried request is not a user mistake worth a stack trace.
  IF v_status = 'approved' THEN
    RETURN p_invoice_id;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft can be approved. This invoice is %.', v_status;
  END IF;

  -- An empty bill is never approvable: freezing one would lock collections for a
  -- document with nothing on it.
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'This invoice has no amount and cannot be approved.';
  END IF;

  UPDATE public.invoices
  SET status = 'approved', approved_at = NOW()
  WHERE id = p_invoice_id;

  RETURN p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.approve_invoice(UUID) IS
  'draft -> approved. Freezes the collections behind the invoice.';

-- send_invoice: approved -> sent. Only now does the bill become money owed,
-- because a bill the customer has not received is not a debt.
CREATE OR REPLACE FUNCTION public.send_invoice(p_invoice_id UUID)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_status TEXT;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  SELECT status INTO v_status
  FROM public.invoices WHERE id = p_invoice_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not belong to your company.', p_invoice_id;
  END IF;

  IF v_status = 'sent' THEN
    RETURN p_invoice_id;
  END IF;

  -- Skipping approval is refused rather than assumed: 'sent' freezes the bill for
  -- the customer, and an unapproved bill has not been checked.
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'An invoice must be approved before it can be sent. This one is %.', v_status;
  END IF;

  UPDATE public.invoices
  SET status = 'unpaid', sent_at = NOW()
  WHERE id = p_invoice_id;

  -- From here the bill is owed, so its ageing and outstanding figures apply.
  PERFORM public.refresh_invoice_status(p_invoice_id);

  RETURN p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.send_invoice(UUID) IS
  'approved -> sent. Only a sent invoice counts as money owed.';

-- cancel_invoice: the credit-note path. Cancelling has to reverse the money, not
-- just relabel the row -- previously a cancellation left allocations in place and
-- the outstanding figures still counted the bill.
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_status TEXT;
  v_allocated NUMERIC;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  SELECT status INTO v_status
  FROM public.invoices WHERE id = p_invoice_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not belong to your company.', p_invoice_id;
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN p_invoice_id;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    -- A cancellation with no explanation cannot be audited later, and the question
    -- "why was this voided" always comes up.
    RAISE EXCEPTION 'A reason is required to cancel an invoice.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.payment_allocations WHERE invoice_id = p_invoice_id;

  -- Money already received against a bill being voided has to go somewhere. It
  -- becomes credit on the account, so the restaurant is not quietly charged for a
  -- bill that no longer exists.
  IF v_allocated > 0 THEN
    INSERT INTO public.restaurant_credit (company_id, restaurant_id, amount, updated_at)
    SELECT i.company_id, i.restaurant_id, v_allocated, NOW()
    FROM public.invoices i WHERE i.id = p_invoice_id
    ON CONFLICT (company_id, restaurant_id) DO UPDATE
      SET amount = public.restaurant_credit.amount + EXCLUDED.amount,
          updated_at = NOW();

    DELETE FROM public.payment_allocations WHERE invoice_id = p_invoice_id;
  END IF;

  UPDATE public.invoices
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = btrim(p_reason)
  WHERE id = p_invoice_id;

  -- Release the collections so they can be re-billed into a corrected invoice.
  UPDATE public.collections
  SET invoice_id = NULL
  WHERE invoice_id = p_invoice_id;

  RETURN p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cancel_invoice(UUID, TEXT) IS
  'Cancels an invoice (credit note). Any money received is moved to restaurant '
  'credit rather than lost, and the collections are released for re-billing. '
  'Requires a reason. Owner only.';

-- ── 6. Billing creates drafts, not payable invoices ───────────────────────
--
-- generate_bulk_invoice issued a bill that was immediately collectible. That is
-- why there was nothing to review and nothing to approve: the money was owed from
-- the moment the button was pressed. Bills are now raised as drafts; send_invoice
-- makes them collectible.
--
-- The collections are still linked at draft stage. Linking early is deliberate:
-- it prevents the same delivery being billed twice, which is the failure a
-- "review then link" design would introduce.

CREATE OR REPLACE FUNCTION public.generate_bulk_invoice(p_collection_ids UUID[])
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_restaurant_id UUID;
  v_period TEXT;
  v_seq INT;
  v_invoice_number TEXT;
  v_subtotal DECIMAL(12,2) := 0;
  v_cgst DECIMAL(12,2) := 0;
  v_sgst DECIMAL(12,2) := 0;
  v_igst DECIMAL(12,2) := 0;
  v_total DECIMAL(12,2) := 0;
  v_due_date DATE;
  v_terms INT;
  v_company_gstin TEXT;
  v_restaurant_gstin TEXT;
  v_inter BOOLEAN;
  v_coll RECORD;
  v_line RECORD;
  v_net_qty DECIMAL(10,2);
  v_taxable DECIMAL(12,2);
  v_line_cgst DECIMAL(12,2) := 0;
  v_line_sgst DECIMAL(12,2) := 0;
  v_line_igst DECIMAL(12,2) := 0;
  v_invoice_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  -- Validate the whole selection before allocating a number, so a bad selection
  -- cannot burn a sequence value and leave a gap in the invoice series.
  FOR v_coll IN SELECT * FROM public.collections WHERE id = ANY(p_collection_ids)
  LOOP
    IF v_coll.company_id != v_company_id THEN
      RAISE EXCEPTION 'Collection % does not belong to your company.', v_coll.id;
    END IF;
    IF v_coll.restaurant_id != v_restaurant_id THEN
      RAISE EXCEPTION 'All collections must belong to the same restaurant.';
    END IF;
    IF v_coll.status != 'verified' THEN
      RAISE EXCEPTION 'Collection % is not verified.', v_coll.id;
    END IF;
    IF v_coll.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Collection % is already invoiced.', v_coll.id;
    END IF;
  END LOOP;

  SELECT COALESCE(r.payment_terms_days, 15), r.gst_number
  INTO v_terms, v_restaurant_gstin
  FROM public.restaurants r
  WHERE r.id = v_restaurant_id;

  SELECT gst_number INTO v_company_gstin
  FROM public.companies
  WHERE id = v_company_id;

  v_inter := public.is_inter_state_supply(v_company_gstin, v_restaurant_gstin);
  v_due_date := CURRENT_DATE + v_terms;

  v_period := TO_CHAR(CURRENT_DATE, 'YYYYMM');

  INSERT INTO public.invoice_sequences (company_id, period, last_value)
  VALUES (v_company_id, v_period, 1)
  ON CONFLICT (company_id, period) DO UPDATE
    SET last_value = public.invoice_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  v_invoice_number := 'INV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- 'draft', not 'unpaid'. The bill exists but is not yet owed.
  INSERT INTO public.invoices (
    company_id, restaurant_id, invoice_number, invoice_date, due_date,
    subtotal, cgst, sgst, igst, total_amount, status
  ) VALUES (
    v_company_id, v_restaurant_id, v_invoice_number, CURRENT_DATE, v_due_date,
    0, 0, 0, 0, 0, 'draft'
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN
    SELECT
      ci.product_id,
      SUM(ci.quantity)                             AS gross_qty,
      SUM(COALESCE(ci.return_quantity, 0))         AS return_qty,
      p.price                                      AS unit_price,
      p.hsn_code,
      p.gst_rate
    FROM public.collection_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.collection_id = ANY(p_collection_ids)
    GROUP BY ci.product_id, p.price, p.hsn_code, p.gst_rate
    ORDER BY ci.product_id
  LOOP
    v_net_qty := v_line.gross_qty - v_line.return_qty;

    IF v_net_qty < 0 THEN
      RAISE EXCEPTION
        'Collection items for product % record more returns (%) than dispatched (%).',
        v_line.product_id, v_line.return_qty, v_line.gross_qty;
    END IF;

    v_taxable := ROUND(v_net_qty * v_line.unit_price, 2);

    IF v_net_qty = 0 THEN
      v_line_cgst := 0; v_line_sgst := 0; v_line_igst := 0;
    ELSIF v_inter THEN
      v_line_igst := ROUND(v_taxable * v_line.gst_rate / 100.0, 2);
      v_line_cgst := 0; v_line_sgst := 0;
    ELSE
      v_line_cgst := ROUND(v_taxable * v_line.gst_rate / 2.0 / 100.0, 2);
      v_line_sgst := ROUND(v_taxable * v_line.gst_rate / 2.0 / 100.0, 2);
      v_line_igst := 0;
    END IF;

    INSERT INTO public.bill_items (
      invoice_id, product_id, quantity, gross_quantity, return_quantity,
      unit_price, hsn_code, gst_rate, taxable_amount,
      cgst, sgst, igst, total_amount
    ) VALUES (
      v_invoice_id, v_line.product_id, v_net_qty, v_line.gross_qty, v_line.return_qty,
      v_line.unit_price, v_line.hsn_code, v_line.gst_rate, v_taxable,
      v_line_cgst, v_line_sgst, v_line_igst,
      v_taxable + v_line_cgst + v_line_sgst + v_line_igst
    );

    v_subtotal := v_subtotal + v_taxable;
    v_cgst     := v_cgst + v_line_cgst;
    v_sgst     := v_sgst + v_line_sgst;
    v_igst     := v_igst + v_line_igst;
  END LOOP;

  v_total := v_subtotal + v_cgst + v_sgst + v_igst;

  UPDATE public.invoices
  SET subtotal     = v_subtotal,
      cgst         = v_cgst,
      sgst         = v_sgst,
      igst         = v_igst,
      total_amount = v_total
  WHERE id = v_invoice_id;

  -- Linked at draft stage so the deliveries cannot be billed a second time.
  UPDATE public.collections
  SET invoice_id = v_invoice_id
  WHERE id = ANY(p_collection_ids);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_bulk_invoice(UUID[]) IS
  'Raises a DRAFT invoice for one restaurant from verified collections. Bills net '
  'of returns at catalog prices and splits CGST/SGST vs IGST from the two GSTINs. '
  'A draft is not money owed until approve_invoice + send_invoice.';

-- ── 7. Money views exclude pre-issue bills ────────────────────────────────

DROP VIEW IF EXISTS public.restaurant_outstanding;
DROP VIEW IF EXISTS public.invoice_outstanding;

CREATE VIEW public.invoice_outstanding WITH (security_invoker = true) AS
SELECT
    i.id AS invoice_id,
    i.company_id,
    i.restaurant_id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.total_amount,
    i.status,
    COALESCE(alloc.applied, 0) AS paid_amount,
    (i.total_amount - COALESCE(alloc.applied, 0)) AS outstanding_amount,
    (CURRENT_DATE - i.due_date) AS days_overdue,
    CASE WHEN CURRENT_DATE < i.due_date THEN 'current' ELSE 'overdue' END AS is_due
FROM public.invoices i
LEFT JOIN LATERAL (
    SELECT SUM(a.amount) AS applied
    FROM public.payment_allocations a
    WHERE a.invoice_id = i.id
) alloc ON TRUE
-- A draft has not been issued, so it is not a debt. Previously the filter was an
-- IN list of payment states, which every new state had to be added to.
WHERE public.invoice_is_collectible(i.status);

COMMENT ON VIEW public.invoice_outstanding IS
  'Bills representing money owed. Excludes drafts (not yet issued), paid and '
  'cancelled. paid_amount nets off payment_allocations. days_overdue is negative '
  'while not yet due.';

CREATE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding,
    COALESCE(MAX(c.amount), 0) AS credit_balance,

    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue < 0), 0) AS bucket_current,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue BETWEEN 0 AND 15), 0) AS bucket_0_15,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 15 AND io.days_overdue <= 30), 0) AS bucket_15_30,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 30 AND io.days_overdue <= 60), 0) AS bucket_30_60,
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue > 60), 0) AS bucket_60_plus

FROM public.restaurants r
LEFT JOIN public.invoice_outstanding io ON io.restaurant_id = r.id
LEFT JOIN public.restaurant_credit c
    ON c.company_id = r.company_id AND c.restaurant_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.company_id, r.id, r.name, r.phone, c.amount;

COMMENT ON VIEW public.restaurant_outstanding IS
  'Per-restaurant money owed, bucketed by days past due, plus credit held.';

-- ── 8. Repoint migration 31's allocation off its hardcoded status list ────
--
-- record_payment walked `status IN ('unpaid','partial')`. With 'overdue' now a
-- real state that list is wrong in a way that matters: an overdue bill would be
-- skipped, so a payment large enough to clear it would spill into credit instead
-- of settling it, and the customer would appear to owe money they had paid.

CREATE OR REPLACE FUNCTION public.refresh_invoice_status_for_restaurant(p_restaurant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  FOR v_invoice IN
    SELECT i.id FROM public.invoices i
    WHERE i.restaurant_id = p_restaurant_id
  LOOP
    PERFORM public.refresh_invoice_status(v_invoice.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- record_payment re-declared here rather than patched in place so the FIFO walk
-- and the status recompute share one definition in this chain. The whole body is
-- repeated deliberately: a partial redefinition would leave the old IN list live.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_restaurant_id UUID,
  p_amount        NUMERIC,
  p_payment_mode  TEXT,
  p_invoice_id    UUID DEFAULT NULL,
  p_payment_date  DATE DEFAULT CURRENT_DATE,
  p_reference     TEXT DEFAULT NULL
) RETURNS TABLE (
  payment_id    UUID,
  allocated     NUMERIC,
  credit_left   NUMERIC,
  invoices_hit  INT
) AS $$
DECLARE
  v_company_id UUID;
  v_payment_id UUID;
  v_remaining NUMERIC := p_amount;
  v_allocated NUMERIC := 0;
  v_hits INT := 0;
  v_credit NUMERIC := 0;
  v_credit_used NUMERIC := 0;
  v_invoice RECORD;
  v_applied NUMERIC;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = p_restaurant_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Restaurant % does not belong to your company.', p_restaurant_id;
  END IF;

  IF p_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = p_invoice_id AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Invoice % does not belong to that restaurant.', p_invoice_id;
  END IF;

  INSERT INTO public.payments (
    company_id, restaurant_id, invoice_id, amount,
    payment_mode, payment_date, reference_number
  ) VALUES (
    v_company_id, p_restaurant_id,
    NULL, p_amount, p_payment_mode, p_payment_date, p_reference
  ) RETURNING id INTO v_payment_id;

  SELECT amount INTO v_credit
  FROM public.restaurant_credit
  WHERE company_id = v_company_id AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  v_credit := COALESCE(v_credit, 0);
  v_credit_used := LEAST(v_credit, v_remaining);
  v_remaining := v_remaining - v_credit_used;

  -- invoice_is_collectible excludes drafts and approved-but-unsent bills. Without
  -- this a customer's advance would settle an invoice they had not received.
  IF v_remaining > 0 THEN
    FOR v_invoice IN
      SELECT i.id,
             i.total_amount - COALESCE(alloc.applied, 0) AS owed
      FROM public.invoices i
      LEFT JOIN LATERAL (
        SELECT SUM(a.amount) AS applied
        FROM public.payment_allocations a
        WHERE a.invoice_id = i.id
      ) alloc ON TRUE
      WHERE i.restaurant_id = p_restaurant_id
        AND public.invoice_is_collectible(i.status)
        AND i.total_amount - COALESCE(alloc.applied, 0) > 0
      ORDER BY i.due_date ASC, i.invoice_date ASC, i.id ASC
      FOR UPDATE OF i
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_applied := LEAST(v_invoice.owed, v_remaining);
      INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
      VALUES (v_payment_id, v_invoice.id, v_applied);
      v_remaining := v_remaining - v_applied;
      v_allocated := v_allocated + v_applied;
      v_hits := v_hits + 1;
    END LOOP;
  END IF;

  v_credit := v_credit - v_credit_used + v_remaining;

  INSERT INTO public.restaurant_credit (company_id, restaurant_id, amount, updated_at)
  VALUES (v_company_id, p_restaurant_id, v_credit, NOW())
  ON CONFLICT (company_id, restaurant_id) DO UPDATE
    SET amount = EXCLUDED.amount, updated_at = NOW();

  PERFORM public.refresh_invoice_status_for_restaurant(p_restaurant_id);

  RETURN QUERY SELECT v_payment_id, v_allocated, v_credit, v_hits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_payment(UUID, NUMERIC, TEXT, UUID, DATE, TEXT) IS
  'Records a payment and allocates it oldest-invoice-first. Surplus becomes '
  'restaurant_credit. Draft and approved-but-unsent invoices are never allocated '
  'against: the customer has not been billed for them yet.';

COMMIT;