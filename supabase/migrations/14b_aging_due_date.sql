-- 14b_aging_due_date.sql
--
-- Re-points the ageing views at invoices.due_date.
--
-- WHY A SEPARATE FILE, AND WHY IT DEFINES due_date ITSELF
-- due_date belongs to 29_billing_correctness.sql, but this file is numbered 14b
-- so the views are correct as soon as they exist. The apparent contradiction --
-- 29 also adds due_date -- is resolved by IF NOT EXISTS here plus the same
-- statement in 29: whichever runs first creates the column, and the second is a
-- no-op. An existing database that already ran 29 therefore applies this cleanly
-- too.
--
-- The alternative (reading due_date from 14, or re-defining these views again in
-- 29) both fail: 14 runs long before the column exists, so the chain errors out
-- on a clean database.
--
-- What changes, and why it matters:
--   * days_overdue is measured from due_date, not invoice_date. The original
--     definition computed CURRENT_DATE - invoice_date and then called the column
--     "days_overdue", so a bill dated today on 30-day terms was reported as
--     0-15 days overdue when nothing was due yet. Every downstream figure --
--     the outstanding page, the ageing report, the dashboard -- inherited it.
--   * money that is not yet due is reported separately in bucket_current.
--     Previously it landed in bucket_0_15, making that bucket meaningless as a
--     measure of delinquency.
--
-- Idempotent: safe to re-run.

BEGIN;

-- Same definition as 29_billing_correctness.sql section 0, including the
-- backfill, so this migration is self-sufficient on its own.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date DATE;

UPDATE public.invoices i
SET due_date = i.invoice_date + COALESCE(r.payment_terms_days, 15)
FROM public.restaurants r
WHERE r.id = i.restaurant_id
  AND i.due_date IS NULL;

-- A restaurant row is guaranteed by the FK, so anything still NULL is orphaned
-- data rather than a missing term.
UPDATE public.invoices
SET due_date = invoice_date + 15
WHERE due_date IS NULL;

ALTER TABLE public.invoices ALTER COLUMN due_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);

-- DROP before CREATE, not CREATE OR REPLACE.
-- Postgres will not let CREATE OR REPLACE change a view column's NAME, only its
-- type. The new definition inserts due_date and is_due in the middle of the
-- column list, so every later ordinal shifts and the replacement fails with
-- 'cannot change name of view column'. Any consumer using SELECT * breaks
-- loudly rather than silently reading a shifted column, so there is nothing to
-- preserve. All of this runs inside the migration's transaction, so the old view
-- is restored automatically if the CREATE fails.
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
    COALESCE(SUM(p.amount), 0) AS paid_amount,
    (i.total_amount - COALESCE(SUM(p.amount), 0)) AS outstanding_amount,
    -- Negative means not yet due. Kept signed rather than clamped so the
    -- bucket filters can distinguish "not yet due" from "due today".
    (CURRENT_DATE - i.due_date) AS days_overdue,
    CASE WHEN CURRENT_DATE < i.due_date THEN 'current' ELSE 'overdue' END AS is_due
FROM public.invoices i
LEFT JOIN public.payments p ON i.id = p.invoice_id
GROUP BY i.id;

COMMENT ON VIEW public.invoice_outstanding IS
  'Open invoice balances. days_overdue is measured from due_date and is negative while not yet due.';

CREATE VIEW public.restaurant_outstanding WITH (security_invoker = true) AS
SELECT
    r.company_id,
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.phone,
    COUNT(io.invoice_id) FILTER (WHERE io.outstanding_amount > 0) AS unpaid_invoice_count,
    COALESCE(SUM(io.outstanding_amount) FILTER (WHERE io.outstanding_amount > 0), 0) AS total_outstanding,

    -- Invoiced but still inside the payment term. Not overdue, and deliberately
    -- kept out of bucket_0_15.
    COALESCE(SUM(io.outstanding_amount) FILTER (
        WHERE io.outstanding_amount > 0 AND io.days_overdue < 0), 0) AS bucket_current,

    -- Days past due.
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
    ON r.id = io.restaurant_id
   AND io.status IN ('unpaid', 'partial')
GROUP BY r.company_id, r.id, r.name, r.phone;

COMMENT ON VIEW public.restaurant_outstanding IS
  'Per-restaurant outstanding, bucketed by days past due. bucket_current is not yet due.';

COMMIT;