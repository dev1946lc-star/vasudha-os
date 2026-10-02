-- 25_stock_deduction_ordering.sql
--
-- Stock was never deducted on dispatch.
--
-- process_inventory_on_collection_completion() is an AFTER trigger on
-- `collections` that iterates that collection's `collection_items`. But
-- record_collection() inserted the header row already marked 'completed', so the
-- trigger fired on that INSERT â€” before a single line item existed. It iterated
-- an empty set and deducted nothing. Containers dispatched off a truck never left
-- the inventory balance, and nothing errored to signal it.
--
-- The fix is ordering: create the header as 'draft', insert the items, then
-- transition to 'completed'. The trigger's UPDATE branch fires once the items are
-- in place.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.record_collection(
  p_restaurant_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_agent_id TEXT;
  v_collection_id UUID;
  v_total_amount DECIMAL(12,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity DECIMAL;
  v_return_quantity DECIMAL;
  v_unit_price DECIMAL;
  v_amount DECIMAL(12,2);
BEGIN
  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  v_agent_id := public.current_user_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. No user identity in token.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required.';
  END IF;

  -- 'draft' first, so the deduction trigger does not fire before the items exist.
  INSERT INTO public.collections (
    company_id, restaurant_id, agent_id, collection_date, status, notes, total_amount
  ) VALUES (
    v_company_id, p_restaurant_id, v_agent_id, CURRENT_DATE, 'draft', p_notes, 0
  ) RETURNING id INTO v_collection_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := COALESCE((v_item->>'quantity')::DECIMAL, 0);
    v_return_quantity := COALESCE((v_item->>'return_quantity')::DECIMAL, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::DECIMAL, 0);

    IF v_quantity < 0 OR v_return_quantity < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative.';
    END IF;

    v_amount := v_quantity * v_unit_price;
    v_total_amount := v_total_amount + v_amount;

    INSERT INTO public.collection_items (
      collection_id, product_id, quantity, return_quantity, price_per_unit, amount
    ) VALUES (
      v_collection_id, v_product_id, v_quantity, v_return_quantity, v_unit_price, v_amount
    );
  END LOOP;

  UPDATE public.collections
  SET total_amount = v_total_amount,
      status = 'completed'
  WHERE id = v_collection_id;

  RETURN v_collection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Repairs rows written before this fix. Every collection already marked
-- 'completed' whose items never touched inventory needs the deduction applied
-- once.
--
-- Reconstructing the intended stock level is not possible without a historical
-- snapshot, so this only surfaces the affected rows rather than guessing:
--
--   SELECT id, collection_date, total_quantity
--   FROM   public.collections
--   WHERE  status = 'completed'
--     AND  collection_date < CURRENT_DATE
--   ORDER  BY collection_date;
--
-- Newly recorded collections are correct from here on.

-- â”€â”€ 2. Rewrite the deduction trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--
-- The previous version used INSERT ... ON CONFLICT (company_id, product_id) DO
-- UPDATE. That never worked: Postgres evaluates the CHECK constraint on the row
-- proposed by the INSERT branch (-quantity) *before* the conflict is resolved and
-- DO UPDATE runs, so `inventory_quantity_check` rejected the insert and the
-- dispatch failed outright. Read-modify-write under a row lock instead, which
-- also serialises concurrent dispatches of the same product.
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
          'Cannot dispatch product % â€” it has no stock record. Add stock first.',
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

DROP TRIGGER IF EXISTS auto_stock_deduction_trigger ON public.collections;
CREATE TRIGGER auto_stock_deduction_trigger
  AFTER INSERT OR UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.process_inventory_on_collection_completion();