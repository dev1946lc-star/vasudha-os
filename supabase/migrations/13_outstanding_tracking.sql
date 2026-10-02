-- 13_outstanding_tracking.sql

-- 1. View for Invoice Level Outstanding
-- Calculates the exact outstanding amount per invoice by aggregating payments.
CREATE OR REPLACE VIEW public.invoice_outstanding WITH (security_invoker = true) AS
SELECT 
    i.id AS invoice_id,
    i.company_id,
    i.restaurant_id,
    i.invoice_number,
    i.invoice_date,
    i.total_amount,
    i.status,
    COALESCE(SUM(p.amount), 0) AS paid_amount,
    (i.total_amount - COALESCE(SUM(p.amount), 0)) AS outstanding_amount
FROM public.invoices i
LEFT JOIN public.payments p ON i.id = p.invoice_id
GROUP BY i.id;

-- 2. View for Restaurant Level Outstanding
-- Aggregates the unpaid/partial invoices to provide a single true outstanding balance per restaurant.
CREATE OR REPLACE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT 
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding
FROM public.restaurants r
LEFT JOIN public.invoice_outstanding io ON r.id = io.restaurant_id AND io.status IN ('unpaid', 'partial')
GROUP BY r.company_id, r.id, r.name, r.phone;
