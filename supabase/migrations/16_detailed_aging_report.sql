-- 16_detailed_aging_report.sql

CREATE OR REPLACE VIEW public.detailed_aging_report WITH (security_invoker = true) AS
SELECT 
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    io.invoice_id,
    io.invoice_number,
    io.invoice_date,
    io.outstanding_amount,
    io.days_overdue,
    CASE 
        WHEN io.days_overdue <= 15 THEN '0-15 Days'
        WHEN io.days_overdue <= 30 THEN '16-30 Days'
        WHEN io.days_overdue <= 60 THEN '31-60 Days'
        ELSE '60+ Days'
    END AS aging_bucket
FROM public.restaurants r
JOIN public.invoice_outstanding io ON r.id = io.restaurant_id
WHERE io.outstanding_amount > 0
ORDER BY r.name ASC, io.days_overdue DESC;
