-- 28_jwt_claims_modern.sql
--
-- WHY
--   Every claim helper in this schema read the per-claim settings
--   request.jwt.claim.sub / request.jwt.claim.app_metadata. PostgREST used to
--   populate one GUC per top-level claim, but that was removed: modern PostgREST
--   (this project is served by postgrest/16.4) publishes exactly one setting,
--   request.jwt.claims, holding the whole payload as JSON.
--
--   So on the real hosted database every one of those reads returned NULL:
--     get_company_id()  -> NULL  -> every RLS policy matched no rows
--     get_user_role()   -> NULL  -> assert_role() raised 'Not authorized'
--     current_user_id() -> NULL  -> per-user RPCs had no caller
--   The symptom was "the Rust-backed pages work, everything Supabase-backed is
--   silently empty and every write fails".
--
--   It stayed hidden because scripts/db-regression.sql set the legacy settings by
--   hand, so the suite exercised a GUC layout PostgREST no longer produces.
--
-- WHAT THIS DOES
--   Introduces public.jwt_claim(name), the single supported way to read a claim,
--   and repoints all 13 claim-reading functions at it. No RPC logic changes; only
--   the expression that fetches the claim. Both helpers fall back to the legacy
--   settings if request.jwt.claims is absent, so a connection that still sets
--   them (older tooling, ad-hoc psql sessions) keeps working.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── Single supported claim accessor ────────────────────────────────────────────

-- The full verified JWT payload. '{}' when the request carried no token, which
-- keeps every '>>' below returning NULL rather than erroring.
CREATE OR REPLACE FUNCTION public.jwt_claims()
RETURNS JSONB AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::JSONB,
    '{}'::JSONB
  );
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.jwt_claims() IS
  'The whole JWT payload PostgREST verified for this request. Empty object when unauthenticated.';

-- One claim as JSONB, e.g. jwt_claim('sub'), jwt_claim('app_metadata').
-- NULL when the claim is absent or the request was unauthenticated.
CREATE OR REPLACE FUNCTION public.jwt_claim(p_name TEXT)
RETURNS JSONB AS $$
  SELECT public.jwt_claims() -> p_name;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.jwt_claim(TEXT) IS
  'A single claim from the verified JWT payload, or NULL when absent.';

-- ── Compatibility shim for the retired per-claim settings ───────────────────
--
-- Optional: if you would rather not ship a 13-function migration, defining
-- jwt_claims() to also set the two legacy settings at runtime keeps every
-- existing function working untouched. It needs pgrst.db_pre_request enabled,
-- which hosted Supabase does not allow, so it is NOT used here. Kept as a note
-- because it explains why the legacy names still appear in older migrations.
--
-- ── Repointed functions ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(public.jwt_claim('sub') #>> '{}', '');
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.jwt_claim('app_metadata') ->> 'role';
$function$
;

CREATE OR REPLACE FUNCTION public.get_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tax_settings(p_default_gst_rate numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_company_profile(p_name text, p_address text, p_gst_number text, p_logo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_status(p_user_id uuid, p_is_active boolean, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_company UUID;
  v_target_company UUID;
BEGIN
  v_caller_company := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
  v_caller_role := public.jwt_claim('app_metadata') ->> 'role';
  
  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;

  IF v_target_company != v_caller_company THEN
    RAISE EXCEPTION 'User not found in your company';
  END IF;

  UPDATE public.profiles 
  SET 
    is_active = p_is_active,
    role = p_role
  WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_revenue_trend(p_days integer)
 RETURNS TABLE(payment_date date, total_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    WITH DateSeries AS (
        -- Generate a series of the last N days to ensure no missing dates
        SELECT (CURRENT_DATE - (generate_series(0, p_days - 1) || ' days')::INTERVAL)::DATE AS d_date
    )
    SELECT 
        ds.d_date AS payment_date,
        COALESCE(SUM(p.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM DateSeries ds
    LEFT JOIN public.payments p 
        ON ds.d_date = p.payment_date 
        AND p.company_id = v_company_id
    GROUP BY ds.d_date
    ORDER BY ds.d_date ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_by_product(p_start date, p_end date)
 RETURNS TABLE(product_id uuid, product_name text, total_quantity numeric, total_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
    
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(SUM(ci.quantity), 0)::DECIMAL(10,2) AS total_quantity,
        COALESCE(SUM(ci.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM public.products p
    JOIN public.collection_items ci ON p.id = ci.product_id
    JOIN public.collections c ON ci.collection_id = c.id
    WHERE c.company_id = v_company_id
      AND c.status IN ('completed', 'verified')
      AND c.collection_date >= p_start 
      AND c.collection_date <= p_end
    GROUP BY p.id, p.name
    ORDER BY total_revenue DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_by_restaurant(p_start date, p_end date)
 RETURNS TABLE(restaurant_id uuid, restaurant_name text, total_quantity numeric, total_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
    
    RETURN QUERY
    SELECT 
        r.id AS restaurant_id,
        r.name AS restaurant_name,
        COALESCE(SUM(ci.quantity), 0)::DECIMAL(10,2) AS total_quantity,
        COALESCE(SUM(ci.amount), 0)::DECIMAL(12,2) AS total_revenue
    FROM public.restaurants r
    JOIN public.collections c ON r.id = c.restaurant_id
    JOIN public.collection_items ci ON c.id = ci.collection_id
    WHERE c.company_id = v_company_id
      AND c.status IN ('completed', 'verified')
      AND c.collection_date >= p_start 
      AND c.collection_date <= p_end
    GROUP BY r.id, r.name
    ORDER BY total_revenue DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.setup_company_and_profile(p_company_name text, p_gst_number text, p_address text, p_user_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_company_id UUID;
  v_user_id TEXT;
BEGIN
  v_user_id := public.current_user_id();
  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. No user identity in token.';
  END IF;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, gst_number, address)
    VALUES (p_company_name, p_gst_number, p_address)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO public.profiles (id, company_id, role, name)
  VALUES (v_user_id, v_company_id, 'owner', p_user_name)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        name = EXCLUDED.name;

  -- Propagate to the Clerk session so the app's layout can read company_id.
  PERFORM public.sync_clerk_metadata(v_user_id, v_company_id, 'owner');

  RETURN v_company_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_stock(p_product_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_company_id UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner', 'manager']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

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
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_status(p_user_id text, p_is_active boolean, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_company_id UUID;
  v_target_company UUID;
BEGIN
  PERFORM public.assert_role(ARRAY['owner']);

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
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
  IF p_user_id = NULLIF(public.jwt_claim('sub') #>> '{}', '') THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_collection(p_restaurant_id uuid, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_bulk_invoice(p_collection_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  v_company_id := (NULLIF(public.jwt_claim('app_metadata') ->> 'company_id', ''))::UUID;

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
$function$
;

COMMIT;
