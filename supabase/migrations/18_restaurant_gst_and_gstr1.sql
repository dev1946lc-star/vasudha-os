-- 18_restaurant_gst_and_gstr1.sql

-- 1. Add GST Number to Restaurants (needed for B2B classification)
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS gst_number TEXT;

-- 2. Create GSTR-1 outward supplies view
CREATE OR REPLACE VIEW public.gstr1_report WITH (security_invoker = true) AS
SELECT 
    i.id,
    i.company_id,
    COALESCE(NULLIF(r.gst_number, ''), 'URP') AS recipient_gstin, -- URP = Unregistered Person (B2C)
    r.name AS receiver_name,
    i.invoice_number,
    i.invoice_date,
    i.total_amount AS invoice_value,
    i.subtotal AS taxable_value,
    i.cgst,
    i.sgst,
    i.igst
FROM public.invoices i
JOIN public.restaurants r ON i.restaurant_id = r.id
WHERE i.status != 'cancelled'
ORDER BY i.invoice_date DESC, i.invoice_number DESC;
