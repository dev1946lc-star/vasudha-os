-- 31_advance_payments_and_batch_billing.sql
--
-- Two blockers that stop a distributor doing the thing they actually do: take a
-- lump-sum payment against several bills, and bill a whole period in one pass.
--
-- 1. PAYMENTS REQUIRED AN INVOICE, SO ADVANCES WERE IMPOSSIBLE.
--    payments.invoice_id was NOT NULL and the form disabled submit without an
--    unpaid invoice. In practice restaurants pay round figures against whatever
--    is outstanding -- 10,000 cash against four small bills, or before the period
--    is even billed. Both cases were unrepresentable. invoice_id is now
--    nullable, and an unallocated payment is money the restaurant is owed credit
--    for rather than money that has vanished.
--
-- 2. ALLOCATION WAS THE CALLER'S PROBLEM.
--    Even with an invoice selected, an overpayment was stranded: the surplus was
--    never carried to the next bill, and restaurant_outstanding filtered to
--    status IN ('unpaid','partial') so it silently disappeared from the money-owed
--    figures. record_payment() now allocates oldest-bill-first server-side, which
--    is also the accounting-correct treatment.
--
-- 3. BULK BILLING COULD ONLY DO ONE RESTAURANT PER CALL.
--    generate_bulk_invoice raised 'All collections must belong to the same
--    restaurant', so "200 bills in 15 minutes" meant 200 hand-driven calls.
--    generate_bulk_invoices_batch() groups by restaurant and issues one invoice
--    each.
--
-- Design notes
-- ------------
-- Credit is tracked per restaurant in restaurant_credit rather than inferred, so
-- it cannot be lost to a rounding edge or a filter. Allocation walks invoices
-- oldest-first by due_date then invoice_date, matching the spec's "applies to
-- oldest bill first (FIFO)".
--
-- A payment is recorded as ONE row. Allocation adds allocation rows rather than
-- splitting the payment, because the amount actually received is the thing a
-- receipt must report; the split is derived.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── 1. invoice_id becomes optional; credit is recorded, not lost ───────────

ALTER TABLE public.payments ALTER COLUMN invoice_id DROP NOT NULL;

COMMENT ON COLUMN public.payments.invoice_id IS
  'NULL for an advance payment. A non-NULL value records that the payment was '
  'matched to that bill; the FIFO split is derived in payment_allocations.';

-- Money the restaurant has paid that no invoice has absorbed yet.
CREATE TABLE IF NOT EXISTS public.restaurant_credit (
  company_id    UUID NOT NULL REFERENCES public.companies(id),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, restaurant_id)
);

COMMENT ON TABLE public.restaurant_credit IS
  'Unallocated credit per restaurant: advance payments not yet matched to an invoice.';

ALTER TABLE public.restaurant_credit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_credit_read ON public.restaurant_credit;
CREATE POLICY restaurant_credit_read ON public.restaurant_credit
  FOR SELECT TO authenticated
  USING (company_id = public.get_company_id());

DROP POLICY IF EXISTS restaurant_credit_write ON public.restaurant_credit;
CREATE POLICY restaurant_credit_write ON public.restaurant_credit
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'accountant'))
  WITH CHECK (public.get_user_role() IN ('owner', 'accountant'));

-- Which invoice each slice of a payment settled. Derived, never authoritative:
-- payments.amount is the amount actually received, which is what a receipt must
-- report.
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES public.invoices(id),
  amount       DECIMAL(12,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- A payment cannot allocate twice to the same invoice.
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON public.payment_allocations(invoice_id);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_allocations_read ON public.payment_allocations;
CREATE POLICY payment_allocations_read ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payments pay
    WHERE pay.id = payment_allocations.payment_id
      AND pay.company_id = public.get_company_id()
  ));

-- ── 2. record_payment(): one call, FIFO allocation, credit carry-over ──────

-- Parameter order is load-bearing: Postgres requires that once a parameter has a
-- default, every parameter after it must too. So the three required values come
-- first and the optional ones trail, even though p_invoice_id is the one callers
-- most often pass by name.
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

  -- A named invoice must belong to this restaurant. Otherwise a payment could be
  -- filed against someone else's bill and settle it.
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = p_invoice_id AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Invoice % does not belong to that restaurant.', p_invoice_id;
  END IF;

  -- invoice_id is written as NULL even when the caller named one. FIFO decides
  -- where the money actually lands, and the allocation rows record that. Filing
  -- the payment against a single invoice would let the sync trigger create a
  -- competing allocation and double-count it against that bill.
  INSERT INTO public.payments (
    company_id, restaurant_id, invoice_id, amount,
    payment_mode, payment_date, reference_number
  ) VALUES (
    v_company_id, p_restaurant_id,
    NULL, p_amount, p_payment_mode, p_payment_date, p_reference
  ) RETURNING id INTO v_payment_id;

  -- Spend any credit already on the account first. This is what makes a second
  -- advance payment settle an earlier one's obligations instead of stacking.
  SELECT amount INTO v_credit
  FROM public.restaurant_credit
  WHERE company_id = v_company_id AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  v_credit := COALESCE(v_credit, 0);

  IF v_credit > 0 AND v_remaining > 0 THEN
    IF v_credit >= v_remaining THEN
      v_remaining := v_remaining - v_credit;
      v_credit := 0;
    ELSE
      v_credit := v_credit - v_remaining;
      v_remaining := 0;
    END IF;
  END IF;

  -- Then walk open invoices oldest-first. due_date leads because that is what the
  -- customer sees on the statement; invoice_date breaks ties so the order is
  -- deterministic and a customer cannot have the same bill settle twice.
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
        AND i.status IN ('unpaid', 'partial')
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

  -- Whatever is left is credit the restaurant holds. Recording it is the whole
  -- point: the previous behaviour let a surplus vanish from the money-owed
  -- figures because the views filtered on status.
  v_credit := v_credit + v_remaining;

  INSERT INTO public.restaurant_credit (company_id, restaurant_id, amount, updated_at)
  VALUES (v_company_id, p_restaurant_id, v_credit, NOW())
  ON CONFLICT (company_id, restaurant_id) DO UPDATE
    SET amount = EXCLUDED.amount, updated_at = NOW();

  -- Statuses must reflect the allocations, or the outstanding pages disagree with
  -- the ledger. Recomputed for every invoice this payment touched.
  PERFORM public.refresh_invoice_status_for_restaurant(p_restaurant_id);

  RETURN QUERY SELECT v_payment_id, v_allocated, v_credit, v_hits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_payment(UUID, NUMERIC, TEXT, UUID, DATE, TEXT) IS
  'Records a payment and allocates it oldest-invoice-first. Surplus becomes '
  'restaurant_credit rather than disappearing. p_invoice_id may be NULL for an advance.';

-- Status recomputation for every open invoice of one restaurant. Extracted from
-- 23_invoice_status_correctness.sql's single-invoice version so allocation can
-- call it after touching several bills.
CREATE OR REPLACE FUNCTION public.refresh_invoice_status_for_restaurant(p_restaurant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  FOR v_invoice IN
    SELECT i.id,
           i.total_amount,
           i.status,
           COALESCE((SELECT SUM(a.amount) FROM public.payment_allocations a
                     WHERE a.invoice_id = i.id), 0) AS allocated
    FROM public.invoices i
    WHERE i.restaurant_id = p_restaurant_id
  LOOP
    -- cancelled is terminal: a cancelled bill must not be resurrected by a
    -- payment that lands after the fact.
    IF v_invoice.status = 'cancelled' THEN
      CONTINUE;
    END IF;

    IF v_invoice.allocated >= v_invoice.total_amount THEN
      UPDATE public.invoices SET status = 'paid' WHERE id = v_invoice.id;
    ELSIF v_invoice.allocated > 0 THEN
      UPDATE public.invoices SET status = 'partial' WHERE id = v_invoice.id;
    ELSE
      UPDATE public.invoices SET status = 'unpaid' WHERE id = v_invoice.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2b. One source of truth for "how much is settled" ─────────────────────
--
-- Before this, invoice status was computed from payments.invoice_id, while the
-- new views net off payment_allocations. Two answers to one question: a bill
-- settled by an advance payment would be 'unpaid' in the views and 'partial' in
-- the column, and any later payment touching that invoice would flip it back.
--
-- The rule settled on: payment_allocations is authoritative, and a payment that
-- names an invoice directly still produces an allocation via trigger. That keeps
-- the older code paths (which insert into payments with an invoice_id) working
-- and consistent instead of silently diverging.
--
-- Backfill first, so historical payments are not read as unpaid mid-migration.
INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
SELECT pay.id, pay.invoice_id, pay.amount
FROM public.payments pay
WHERE pay.invoice_id IS NOT NULL
ON CONFLICT (payment_id, invoice_id) DO NOTHING;

-- Direct inserts and updates of payments.invoice_id produce allocations, so code
-- that has not moved to record_payment() still settles the right bill.
CREATE OR REPLACE FUNCTION public.sync_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_amount NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_invoice_id := NEW.invoice_id;
    v_amount := NEW.amount;
    -- Moving a payment off an invoice withdraws the allocation it had there.
    IF OLD.invoice_id IS NOT NULL AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      DELETE FROM public.payment_allocations
      WHERE payment_id = NEW.id AND invoice_id = OLD.invoice_id;
    END IF;
  ELSE
    v_invoice_id := NEW.invoice_id;
    v_amount := NEW.amount;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
  VALUES (NEW.id, v_invoice_id, v_amount)
  ON CONFLICT (payment_id, invoice_id) DO UPDATE
    SET amount = EXCLUDED.amount;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_payment_allocation_trigger ON public.payments;
CREATE TRIGGER sync_payment_allocation_trigger
  AFTER INSERT OR UPDATE OF invoice_id, amount ON public.payments
  FOR EACH ROW
  WHEN (NEW.invoice_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_payment_allocation();

-- refresh_invoice_status now reads allocations, matching the views. The trigger
-- from 23_invoice_status_correctness.sql is kept as the single recompute path.
CREATE OR REPLACE FUNCTION public.refresh_invoice_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_paid DECIMAL(12,2);
  v_invoice_total DECIMAL(12,2);
  v_current_status TEXT;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT total_amount, status
    INTO v_invoice_total, v_current_status
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_current_status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payment_allocations
  WHERE invoice_id = p_invoice_id;

  IF v_total_paid >= v_invoice_total THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  ELSIF v_total_paid > 0 THEN
    UPDATE public.invoices SET status = 'partial' WHERE id = p_invoice_id;
  ELSE
    UPDATE public.invoices SET status = 'unpaid' WHERE id = p_invoice_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_invoice_status(UUID) IS
  'Recomputes one invoice status from payment_allocations, which is authoritative.';

-- Recompute every invoice so statuses agree with the backfilled allocations.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.invoices WHERE status <> 'cancelled' LOOP
    PERFORM public.refresh_invoice_status(r.id);
  END LOOP;
END;
$$;

-- ── 3. Views must count allocations and surface credit ────────────────────

-- invoice_outstanding previously netted off payments.invoice_id. With advance
-- payments the money sits in payment_allocations, so it has to net off those or
-- every bill reads as unpaid after being settled.
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
) alloc ON TRUE;

COMMENT ON VIEW public.invoice_outstanding IS
  'Open invoice balances. paid_amount nets off payment_allocations, so advance '
  'payments settle bills correctly. days_overdue is negative while not yet due.';

CREATE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding,

    -- What the restaurant has overpaid and is owed back, or is carrying forward
    -- toward the next bill. Previously a surplus simply vanished from these
    -- figures, which understated the liability.
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
LEFT JOIN public.invoice_outstanding io
    ON io.restaurant_id = r.id
   AND io.status IN ('unpaid', 'partial')
LEFT JOIN public.restaurant_credit c
    ON c.company_id = r.company_id AND c.restaurant_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.company_id, r.id, r.name, r.phone, c.amount;

COMMENT ON VIEW public.restaurant_outstanding IS
  'Per-restaurant outstanding bucketed by days past due, plus credit_balance held.';

-- ── 4. Batch billing across restaurants ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_bulk_invoices_batch(
  p_collection_ids UUID[]
) RETURNS TABLE (
  restaurant_id   UUID,
  restaurant_name TEXT,
  invoice_id      UUID,
  invoice_number  TEXT,
  total_amount    NUMERIC
) AS $$
DECLARE
  v_company_id UUID;
  v_group RECORD;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_total NUMERIC;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  -- One invoice per restaurant, which is what generate_bulk_invoice has always
  -- required. Grouping here is what turns 200 manual cycles into one call.
  --
  -- Collections that are unverified or already invoiced are skipped rather than
  -- aborting the batch: a billing run should not be blocked because one stop is
  -- still awaiting verification. The caller learns what was skipped from the
  -- returned row count.
  FOR v_group IN
    SELECT c.restaurant_id, r.name AS restaurant_name,
           array_agg(c.id) AS ids
    FROM public.collections c
    JOIN public.restaurants r ON r.id = c.restaurant_id
    WHERE c.id = ANY(p_collection_ids)
      AND c.company_id = v_company_id
      AND c.status = 'verified'
      AND c.invoice_id IS NULL
      AND r.deleted_at IS NULL
    GROUP BY c.restaurant_id, r.name
    ORDER BY c.restaurant_id
  LOOP
    -- generate_bulk_invoice does its own ownership, status and numbering checks,
    -- so re-implementing that logic here would be a second place to get wrong.
    v_invoice_id := public.generate_bulk_invoice(v_group.ids);

    SELECT i.invoice_number, i.total_amount
    INTO v_invoice_number, v_total
    FROM public.invoices i
    WHERE i.id = v_invoice_id;

    v_group.restaurant_id    := v_group.restaurant_id;
    restaurant_id            := v_group.restaurant_id;
    restaurant_name          := v_group.restaurant_name;
    invoice_id               := v_invoice_id;
    invoice_number           := v_invoice_number;
    total_amount             := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_bulk_invoices_batch(UUID[]) IS
  'Issues one invoice per distinct restaurant from verified collections. Returns '
  'a row per invoice issued; skipped collections produce no row.';

COMMIT;