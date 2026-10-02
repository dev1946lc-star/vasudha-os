-- 12_invoice_status_trigger.sql

CREATE OR REPLACE FUNCTION public.update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  v_old_invoice_id UUID;
  v_invoice_id UUID;
BEGIN
  -- Determine which invoices were affected based on operation.
  -- An UPDATE can move a payment from one invoice to another, in which case both
  -- need recomputing: leaving the previous invoice at 'paid' after its payment
  -- was moved away would understate what the customer owes.
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

  -- Loose payments with no invoice linked have nothing to recompute.
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

-- Recomputes one invoice's status from the sum of its payments.
--
-- 'cancelled' is terminal: a cancelled invoice is never silently resurrected by a
-- later payment being recorded or removed. The caller must clear it explicitly.
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

  -- Invoice no longer exists.
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

-- Attach the trigger to fire on all payment mutations
DROP TRIGGER IF EXISTS trigger_invoice_status ON public.payments;
CREATE TRIGGER trigger_invoice_status
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_status();