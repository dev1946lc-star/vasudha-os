-- Test harness only. NOT part of the migration set.
--
-- Stands up the parts of a Supabase project that supabase/migrations/ assumes
-- already exist, so the migration chain can be replayed against a vanilla
-- postgres:16 container:
--
--   * the `auth` schema
--   * auth.users with raw_app_meta_data (01_jwt_claims.sql writes it)
--   * auth.uid(), which the RPC functions call
--
-- This is deliberately minimal — it is not a Supabase emulator.

-- ── The three roles PostgREST switches between per request ───────────
-- Supabase creates these on every project and the migration chain assumes they
-- exist. Without them the RLS checks at the end of db-regression.sql cannot run
-- as a real user, which is why this file was silent about them for so long:
-- every check used to run as the postgres superuser, which bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::JSONB ->> 'sub',
      current_setting('request.jwt.claim.sub', true)
    ),
    ''
  )::UUID;
$$ LANGUAGE SQL STABLE;

-- Supabase installs these on every project; the migrations lean on them.
CREATE EXTENSION IF NOT EXISTS pgcrypto;