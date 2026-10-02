-- 23_invoice_status_correctness.sql
--
-- Applies the corrected invoice status logic from 12_invoice_status_trigger.sql
-- to databases provisioned before that fix. Idempotent.

-- 1. Extract the per-invoice recomputation into its own function, and make
--    'cancelled' terminal. Previously any payment mutation against a cancelled
--    invoice reset it to paid/partial/unpaid, silently resurrecting it.
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
  FROM public.payments
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

-- 2. Recompute both the previous and the new invoice when a payment is moved
--    between invoices. The old version only looked at NEW.invoice_id, so moving a
--    payment left the source invoice still marked 'paid'.
CREATE OR REPLACE FUNCTION public.update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  v_old_invoice_id UUID;
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_invoice_id := OLD.invoice_id;
    v_invoice_id := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_invoice_id := OLD.invoice_id;
    v_invoice_id := NEW.invoice_id;
  ELSE
    v_old_invoice_id := NULL;
    v_invoice_id := NEW.invoice_id;
  END IF;

  IF v_invoice_id IS NULL AND v_old_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.refresh_invoice_status(v_invoice_id);
  IF v_old_invoice_id IS DISTINCT FROM v_invoice_id THEN
    PERFORM public.refresh_invoice_status(v_old_invoice_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_invoice_status ON public.payments;
CREATE TRIGGER trigger_invoice_status
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_status();

-- 3. Backfill. Rows written before this fix may carry a status that no longer
--    matches their payment total (for example an invoice still marked 'paid'
--    after its only payment was reassigned). Recompute every invoice once.
CREATE OR REPLACE FUNCTION public.refresh_all_invoice_statuses()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.invoices WHERE status <> 'cancelled'
  LOOP
    PERFORM public.refresh_invoice_status(r.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT public.refresh_all_invoice_statuses();
DROP FUNCTION public.refresh_all_invoice_statuses();