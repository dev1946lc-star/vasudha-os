-- 22_cleanup_column_drift.sql
--
-- Brings databases that were provisioned before the earlier migrations were
-- corrected back in line with the intended schema. Every statement is
-- idempotent, so this is safe to run against a freshly reset database too.

-- 1. `collections.notes` was inserted into by record_collection() but never
--    declared on the table, so the RPC could not even be created.
ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. `collection_items.returned_quantity` was declared in 00 but never written
--    to. record_collection() writes `return_quantity` instead, and the stock
--    deduction trigger reads that same column, so the returned one is dead.
--    Dropping it requires the dependent trigger to be repointed first.
DROP TRIGGER IF EXISTS auto_stock_deduction_trigger ON public.collections;

ALTER TABLE public.collection_items
  DROP COLUMN IF EXISTS returned_quantity;

-- Guard against the possibility that return_quantity was never created because
-- 07 previously failed part-way through on a clean replay.
ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS return_quantity DECIMAL(10,2) DEFAULT 0;

-- 3. Repoint the stock deduction trigger at `return_quantity`, and read-modify-
--    write under a row lock. The previous INSERT ... ON CONFLICT DO UPDATE form
--    never worked: Postgres checks the CHECK constraint against the row proposed
--    by the INSERT branch before resolving the conflict, so a negative dispatch
--    failed the constraint and the dispatch aborted. See also
--    25_stock_deduction_ordering.sql, which documents this in full.
CREATE OR REPLACE FUNCTION public.process_inventory_on_collection_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_current_qty DECIMAL(10,2);
  v_new_qty DECIMAL(10,2);
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN

    FOR v_item IN SELECT * FROM public.collection_items WHERE collection_id = NEW.id
    LOOP
      SELECT quantity INTO v_current_qty
      FROM public.inventory
      WHERE company_id = NEW.company_id AND product_id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Cannot dispatch product % — it has no stock record. Add stock first.',
          v_item.product_id;
      END IF;

      v_new_qty := v_current_qty - v_item.quantity + COALESCE(v_item.return_quantity, 0);

      IF v_new_qty < 0 THEN
        RAISE EXCEPTION
          'Insufficient stock for product %: % on hand, % dispatched, % returned.',
          v_item.product_id, v_current_qty, v_item.quantity,
          COALESCE(v_item.return_quantity, 0);
      END IF;

      UPDATE public.inventory
      SET quantity = v_new_qty,
          last_updated = NOW()
      WHERE company_id = NEW.company_id AND product_id = v_item.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_stock_deduction_trigger
  AFTER INSERT OR UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.process_inventory_on_collection_completion();

-- 4. The collection state machine called public.auth_user_role(), which is
--    never defined, so neither the function nor its trigger could be created.
CREATE OR REPLACE FUNCTION public.enforce_collection_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  -- Service role and backend callers have no role claim; let them through.
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot edit a verified collection.';
  END IF;

  IF NEW.status = 'verified' AND OLD.status != 'verified' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Agents cannot verify collections.';
  END IF;

  IF OLD.status = 'completed' AND NEW.status = 'completed' AND v_role = 'agent' THEN
    RAISE EXCEPTION 'Unauthorized: Record is locked. Agents cannot edit completed collections.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS collection_state_machine_trigger ON public.collections;
CREATE TRIGGER collection_state_machine_trigger
  BEFORE UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_collection_state_machine();

-- 5. Foreign keys and the columns the API filters and sorts on have no indexes,
--    so every list page does a sequential scan.
CREATE INDEX IF NOT EXISTS idx_restaurants_company_name
  ON public.restaurants (company_id, name);
CREATE INDEX IF NOT EXISTS idx_products_company_name
  ON public.products (company_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_company_product
  ON public.inventory (company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_collections_company_date
  ON public.collections (company_id, collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_collections_restaurant_date
  ON public.collections (restaurant_id, collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection
  ON public.collection_items (collection_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_date
  ON public.payments (company_id, payment_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_company_date
  ON public.invoices (company_id, invoice_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_restaurant
  ON public.invoices (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice
  ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant
  ON public.payments (restaurant_id);