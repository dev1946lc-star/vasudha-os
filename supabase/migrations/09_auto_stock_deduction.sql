-- 09_auto_stock_deduction.sql

-- 1. Ensure inventory cannot go negative (unless we explicitly drop this constraint later)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_quantity_check'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_quantity_check CHECK (quantity >= 0);
  END IF;
END;
$$;

-- 2. Create the Database Trigger Function for Auto Stock Deduction
CREATE OR REPLACE FUNCTION public.process_inventory_on_collection_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_current_qty DECIMAL(10,2);
  v_new_qty DECIMAL(10,2);
BEGIN
  -- We only process when the collection becomes 'completed'
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
    
    -- Loop through all items in this collection
    FOR v_item IN SELECT * FROM public.collection_items WHERE collection_id = NEW.id
    LOOP
      -- Read the balance with a row lock so two concurrent dispatches of the same
      -- product cannot both read the pre-deduction quantity and oversell.
      SELECT quantity INTO v_current_qty
      FROM public.inventory
      WHERE company_id = NEW.company_id AND product_id = v_item.product_id
      FOR UPDATE;

      -- No stock record yet: the product has never been stocked.
      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Cannot dispatch product % — it has no stock record. Add stock first.',
          v_item.product_id;
      END IF;

      -- Dispatch subtracts, collected returns add.
      v_new_qty := v_current_qty - v_item.quantity + COALESCE(v_item.return_quantity, 0);

      -- Raised explicitly so the operator sees which product ran out. Letting the
      -- CHECK constraint fail instead produces a bare "violates check constraint"
      -- with no indication of the cause.
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

-- 3. Attach the trigger to collections
DROP TRIGGER IF EXISTS auto_stock_deduction_trigger ON public.collections;
CREATE TRIGGER auto_stock_deduction_trigger
  AFTER INSERT OR UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.process_inventory_on_collection_completion();
