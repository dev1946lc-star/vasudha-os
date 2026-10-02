-- 06_collection_rpc.sql

-- Define a custom type to represent line items in the RPC
-- Alternatively, we can just parse JSONB. We'll parse JSONB.
-- jsonb structure: [{"product_id": "uuid", "quantity": 10.5, "unit_price": 50.00}]

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
  v_unit_price DECIMAL;
  v_amount DECIMAL(12,2);
BEGIN
  -- 1. Get company and user IDs securely from token
  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  v_agent_id := public.current_user_id();
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  -- 2. Insert the Collection Header
  INSERT INTO public.collections (
    company_id, restaurant_id, agent_id, collection_date, status, notes, total_amount
  ) VALUES (
    v_company_id, p_restaurant_id, v_agent_id, CURRENT_DATE, 'completed', p_notes, 0
  ) RETURNING id INTO v_collection_id;

  -- 3. Loop through items and insert them
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::DECIMAL;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;
    
    -- Calculate exact amount per line
    v_amount := v_quantity * v_unit_price;
    v_total_amount := v_total_amount + v_amount;

    -- Insert line item
    INSERT INTO public.collection_items (
      collection_id, product_id, quantity, price_per_unit, amount
    ) VALUES (
      v_collection_id, v_product_id, v_quantity, v_unit_price, v_amount
    );

    -- Increment Inventory Atomically
    INSERT INTO public.inventory (company_id, product_id, quantity, last_updated)
    VALUES (v_company_id, v_product_id, v_quantity, NOW())
    ON CONFLICT (company_id, product_id) 
    DO UPDATE SET 
      quantity = inventory.quantity + EXCLUDED.quantity,
      last_updated = NOW();
      
  END LOOP;

  -- 4. Update the Header with the strictly calculated total
  UPDATE public.collections 
  SET total_amount = v_total_amount 
  WHERE id = v_collection_id;

  RETURN v_collection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
