-- 24_invoice_numbering.sql
--
-- Two defects in invoice numbering:
--
--   1. `invoice_sequences` was keyed on company_id alone, but the invoice number
--      embeds YYYYMM. A single per-company counter kept climbing across month
--      boundaries, so January's 5th invoice was followed by INV-<Feb>-0006
--      instead of restarting at 0001.
--
--   2. Nothing made `invoice_number` unique. Two code paths (or a race) could
--      produce the same number, and the duplicate would only be visible when a
--      human noticed two invoices with the same reference.
--
-- Idempotent: safe to run against a freshly reset database.

-- ── 1. Make the counter per company *and* per month ──────────────────

ALTER TABLE public.invoice_sequences
  ADD COLUMN IF NOT EXISTS period TEXT;

-- Seed each company's existing counter with the month of its most recent
-- invoice, so the running total is preserved rather than restarting.
UPDATE public.invoice_sequences s
SET period = COALESCE(
  (
    SELECT TO_CHAR(MAX(i.invoice_date), 'YYYYMM')
    FROM public.invoices i
    WHERE i.company_id = s.company_id
  ),
  TO_CHAR(CURRENT_DATE, 'YYYYMM')
)
WHERE s.period IS NULL;

-- Collapse any duplicate (company_id, period) rows that the backfill produced,
-- keeping the highest counter so no number is ever reissued.
DELETE FROM public.invoice_sequences a
USING public.invoice_sequences b
WHERE a.company_id = b.company_id
  AND a.period = b.period
  AND a.last_value < b.last_value;

ALTER TABLE public.invoice_sequences
  ALTER COLUMN period SET NOT NULL;

-- Primary key moves from company_id to (company_id, period).
ALTER TABLE public.invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_pkey;
ALTER TABLE public.invoice_sequences
  ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (company_id, period);

-- ── 2. Make the invoice number unique per company ────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_key
  ON public.invoices (company_id, invoice_number);

-- ── 3. Backfill sequences for companies that already have invoices but
--       no counter row, so the next invoice continues rather than colliding ──
--
-- The counter is read from the numeric suffix of INV-YYYYMM-NNNN, not from a row
-- count: invoices raised before this migration may have had gaps.

INSERT INTO public.invoice_sequences (company_id, period, last_value)
SELECT
  i.company_id,
  substr(i.invoice_number, 5, 6) AS period,
  MAX(split_part(i.invoice_number, '-', 3)::INT) AS last_value
FROM public.invoices i
WHERE i.invoice_number ~ '^INV-[0-9]{6}-[0-9]{4}$'
GROUP BY i.company_id, substr(i.invoice_number, 5, 6)
ON CONFLICT (company_id, period) DO UPDATE
  SET last_value = GREATEST(
    public.invoice_sequences.last_value,
    EXCLUDED.last_value
  );

-- ── 4. Reinstall the RPC with the corrected sequence allocation ──────

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
  v_total DECIMAL(12,2) := 0;
  v_item RECORD;
  v_item_cgst DECIMAL(12,2);
  v_item_sgst DECIMAL(12,2);
  v_invoice_id UUID;
BEGIN
  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  -- array_length returns NULL (not 0) for an empty array, so it must be coalesced
  -- or `NULL = 0` never fires and the function proceeds to insert a NULL
  -- restaurant_id, surfacing as a bare NOT NULL violation.
  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  -- The first collection establishes which restaurant this invoice is for; the
  -- loop then verifies the rest agree.
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  -- Verify all collections belong to the same restaurant, are verified, and are
  -- not already invoiced. Also assert the tenant, which the original version
  -- never checked: a caller could pass another company's collection ids.
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  FOR v_item IN
    SELECT * FROM public.collections
    WHERE id = ANY(p_collection_ids)
  LOOP
    IF v_item.company_id != v_company_id THEN
      RAISE EXCEPTION 'Collection % does not belong to your company.', v_item.id;
    END IF;
    IF v_item.restaurant_id != v_restaurant_id THEN
      RAISE EXCEPTION 'All collections must belong to the same restaurant.';
    END IF;
    IF v_item.status != 'verified' THEN
      RAISE EXCEPTION 'Collection % is not verified.', v_item.id;
    END IF;
    IF v_item.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Collection % is already invoiced.', v_item.id;
    END IF;
  END LOOP;

  -- Per (company, month) counter. ON CONFLICT covers both the first invoice of
  -- a period and two callers racing to create that period's row.
  v_period := TO_CHAR(CURRENT_DATE, 'YYYYMM');

  INSERT INTO public.invoice_sequences (company_id, period, last_value)
  VALUES (v_company_id, v_period, 1)
  ON CONFLICT (company_id, period) DO UPDATE
    SET last_value = public.invoice_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  v_invoice_number := 'INV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- Calculate totals line by line to prevent rounding drift.
  FOR v_item IN
    SELECT ci.amount, p.gst_rate
    FROM public.collection_items ci
    JOIN public.products p ON ci.product_id = p.id
    WHERE ci.collection_id = ANY(p_collection_ids)
  LOOP
    v_subtotal := v_subtotal + v_item.amount;

    v_item_cgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);
    v_item_sgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);

    v_cgst := v_cgst + v_item_cgst;
    v_sgst := v_sgst + v_item_sgst;
  END LOOP;

  v_total := v_subtotal + v_cgst + v_sgst;

  INSERT INTO public.invoices (
    company_id, restaurant_id, invoice_number, invoice_date,
    subtotal, cgst, sgst, igst, total_amount, status
  ) VALUES (
    v_company_id, v_restaurant_id, v_invoice_number, CURRENT_DATE,
    v_subtotal, v_cgst, v_sgst, 0, v_total, 'unpaid'
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.collections
  SET invoice_id = v_invoice_id
  WHERE id = ANY(p_collection_ids);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;