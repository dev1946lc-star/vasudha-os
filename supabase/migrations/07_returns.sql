-- 07_returns.sql

-- Track empty-container returns alongside the dispatched quantity.
-- `returned_quantity` (created in 00) is superseded by this column; see
-- 22_cleanup_column_drift.sql for the cleanup on existing databases.
ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS return_quantity DECIMAL(10,2) DEFAULT 0;

-- Redefine record_collection() to persist and account for returns.
-- Note the column is `price_per_unit`, not `unit_price`; the JSONB payload key
-- stays `unit_price` because that is what the client form sends.
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

  -- Insert the header as 'draft' first.
  --
  -- This ordering is load-bearing. process_inventory_on_collection_completion()
  -- is an AFTER trigger on collections that reads the collection's
  -- collection_items. If the header were inserted directly as 'completed', the
  -- trigger would fire before any line items existed, iterate an empty set, and
  -- silently deduct nothing â€” stock would never move on dispatch. Inserting as
  -- 'draft', adding the items, then transitioning to 'completed' makes the
  -- trigger's UPDATE branch fire once the items are in place.
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
    
    -- Calculate exact amount per line
    v_amount := v_quantity * v_unit_price;
    v_total_amount := v_total_amount + v_amount;

    -- Insert line item with return_quantity
    INSERT INTO public.collection_items (
      collection_id, product_id, quantity, return_quantity, price_per_unit, amount
    ) VALUES (
      v_collection_id, v_product_id, v_quantity, v_return_quantity, v_unit_price, v_amount
    );
      
  END LOOP;

  -- Seal the collection. This transition is what fires the stock deduction.
  UPDATE public.collections 
  SET total_amount = v_total_amount,
      status = 'completed'
  WHERE id = v_collection_id;

  RETURN v_collection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
