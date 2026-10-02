-- 27_rpc_authorization.sql
--
-- SECURITY DEFINER functions run as their owner, which bypasses Row Level
-- Security. That makes every one of them responsible for its own authorisation.
--
-- None of them checked the caller's role. They verified only that a company_id was
-- present in the JWT, so:
--
--   * a `revoked` user could still call record_collection() and write data —
--     `revoked` was enforced exclusively by a client-side route guard
--   * any agent could call add_stock() and generate_bulk_invoice(), even though
--     the RLS policies for those tables restrict writes to owner/manager and
--     owner/accountant respectively
--
-- This adds a single role assertion and applies it to every mutating definer
-- function, with the allowed sets taken from the corresponding RLS policies in
-- 02_rls_policies.sql so the database and the UI agree.
--
-- Idempotent.

-- ── 1. The shared assertion ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_role(p_allowed TEXT[])
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := public.get_user_role();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no role claim in token.';
  END IF;

  -- Revoked is never permitted, even if a caller tried to allow it.
  IF v_role = 'revoked' THEN
    RAISE EXCEPTION 'Not authorized: this account''s access has been revoked.';
  END IF;

  IF NOT (v_role = ANY (p_allowed)) THEN
    RAISE EXCEPTION 'Not authorized: role % may not perform this action.', v_role;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.assert_role(TEXT[]) IS
  'Raises unless the caller''s JWT role is one of the allowed values. Required in every SECURITY DEFINER function, because the definer''s rights bypass RLS.';

-- ── 2. record_collection ───────────────────────────────────────────
-- Allowed: owner, manager, agent. Matches
-- agent_manager_owner_modify_collections.

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
  PERFORM public.assert_role(ARRAY['owner', 'manager', 'agent']);

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

  -- The restaurant must belong to the caller's company, not merely exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = p_restaurant_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Restaurant % does not belong to your company.', p_restaurant_id;
  END IF;

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

    -- Products must be this company's too, otherwise a caller could book
    -- collections against another tenant's catalogue.
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND company_id = v_company_id
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to your company.', v_product_id;
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

-- ── 3. add_stock ───────────────────────────────────────────────────
-- Allowed: owner, manager. Matches manager_owner_modify_inventory.

CREATE OR REPLACE FUNCTION public.add_stock(p_product_id UUID, p_quantity NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);

  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be non-zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Product % does not belong to your company.', p_product_id;
  END IF;

  -- The inventory_quantity_check constraint is the real floor; this turns a bare
  -- constraint violation into something an operator can act on.
  IF p_quantity < 0 AND NOT EXISTS (
    SELECT 1 FROM public.inventory
    WHERE product_id = p_product_id
      AND company_id = v_company_id
      AND quantity + p_quantity >= 0
  ) THEN
    RAISE EXCEPTION 'Cannot remove that much: it would take stock below zero.';
  END IF;

  INSERT INTO public.inventory (company_id, product_id, quantity, last_updated)
  VALUES (v_company_id, p_product_id, p_quantity, NOW())
  ON CONFLICT (company_id, product_id)
  DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity,
                last_updated = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. generate_bulk_invoice ───────────────────────────────────────
-- Allowed: owner, accountant. Matches accountant_owner_modify_invoices.

CREATE OR REPLACE FUNCTION public.generate_bulk_invoice(
  p_collection_ids UUID[]
) RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_restaurant_id UUID;
  v_period TEXT;
  v_seq INT;
  v_invoice_number TEXT;
  v_subtotal DECIMAL(12,2) := 0;
  v_cgst DECIMAL(12,2) := 0;
  v_sgst DECIMAL(12,2) := 0;
  v_total DECIMAL(12,2) := 0;
  v_item RECORD;
  v_item_cgst DECIMAL(12,2);
  v_item_sgst DECIMAL(12,2);
  v_invoice_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'accountant']);

  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  -- array_length returns NULL (not 0) for an empty array, so it must be coalesced
  -- or `NULL = 0` never fires and the function proceeds to insert a NULL
  -- restaurant_id, surfacing as a bare NOT NULL violation.
  IF COALESCE(array_length(p_collection_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No collections selected.';
  END IF;

  SELECT restaurant_id INTO v_restaurant_id
  FROM public.collections
  WHERE id = p_collection_ids[1];

  FOR v_item IN
    SELECT * FROM public.collections
    WHERE id = ANY(p_collection_ids)
  LOOP
    IF v_item.company_id != v_company_id THEN
      RAISE EXCEPTION 'Collection % does not belong to your company.', v_item.id;
    END IF;
    IF v_item.restaurant_id != v_restaurant_id THEN
      RAISE EXCEPTION 'All collections must belong to the same restaurant.';
    END IF;
    IF v_item.status != 'verified' THEN
      RAISE EXCEPTION 'Collection % is not verified.', v_item.id;
    END IF;
    IF v_item.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Collection % is already invoiced.', v_item.id;
    END IF;
  END LOOP;

  v_period := TO_CHAR(CURRENT_DATE, 'YYYYMM');

  INSERT INTO public.invoice_sequences (company_id, period, last_value)
  VALUES (v_company_id, v_period, 1)
  ON CONFLICT (company_id, period) DO UPDATE
    SET last_value = public.invoice_sequences.last_value + 1
  RETURNING last_value INTO v_seq;

  v_invoice_number := 'INV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

  FOR v_item IN
    SELECT ci.amount, p.gst_rate
    FROM public.collection_items ci
    JOIN public.products p ON ci.product_id = p.id
    WHERE ci.collection_id = ANY(p_collection_ids)
  LOOP
    v_subtotal := v_subtotal + v_item.amount;

    v_item_cgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);
    v_item_sgst := ROUND((v_item.amount * (v_item.gst_rate / 2.0) / 100.0), 2);

    v_cgst := v_cgst + v_item_cgst;
    v_sgst := v_sgst + v_item_sgst;
  END LOOP;

  v_total := v_subtotal + v_cgst + v_sgst;

  INSERT INTO public.invoices (
    company_id, restaurant_id, invoice_number, invoice_date,
    subtotal, cgst, sgst, igst, total_amount, status
  ) VALUES (
    v_company_id, v_restaurant_id, v_invoice_number, CURRENT_DATE,
    v_subtotal, v_cgst, v_sgst, 0, v_total, 'unpaid'
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.collections
  SET invoice_id = v_invoice_id
  WHERE id = ANY(p_collection_ids);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Company and tax settings ────────────────────────────────────
-- Allowed: owner. Matches owner_update_company in 02_rls_policies.sql.

-- Parameter order must match the existing signature exactly: CREATE OR REPLACE
-- refuses to rename or reorder inputs (19_company_metadata.sql).
CREATE OR REPLACE FUNCTION public.update_company_profile(
  p_name TEXT,
  p_address TEXT,
  p_gst_number TEXT,
  p_logo_url TEXT
) RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.companies
  SET name = COALESCE(NULLIF(p_name, ''), name),
      gst_number = NULLIF(p_gst_number, ''),
      address = NULLIF(p_address, ''),
      logo_url = NULLIF(p_logo_url, '')
  WHERE id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_tax_settings(p_default_gst_rate NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_default_gst_rate < 0 OR p_default_gst_rate > 100 THEN
    RAISE EXCEPTION 'GST rate must be between 0 and 100.';
  END IF;

  UPDATE public.companies
  SET default_gst_rate = p_default_gst_rate
  WHERE id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. update_user_status ──────────────────────────────────────────
-- Allowed: owner. Without this, any authenticated user could revoke a peer.

-- p_user_id is TEXT, not UUID: profiles.id holds a Clerk id (migration 26). The
-- old signature took a UUID, so it could never match a real profile id.
CREATE OR REPLACE FUNCTION public.update_user_status(
  p_user_id TEXT,
  p_is_active BOOLEAN,
  p_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
  v_target_company UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_role IS NULL OR NOT (
    p_role IN ('owner', 'manager', 'agent', 'accountant', 'revoked')
  ) THEN
    RAISE EXCEPTION 'Invalid role: %', COALESCE(p_role, 'null');
  END IF;

  SELECT company_id INTO v_target_company
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target_company != v_company_id THEN
    RAISE EXCEPTION 'User not found in your company';
  END IF;

  -- An owner must not be able to revoke or demote themselves and lock the last
  -- owner out of the tenant.
  IF p_user_id = NULLIF(current_setting('request.jwt.claim.sub', true), '') THEN
    RAISE EXCEPTION 'You cannot change your own access.';
  END IF;

  -- The final active owner must be preserved.
  IF p_is_active = FALSE AND v_target_company = v_company_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE company_id = v_company_id AND role = 'owner' AND is_active AND id <> p_user_id
    ) THEN
      RAISE EXCEPTION 'At least one active owner must remain.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active,
      role = p_role
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;