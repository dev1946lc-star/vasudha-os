-- 04_inventory_rpc.sql

-- Add a unique constraint to the inventory table so we can safely UPSERT by product per company
ALTER TABLE public.inventory ADD CONSTRAINT inventory_company_product_key UNIQUE (company_id, product_id);

-- Function to safely increment stock atomically
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id UUID,
  p_quantity DECIMAL
) RETURNS void AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Get the company_id from the user's JWT claim
  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  -- Upsert the inventory row
  INSERT INTO public.inventory (company_id, product_id, quantity, last_updated)
  VALUES (v_company_id, p_product_id, p_quantity, NOW())
  ON CONFLICT (company_id, product_id) 
  DO UPDATE SET 
    quantity = inventory.quantity + EXCLUDED.quantity,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
