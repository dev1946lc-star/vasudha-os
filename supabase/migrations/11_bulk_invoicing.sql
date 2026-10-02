-- 11_bulk_invoicing.sql

-- 1. Drop the automatic 1-to-1 trigger
DROP TRIGGER IF EXISTS trigger_auto_invoicing ON public.collections;
DROP FUNCTION IF EXISTS public.process_auto_invoicing();

-- 2. Refactor Relationships (One Invoice -> Many Collections)
-- Remove collection_id from invoices
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS unique_collection_invoice;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS collection_id;

-- Add invoice_id to collections
ALTER TABLE public.collections ADD COLUMN invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 4. Invoice numbers must be unique per company; nothing enforced this before.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_key
  ON public.invoices (company_id, invoice_number);

-- 5. Create Bulk Invoicing RPC Function
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
  -- restaurant_id.
  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  -- The first collection establishes which restaurant this invoice is for; the
  -- loop then verifies the rest agree.
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  -- Verify all collections belong to the same restaurant, are verified, and are
  -- not already invoiced. Also assert the tenant, which the original version never
  -- checked: a caller could pass another company's collection ids.
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

  -- Generate the sequence number for this company *and this calendar month*.
  --
  -- The counter is keyed on (company_id, period) because the invoice number
  -- embeds YYYYMM; a single per-company counter would keep climbing across month
  -- boundaries and produce INV-202602-0031 instead of restarting at 0001.
  --
  -- ON CONFLICT handles both the first invoice of a period and two concurrent
  -- callers racing on a period that does not exist yet, without the duplicate-key
  -- error a plain INSERT would raise.
  v_period := TO_CHAR(CURRENT_DATE, 'YYYYMM');

  INSERT INTO public.invoice_sequences (company_id, period, last_value)
  VALUES (v_company_id, v_period, 1)
  ON CONFLICT (company_id, period) DO UPDATE
    SET last_value = public.invoice_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  v_invoice_number := 'INV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- Calculate Totals line by line to prevent rounding drift
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

  -- Insert Invoice
  INSERT INTO public.invoices (
    company_id, restaurant_id, invoice_number, invoice_date,
    subtotal, cgst, sgst, igst, total_amount, status
  ) VALUES (
    v_company_id, v_restaurant_id, v_invoice_number, CURRENT_DATE,
    v_subtotal, v_cgst, v_sgst, 0, v_total, 'unpaid'
  ) RETURNING id INTO v_invoice_id;

  -- Link Collections
  UPDATE public.collections 
  SET invoice_id = v_invoice_id 
  WHERE id = ANY(p_collection_ids);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
