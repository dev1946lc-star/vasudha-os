-- 10_auto_invoicing.sql

-- 1. Table for sequence generation per company
CREATE TABLE public.invoice_sequences (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_value INT NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;
-- No policies needed since it's only modified by SECURITY DEFINER triggers

-- 2. Ensure 1-to-1 relationship between Collection and Invoice
ALTER TABLE public.invoices ADD CONSTRAINT unique_collection_invoice UNIQUE (collection_id);

-- 3. Trigger Function for Auto Invoicing
CREATE OR REPLACE FUNCTION public.process_auto_invoicing()
RETURNS TRIGGER AS $$
DECLARE
  v_seq INT;
  v_invoice_number TEXT;
  v_subtotal DECIMAL(12,2) := 0;
  v_cgst DECIMAL(12,2) := 0;
  v_sgst DECIMAL(12,2) := 0;
  v_total DECIMAL(12,2) := 0;
  v_item RECORD;
  v_item_cgst DECIMAL(12,2);
  v_item_sgst DECIMAL(12,2);
BEGIN
  -- Trigger invoicing when the collection is officially verified
  IF TG_OP = 'UPDATE' AND NEW.status = 'verified' AND OLD.status != 'verified' THEN
    
    -- Check if invoice already exists
    IF EXISTS (SELECT 1 FROM public.invoices WHERE collection_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Get next sequence value atomically
    UPDATE public.invoice_sequences 
    SET last_value = last_value + 1 
    WHERE company_id = NEW.company_id 
    RETURNING last_value INTO v_seq;

    IF v_seq IS NULL THEN
      INSERT INTO public.invoice_sequences (company_id, last_value) 
      VALUES (NEW.company_id, 1) 
      RETURNING last_value INTO v_seq;
    END IF;

    -- Format: INV-YYYYMM-0001
    v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- Calculate Subtotal and GST accurately per line item to avoid rounding drift
    FOR v_item IN 
      SELECT ci.amount, p.gst_rate 
      FROM public.collection_items ci
      JOIN public.products p ON ci.product_id = p.id
      WHERE ci.collection_id = NEW.id
    LOOP
      v_subtotal := v_subtotal + v_item.amount;
      
      -- Assuming intra-state (CGST = 50%, SGST = 50% of total GST rate)
      -- ROUND to 2 decimal places precisely
      v_item_cgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);
      v_item_sgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);
      
      v_cgst := v_cgst + v_item_cgst;
      v_sgst := v_sgst + v_item_sgst;
    END LOOP;

    v_total := v_subtotal + v_cgst + v_sgst;

    -- Insert the Invoice
    INSERT INTO public.invoices (
      company_id, restaurant_id, collection_id, invoice_number, invoice_date,
      subtotal, cgst, sgst, igst, total_amount, status
    ) VALUES (
      NEW.company_id, NEW.restaurant_id, NEW.id, v_invoice_number, CURRENT_DATE,
      v_subtotal, v_cgst, v_sgst, 0, v_total, 'unpaid'
    );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach Trigger
DROP TRIGGER IF EXISTS trigger_auto_invoicing ON public.collections;
CREATE TRIGGER trigger_auto_invoicing
  AFTER UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.process_auto_invoicing();
