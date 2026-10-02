-- 14_aging_analysis.sql

-- 1. Enhance Invoice Outstanding View to include days_overdue
--
--    NOTE: kept on invoice_date here because that is what this migration has
--    always done, and 14 runs before due_date exists (migration 29). Do NOT treat
--    days_overdue below as days past due -- it is invoice age.
--    14b_aging_due_date.sql supersedes both views and re-bases the whole chain on
--    invoices.due_date. If you are reading this to understand ageing, read 14b.
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
    (i.total_amount - COALESCE(SUM(p.amount), 0)) AS outstanding_amount,
    (CURRENT_DATE - i.invoice_date) AS days_overdue
FROM public.invoices i
LEFT JOIN public.payments p ON i.id = p.invoice_id
GROUP BY i.id;

-- 2. Enhance Restaurant Outstanding View to include Aging Buckets
--
--    Superseded by 14b_aging_due_date.sql, which adds bucket_current and measures
--    from due_date.
CREATE OR REPLACE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding,

    -- Aging Buckets (invoice age; see the note above)
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0 AND io.days_overdue <= 15), 0) AS bucket_0_15,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0 AND io.days_overdue > 15 AND io.days_overdue <= 30), 0) AS bucket_15_30,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0 AND io.days_overdue > 30 AND io.days_overdue <= 60), 0) AS bucket_30_60,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0 AND io.days_overdue > 60), 0) AS bucket_60_plus

FROM public.restaurants r
LEFT JOIN public.invoice_outstanding io ON r.id = io.restaurant_id AND io.status IN ('unpaid', 'partial')
GROUP BY r.company_id, r.id, r.name, r.phone;
