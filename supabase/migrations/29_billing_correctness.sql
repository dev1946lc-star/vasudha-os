-- 29_billing_correctness.sql
--
-- Fixes three defects that made issued invoices wrong. All three are silent:
-- the invoice looks plausible, so nobody notices until a customer disputes it.
--
-- 1. RETURNS WERE BILLED IN FULL.
--    generate_bulk_invoice() summed collection_items.amount, which is
--    quantity * price_per_unit -- the dispatched quantity. return_quantity only
--    ever credited *stock* (migration 25), so an agent recording "delivered 20,
--    returned 5" billed the restaurant for 20 while 15 cans left the warehouse.
--
-- 2. THERE WAS NO DUE DATE.
--    restaurants.payment_terms_days was written by the restaurant form and read
--    by the Rust API, then never used. Aging ran off CURRENT_DATE - invoice_date
--    and labelled the result "days_overdue", so a bill dated today with 30-day
--    terms reported as 0-15 days / current. Every downstream number inherited it.
--
-- 3. GST WAS INTRA-STATE BY ASSUMPTION.
--    igst was the literal 0 and cgst/sgst were amount * rate / 2 / 100, with the
--    source comment "Assuming intra-state". No GSTIN was ever read. The spec's
--    acceptance criterion is "matches manual verification to the paisa", which
--    this fails for any inter-state sale.
--
-- Design notes
-- ------------
-- bill_items is new and deliberately a snapshot: hsn_code, unit_price, gst_rate
-- and the tax split are copied onto the line at issue time. Without it there is
-- nowhere to store a *net* line (quantity minus returns), which is why fix 1
-- could not be done in place.
--
-- Prices are re-read from products, never taken from the client. record_collection
-- accepts a client-supplied unit_price today; this migration makes the invoice
-- authoritative so a tampered form cannot set the price.
--
-- GST state detection: a GSTIN's first two digits are the state code. Both
-- parties are compared; a mismatch means inter-state supply, so the whole amount
-- takes IGST at the full rate. An unregistered or absent restaurant GSTIN is
-- treated as intra-state, which matches how an unregistered B2C buyer is billed.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── 0. due_date must exist before the views that read it ─────────────────
--
-- Ordering matters. 14_aging_analysis.sql was rewritten to measure days overdue
-- from due_date and to separate not-yet-due money, but that view cannot be
-- created until this column exists. So the column and its backfill go first.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill from the restaurant's own terms. COALESCE 15 matches the column
-- default and the fallback used in generate_bulk_invoice.
UPDATE public.invoices i
SET due_date = i.invoice_date + COALESCE(r.payment_terms_days, 15)
FROM public.restaurants r
WHERE r.id = i.restaurant_id
  AND i.due_date IS NULL;

-- A restaurant row is guaranteed by the FK, so anything still NULL is orphaned
-- data rather than a missing term. Fall back to the same 15 days rather than
-- leaving the NOT NULL to fail on an existing database.
UPDATE public.invoices
SET due_date = invoice_date + 15
WHERE due_date IS NULL;

ALTER TABLE public.invoices ALTER COLUMN due_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);

-- ── 1. bill_items: a net, immutable snapshot per invoice line ──────────────

CREATE TABLE IF NOT EXISTS public.bill_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES public.products(id),
  -- Net of returns: what the customer is actually charged for.
  quantity          DECIMAL(10,2) NOT NULL,
  gross_quantity    DECIMAL(10,2) NOT NULL,
  return_quantity   DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_price        DECIMAL(10,2) NOT NULL,
  hsn_code          TEXT,
  -- Rate and split snapshotted so a later rate change cannot rewrite history.
  gst_rate          DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxable_amount    DECIMAL(12,2) NOT NULL,
  cgst              DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst              DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst              DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(12,2) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_items_invoice ON public.bill_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product ON public.bill_items(product_id);

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- Lines are readable by anyone who can read the parent invoice. Bill items are
-- written only by generate_bulk_invoice (SECURITY DEFINER), never directly.
DROP POLICY IF EXISTS bill_items_read ON public.bill_items;
CREATE POLICY bill_items_read ON public.bill_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = bill_items.invoice_id
      AND i.company_id = public.get_company_id()
  ));

DROP POLICY IF EXISTS bill_items_admin ON public.bill_items;
CREATE POLICY bill_items_admin ON public.bill_items
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('owner', 'accountant'))
  WITH CHECK (public.get_user_role() IN ('owner', 'accountant'));

-- ── 3. GST state helpers ──────────────────────────────────────────────────
--
-- The first two digits of a GSTIN are the state code. Comparing the two parties
-- is how you decide CGST+SGST (intra) vs IGST (inter).

-- A real GSTIN is 15 characters: 2 state digits, 10 PAN, then 1 entity code,
-- 1 'Z', 1 checksum. Anything shorter cannot carry a state code, so the length
-- is checked before the digits are cast -- otherwise a truncated value like '27'
-- yields a confident-looking 27 and splits the tax the wrong way.
CREATE OR REPLACE FUNCTION public.gst_state_code(p_gstin TEXT)
RETURNS INT AS $$
  SELECT CASE
    WHEN p_gstin IS NULL OR length(trim(p_gstin)) < 15 THEN NULL
    WHEN substring(trim(p_gstin) FROM 1 FOR 2) ~ '^[0-9]{2}$'
      THEN substring(trim(p_gstin) FROM 1 FOR 2)::INT
    ELSE NULL
  END;
$$ LANGUAGE SQL IMMUTABLE;

COMMENT ON FUNCTION public.gst_state_code(TEXT) IS
  'The two-digit state code at the head of a well-formed 15-char GSTIN, or NULL.';

-- TRUE when the supply leaves the state. Falls back to intra-state when either
-- party has no usable GSTIN, which is how an unregistered B2C buyer is billed.
CREATE OR REPLACE FUNCTION public.is_inter_state_supply(
  p_company_gstin TEXT,
  p_restaurant_gstin TEXT
) RETURNS BOOLEAN AS $$
  SELECT
    public.gst_state_code(p_company_gstin) IS NOT NULL
    AND public.gst_state_code(p_restaurant_gstin) IS NOT NULL
    AND public.gst_state_code(p_company_gstin) <> public.gst_state_code(p_restaurant_gstin);
$$ LANGUAGE SQL IMMUTABLE;

COMMENT ON FUNCTION public.is_inter_state_supply(TEXT, TEXT) IS
  'TRUE when both GSTINs resolve to different state codes. Unknown GSTIN => intra-state.';

-- ── 4. Rewrite generate_bulk_invoice ──────────────────────────────────────
--
-- Changes, all of them bug fixes rather than new behaviour:
--   * bills NET of returns, per product, aggregated across collections
--   * writes a bill_items row per product line with a frozen tax split
--   * prices from products.price, ignoring the client's unit_price
--   * sets due_date from the restaurant's payment_terms_days
--   * CGST+SGST intra-state, IGST inter-state, from the two GSTINs
--   * still one restaurant per call; that is a separate gap (see TODO.md)

CREATE OR REPLACE FUNCTION public.generate_bulk_invoice(
  p_collection_ids UUID[]
) RETURNS UUID AS $$
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

  -- array_length returns NULL (not 0) for an empty array, so it must be coalesced
  -- or `NULL = 0` never fires and the function proceeds to insert a NULL
  -- restaurant_id, surfacing as a bare NOT NULL violation.
  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  -- Validate the whole selection before allocating a number, so a bad selection
  -- cannot burn a sequence value and leave a gap in the invoice series.
  FOR v_coll IN
    SELECT * FROM public.collections
    WHERE id = ANY(p_collection_ids)
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

  -- Terms, and both GSTINs, decide the tax treatment for every line.
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

  INSERT INTO public.invoices (
    company_id, restaurant_id, invoice_number, invoice_date, due_date,
    subtotal, cgst, sgst, igst, total_amount, status
  ) VALUES (
    v_company_id, v_restaurant_id, v_invoice_number, CURRENT_DATE, v_due_date,
    0, 0, 0, 0, 0, 'unpaid'
  ) RETURNING id INTO v_invoice_id;

  -- One line per product across the whole selection, net of returns.
  FOR v_line IN
    SELECT
      ci.product_id,
      SUM(ci.quantity)                                        AS gross_qty,
      SUM(COALESCE(ci.return_quantity, 0))                    AS return_qty,
      -- Price comes from the catalog, never from the submitted form.
      p.price                                                 AS unit_price,
      p.hsn_code,
      p.gst_rate
    FROM public.collection_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.collection_id = ANY(p_collection_ids)
    GROUP BY ci.product_id, p.price, p.hsn_code, p.gst_rate
    ORDER BY ci.product_id
  LOOP
    v_net_qty := v_line.gross_qty - v_line.return_qty;

    -- Fully returned lines are not billed, but they are still recorded so the
    -- invoice shows what came back. A zero-taxable line is legal and intentional.
    IF v_net_qty < 0 THEN
      RAISE EXCEPTION
        'Collection items for product % record more returns (% ) than dispatched (%).',
        v_line.product_id, v_line.return_qty, v_line.gross_qty;
    END IF;

    v_taxable := ROUND(v_net_qty * v_line.unit_price, 2);

    IF v_net_qty = 0 THEN
      v_line_cgst := 0; v_line_sgst := 0; v_line_igst := 0;
    ELSIF v_inter THEN
      -- Inter-state: the full rate is IGST. No CGST/SGST.
      v_line_igst := ROUND(v_taxable * v_line.gst_rate / 100.0, 2);
      v_line_cgst := 0; v_line_sgst := 0;
    ELSE
      -- Intra-state: the rate splits evenly between centre and state.
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

  -- The invoice totals are the sum of the lines, so the header can never drift
  -- from the items an accountant can actually see.
  v_total := v_subtotal + v_cgst + v_sgst + v_igst;

  UPDATE public.invoices
  SET subtotal    = v_subtotal,
      cgst        = v_cgst,
      sgst        = v_sgst,
      igst        = v_igst,
      total_amount = v_total
  WHERE id = v_invoice_id;

  UPDATE public.collections
  SET invoice_id = v_invoice_id
  WHERE id = ANY(p_collection_ids);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_bulk_invoice(UUID[]) IS
  'Issues one invoice for one restaurant from verified collections. Bills net of '
  'returns, prices from the catalog, and splits CGST/SGST vs IGST from the two GSTINs.';

-- ── 5. Aging on due_date, with a real "not yet due" bucket ────────────────
--
-- 14_aging_analysis.sql measured CURRENT_DATE - invoice_date and called it
-- days_overdue. This re-bases it on due_date and separates invoices that are not
-- yet due, which the previous version folded into "0-15".

CREATE OR REPLACE VIEW public.invoice_aging AS
SELECT
  i.id,
  i.company_id,
  i.restaurant_id,
  r.name AS restaurant_name,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  i.total_amount - COALESCE(p.paid, 0) AS outstanding_amount,
  (CURRENT_DATE - i.due_date) AS days_overdue,
  CASE
    WHEN CURRENT_DATE < i.due_date                                THEN 'current'
    WHEN CURRENT_DATE - i.due_date <= 15                          THEN '0-15'
    WHEN CURRENT_DATE - i.due_date <= 30                          THEN '16-30'
    WHEN CURRENT_DATE - i.due_date <= 60                          THEN '31-60'
    ELSE '60+'
  END AS bucket
FROM public.invoices i
JOIN public.restaurants r ON r.id = i.restaurant_id
LEFT JOIN LATERAL (
  SELECT SUM(pay.amount) AS paid
  FROM public.payments pay
  WHERE pay.invoice_id = i.id
) p ON TRUE
WHERE i.status IN ('unpaid', 'partial');

COMMENT ON VIEW public.invoice_aging IS
  'Open invoices bucketed by days past due_date. ''current'' means not yet due.';

DROP VIEW IF EXISTS public.detailed_aging_report CASCADE;
CREATE OR REPLACE VIEW public.detailed_aging_report WITH (security_invoker = true) AS
SELECT
  a.company_id,
  a.restaurant_id,
  a.restaurant_name,
  COUNT(*)::INT          AS invoice_count,
  SUM(a.total_amount)    AS total_invoiced,
  SUM(a.outstanding_amount) AS total_outstanding,
  SUM(a.outstanding_amount) FILTER (WHERE a.bucket = 'current')  AS current_amount,
  SUM(a.outstanding_amount) FILTER (WHERE a.bucket = '0-15')    AS bucket_0_15,
  SUM(a.outstanding_amount) FILTER (WHERE a.bucket = '16-30')   AS bucket_16_30,
  SUM(a.outstanding_amount) FILTER (WHERE a.bucket = '31-60')   AS bucket_31_60,
  SUM(a.outstanding_amount) FILTER (WHERE a.bucket = '60+')     AS bucket_60_plus
FROM public.invoice_aging a
GROUP BY a.company_id, a.restaurant_id, a.restaurant_name;

COMMENT ON VIEW public.detailed_aging_report IS
  'Per-restaurant aging on days past due, with not-yet-due shown separately.';

COMMIT;