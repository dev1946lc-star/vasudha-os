-- 26_clerk_identity.sql
--
-- The schema was written for Supabase Auth, but the application authenticates
-- with Clerk. Clerk user ids are strings like `user_2abcDEF...`, not UUIDs, which
-- broke the primary identity path in two places:
--
--   * `INSERT INTO profiles (id, ...)` failed with
--     "invalid input syntax for type uuid: user_2abcDEF..."
--   * `record_collection()` failed the same way, because `auth.uid()` returns
--     the JWT `sub` claim — the Clerk id — and Supabase casts it to uuid.
--
-- In other words staff could not be added, and no agent could record a
-- collection. Clerk is the identity authority here, so its ids are what the
-- schema should store.
--
-- This migration:
--   1. makes profiles.id and collections.agent_id TEXT
--   2. drops the foreign key to auth.users, which Clerk does not populate
--   3. adds public.current_user_id(), which reads the raw `sub` claim as text
--      instead of going through auth.uid()'s uuid cast
--
-- Idempotent.

-- ── 1 & 2: TEXT identity ────────────────────────────────────────────

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_agent_id_fkey;

ALTER TABLE public.collections
  ALTER COLUMN agent_id TYPE TEXT USING agent_id::TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- The FK is restored now that both sides are TEXT.
ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_agent_id_fkey;
ALTER TABLE public.collections
  ADD CONSTRAINT collections_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- ── 3: read the Clerk id as text ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '');
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.current_user_id() IS
  'The Clerk user id from the JWT sub claim. Returns NULL when unauthenticated.';

-- ── 4: Retire the Supabase Auth metadata trigger ────────────────────
--
-- 01_jwt_claims.sql attached a trigger that copied role/company_id into
-- auth.users.raw_app_meta_data. Under Clerk that table is never written, so the
-- trigger did nothing useful — and once profiles.id became TEXT it became actively
-- harmful, firing on every profile write and failing with "operator does not
-- exist: uuid = text", which aborted the whole insert.
DROP TRIGGER IF EXISTS on_profile_change_sync_metadata ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_to_app_metadata();

-- ── 5: Repoint the RPCs that used auth.uid() ─────────────────────────

CREATE OR REPLACE FUNCTION public.setup_company_and_profile(
  p_company_name TEXT,
  p_gst_number TEXT,
  p_address TEXT,
  p_user_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
  v_user_id TEXT;
BEGIN
  v_user_id := public.current_user_id();
  v_company_id := (NULLIF(current_setting('request.jwt.claim.app_metadata', true)::jsonb ->> 'company_id', ''))::UUID;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  -- TEXT, not auth.uid(): the sub claim is a Clerk id, which auth.uid() cannot cast.
  v_agent_id := public.current_user_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. Missing company_id in token.';
  END IF;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized. No user identity in token.';
  END IF;

  IF public.get_user_role() = 'revoked' THEN
    RAISE EXCEPTION 'Unauthorized: Revoked users cannot record collections.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required.';
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

-- ── 6: Clerk metadata sync ──────────────────────────────────────────
--
-- 01_jwt_claims.sql wrote role/company_id into auth.users.raw_app_meta_data,
-- which is the Supabase-Auth mechanism. Under Clerk that table is never updated,
-- so the trigger silently did nothing and every JWT carried no company_id —
-- meaning RLS resolved get_company_id() to NULL and denied every query.
--
-- Clerk exposes privateMetadata / publicMetadata through its own API, which
-- Supabase cannot call. What it *can* do is keep a mirror table in step, and the
-- Next.js server can copy it onto the Clerk user on sign-in (see
-- scripts/setup-clerk-jwt.mjs and src/lib/session-claims.ts).

CREATE TABLE IF NOT EXISTS public.clerk_metadata (
  clerk_user_id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  -- Mirrored alongside role so the table is a complete picture of authorisation
  -- state. Without it a reader could assume the mirror tells the whole story while
  -- revocation is invisible in it.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clerk_metadata ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_clerk_metadata(
  p_user_id TEXT,
  p_company_id UUID,
  p_role TEXT,
  p_is_active BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.clerk_metadata (clerk_user_id, company_id, role, is_active)
  VALUES (p_user_id, p_company_id, p_role, COALESCE(p_is_active, TRUE))
  ON CONFLICT (clerk_user_id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep the mirror in step whenever a profile changes. This is the replacement
-- for the auth.users trigger, which cannot work under Clerk.
CREATE OR REPLACE FUNCTION public.sync_profile_to_clerk_metadata()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.sync_clerk_metadata(
    NEW.id::TEXT,
    NEW.company_id,
    NEW.role,
    COALESCE(NEW.is_active, TRUE)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_change_sync_clerk_metadata ON public.profiles;
CREATE TRIGGER on_profile_change_sync_clerk_metadata
  AFTER INSERT OR UPDATE OF role, company_id, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_clerk_metadata();

-- Backfill the mirror for profiles that predate this migration.
INSERT INTO public.clerk_metadata (clerk_user_id, company_id, role, is_active)
SELECT id::TEXT, company_id, role, COALESCE(is_active, TRUE) FROM public.profiles
ON CONFLICT (clerk_user_id) DO UPDATE
  SET company_id = EXCLUDED.company_id,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();