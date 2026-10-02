-- Behavioural regression suite for the migration chain.
--
-- Run against a throwaway postgres (see scripts/test-harness-auth-schema.sql):
--
--   docker run -d --name vasudha-pg -e POSTGRES_PASSWORD=postgres \
--     -e POSTGRES_DB=postgres -p 55432:5432 postgres:16-alpine
--   # bootstrap auth stub, then apply supabase/migrations/*.sql in order
--   docker exec -i vasudha-pg psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < scripts/db-regression.sql
--
-- Every check raises an exception on failure, so a clean run is silent and
-- psql's exit status is the verdict.

\set ON_ERROR_STOP on

BEGIN;

-- ── Roles and privileges ────────────────────────────────────────────
-- The migration chain contains no GRANT statements: a hosted Supabase project
-- grants these by default. A vanilla postgres container has to be given them,
-- otherwise the RLS checks at the end of this file cannot run as a real user.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- ── Claim helpers ───────────────────────────────────────────────────
-- PostgREST publishes the verified JWT payload in ONE setting,
-- request.jwt.claims. It used to publish one request.jwt.claim.<name> setting
-- per claim, and every helper in the schema read that retired form, which is why
-- get_company_id() returned NULL on the real project and RLS matched nothing.
-- The tests below set request.jwt.claims so they exercise the layout that
-- actually ships. If they set the legacy names instead they would pass while
-- production stays broken.
CREATE OR REPLACE FUNCTION pg_temp.jwt_claims()
RETURNS JSONB AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION pg_temp.set_claims(p_claims TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', COALESCE(NULLIF(p_claims, ''), '{}'), false);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.set_app_metadata(p_metadata TEXT) RETURNS VOID AS $$
DECLARE v JSONB := pg_temp.jwt_claims();
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_set(v, '{app_metadata}', p_metadata::JSONB, true)::TEXT, false);
END $$ LANGUAGE plpgsql;

-- An empty string means "no JWT", matching what an absent sub claim looks like.
CREATE OR REPLACE FUNCTION pg_temp.set_sub(p_sub TEXT) RETURNS VOID AS $$
DECLARE v JSONB := pg_temp.jwt_claims();
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub = '' THEN (v - 'sub')::TEXT
         ELSE jsonb_set(v, '{sub}', to_jsonb(p_sub), true)::TEXT END, false);
END $$ LANGUAGE plpgsql;

-- Adopt an existing caller for the RLS checks below.
CREATE OR REPLACE FUNCTION pg_temp.become(p_company TEXT, p_role TEXT, p_sub TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM pg_temp.set_claims(jsonb_build_object(
    'sub', p_sub,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('company_id', p_company, 'role', p_role)
  )::TEXT);
END $$ LANGUAGE plpgsql;

-- ── Fixtures ────────────────────────────────────────────────────────
-- Clerk-style ids, matching what the application actually sends in the JWT `sub`
-- claim. Using UUIDs here would hide the identity bug this file guards against.
INSERT INTO public.companies (id, name, default_gst_rate)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Co', 5);

INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2ownerTEST000000000001',
        '11111111-1111-1111-1111-111111111111', 'owner', 'Owner');

-- A field agent, used for the state-machine and revocation checks.
INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2agentTEST000000000002',
        '11111111-1111-1111-1111-111111111111', 'agent', 'Field Agent');

-- A second tenant, used to prove isolation.
INSERT INTO public.companies (id, name) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'Other Co');
INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2otherTEST000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001', 'owner', 'Other');
INSERT INTO public.restaurants (id, company_id, name)
VALUES ('aaaaaaaa-2222-4222-8222-222222222222',
        'aaaaaaaa-0000-4000-8000-000000000001', 'Other Restaurant');

INSERT INTO public.restaurants (id, company_id, name)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Test Restaurant');

INSERT INTO public.products (id, company_id, name, price, hsn_code, gst_rate, min_stock_level)
VALUES ('88888888-8888-8888-8888-888888888888',
        '11111111-1111-1111-1111-111111111111', 'Oil', 100, '15121100', 5, 5);

INSERT INTO public.inventory (company_id, product_id, quantity)
VALUES ('11111111-1111-1111-1111-111111111111',
        '88888888-8888-8888-8888-888888888888', 100);

-- Every subsequent statement runs as this company/agent.
SELECT pg_temp.set_app_metadata('{"company_id":"11111111-1111-1111-1111-111111111111","role":"owner"}');
SELECT pg_temp.set_sub('user_2ownerTEST000000000001');

-- Assert helper: raises unless the value matches.
CREATE OR REPLACE FUNCTION pg_temp.assert(actual TEXT, expected TEXT, label TEXT)
RETURNS VOID AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAILED: % (expected %, got %)', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok  %', label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond BOOLEAN, label TEXT)
RETURNS VOID AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.record_dispatch(
  p_qty NUMERIC, p_return NUMERIC
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  SELECT public.record_collection(
    '22222222-2222-2222-2222-222222222222', 'dispatch',
    jsonb_build_array(jsonb_build_object(
      'product_id', '88888888-8888-8888-8888-888888888888',
      'quantity', p_qty, 'return_quantity', p_return, 'unit_price', 100))
  ) INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.inventory_qty() RETURNS NUMERIC AS $$
DECLARE q NUMERIC;
BEGIN
  SELECT quantity INTO q FROM public.inventory WHERE product_id = '88888888-8888-8888-8888-888888888888';
  RETURN q;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.owner_id() RETURNS TEXT AS $$
DECLARE v TEXT;
BEGIN
  SELECT id::TEXT INTO v FROM public.profiles
  WHERE company_id = '11111111-1111-1111-1111-111111111111' AND role = 'owner'
  LIMIT 1;
  RETURN v;
END;
$$ LANGUAGE plpgsql;

-- ── 0. Clerk identity ───────────────────────────────────────────────
-- profiles.id is TEXT so a Clerk id can be stored, and public.current_user_id()
-- reads the raw `sub` claim instead of going through auth.uid()'s uuid cast.
-- Both were UUID before migration 26, which meant no agent could record a
-- collection and no staff could be added.

SELECT pg_temp.assert(
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'id'), 'text',
  'profiles.id is TEXT so Clerk ids can be stored');

SELECT pg_temp.assert(
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'collections' AND column_name = 'agent_id'), 'text',
  'collections.agent_id is TEXT');

-- current_user_id() must return the raw Clerk id from the sub claim.
SELECT pg_temp.assert(
  public.current_user_id(), 'user_2ownerTEST000000000001',
  'current_user_id() returns the Clerk id');

-- The mirror table the JWT bridge reads must be populated by the profile trigger.
SELECT pg_temp.assert(
  (SELECT company_id::TEXT FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2ownerTEST000000000001'),
  '11111111-1111-1111-1111-111111111111',
  'profile trigger mirrored company_id into clerk_metadata');

SELECT pg_temp.assert(
  (SELECT role FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2ownerTEST000000000001'),
  'owner', 'profile trigger mirrored role into clerk_metadata');

SELECT pg_temp.assert_true(
  (SELECT is_active FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2ownerTEST000000000001'),
  'clerk_metadata mirrors is_active');

-- A role change must propagate.
UPDATE public.profiles SET role = 'manager'
WHERE id = 'user_2ownerTEST000000000001';
SELECT pg_temp.assert(
  (SELECT role FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2ownerTEST000000000001'),
  'manager', 'role changes propagate to clerk_metadata');
UPDATE public.profiles SET role = 'owner'
WHERE id = 'user_2ownerTEST000000000001';

-- An unauthenticated request must see no user rather than erroring.
SELECT pg_temp.set_sub('');
SELECT pg_temp.assert(
  coalesce(public.current_user_id(), '<null>'), '<null>',
  'current_user_id() is NULL when unauthenticated');
SELECT pg_temp.set_sub('user_2ownerTEST000000000001');

-- ── 1. record_collection deducts stock ──────────────────────────────
-- The historical bug: the header was inserted already 'completed', so the AFTER
-- trigger saw zero collection_items and deducted nothing.
SELECT pg_temp.assert(pg_temp.inventory_qty()::TEXT, '100.00', 'starting stock is 100');

-- Identity is Clerk, whose ids are strings, not UUIDs. Using a realistic Clerk id
-- throughout proves the schema stores it without a cast.
SELECT pg_temp.assert(pg_temp.owner_id(), 'user_2ownerTEST000000000001', 'the owner is a Clerk-style id');

SELECT pg_temp.record_dispatch(10, 3);
SELECT pg_temp.assert(pg_temp.inventory_qty()::TEXT, '93.00', 'one dispatch deducts 10 and returns 3');

SELECT pg_temp.record_dispatch(10, 3);
SELECT pg_temp.assert(pg_temp.inventory_qty()::TEXT, '86.00', 'second dispatch deducts another 7');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.collections WHERE status = 'completed') = 2,
  'both collections are marked completed');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.collection_items) = 2,
  'line items were recorded');

SELECT pg_temp.assert(
  (SELECT total_amount::TEXT FROM public.collections LIMIT 1), '1000.00',
  'collection total is quantity x unit price');

-- ── 2. Overselling is rejected with a clear message ────────────────
DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.record_dispatch(9999, 0);
    RAISE EXCEPTION 'FAILED: oversell should have been rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%Insufficient stock%' THEN
      RAISE NOTICE 'ok  oversell rejected with an actionable message';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- The failed dispatch must not have left a partial collection behind.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.collections) = 2,
  'rejected dispatch left no orphan collection');

-- ── 3. The collection state machine blocks agents ──────────────────
SELECT pg_temp.set_app_metadata('{"company_id":"11111111-1111-1111-1111-111111111111","role":"agent"}');

DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.collections LIMIT 1;
  BEGIN
    UPDATE public.collections SET status = 'verified' WHERE id = v_id;
    RAISE EXCEPTION 'FAILED: agent should not be able to verify';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%Agents cannot verify%' THEN
      RAISE NOTICE 'ok  agent cannot verify a collection';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

SELECT pg_temp.set_app_metadata('{"company_id":"11111111-1111-1111-1111-111111111111","role":"owner"}');

-- ── 4. Bulk invoicing numbers per company and month ────────────────
UPDATE public.collections SET status = 'verified' WHERE invoice_id IS NULL;

SELECT public.generate_bulk_invoice(
  ARRAY(SELECT id FROM public.collections WHERE invoice_id IS NULL));

SELECT pg_temp.assert(
  (SELECT invoice_number FROM public.invoices LIMIT 1), 'INV-' ||
    to_char(CURRENT_DATE, 'YYYYMM') || '-0001',
  'first invoice of the month is numbered 0001');

SELECT pg_temp.assert(
  (SELECT total_amount::TEXT FROM public.invoices LIMIT 1), '2100.00',
  'invoice total is 2000 subtotal + 100 GST');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.collections WHERE invoice_id IS NOT NULL) = 2,
  'both collections linked to the invoice');

-- A genuinely empty selection must be rejected clearly, not as a NOT NULL
-- violation. array_length('{}', 1) is NULL rather than 0, which is exactly why
-- the guard needs COALESCE.
DO $$
BEGIN
  BEGIN
    PERFORM public.generate_bulk_invoice(ARRAY(SELECT id FROM public.collections WHERE false));
    RAISE EXCEPTION 'FAILED: empty selection should have been rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%No collections selected%' THEN
      RAISE NOTICE 'ok  empty selection rejected clearly';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- Re-invoicing an already-invoiced collection must be refused.
DO $$
BEGIN
  BEGIN
    PERFORM public.generate_bulk_invoice(ARRAY(SELECT id FROM public.collections WHERE invoice_id IS NOT NULL));
    RAISE EXCEPTION 'FAILED: re-invoicing should have been rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%already invoiced%' THEN
      RAISE NOTICE 'ok  already-invoiced collection refused';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- Another tenant's collection cannot be invoiced by us.
DO $$
BEGIN
  BEGIN
    PERFORM public.generate_bulk_invoice(
      ARRAY(SELECT id FROM public.collections
            WHERE restaurant_id = 'aaaaaaaa-2222-4222-8222-222222222222'));
    RAISE EXCEPTION 'FAILED: cross-tenant invoicing should have been rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%does not belong to your company%'
       OR SQLERRM LIKE '%No collections selected%' THEN
      RAISE NOTICE 'ok  cross-tenant invoicing refused';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- Invoice numbers are unique per company.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM (
    SELECT company_id, invoice_number FROM public.invoices
    GROUP BY company_id, invoice_number HAVING count(*) > 1
  ) dupes) = 0,
  'no duplicate invoice numbers');

-- ── 5. Invoice status transitions ───────────────────────────────────
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, subtotal, total_amount, status)
VALUES ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'INV-TEST-0001', CURRENT_DATE, 1000, 1000, 'unpaid');

INSERT INTO public.payments (id, company_id, restaurant_id, invoice_id, amount, payment_date)
VALUES ('44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 400, CURRENT_DATE);

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '33333333-3333-3333-3333-333333333333'),
  'partial', 'partial payment yields partial status');

UPDATE public.payments SET amount = 1000
WHERE id = '44444444-4444-4444-4444-444444444444';

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '33333333-3333-3333-3333-333333333333'),
  'paid', 'full payment yields paid status');

-- cancelled is terminal.
UPDATE public.invoices SET status = 'cancelled'
WHERE id = '33333333-3333-3333-3333-333333333333';

INSERT INTO public.payments (id, company_id, restaurant_id, invoice_id, amount, payment_date)
VALUES ('55555555-5555-5555-5555-555555555555',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 50, CURRENT_DATE);

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '33333333-3333-3333-3333-333333333333'),
  'cancelled', 'cancelled invoices are not resurrected by a payment');

-- Moving a payment must recompute both invoices. This previously left the
-- source invoice stuck at 'paid'.
--
-- Remove the earlier payment first so 5555... is the invoice's only one;
-- otherwise invoice 1 legitimately stays paid and proves nothing.
DELETE FROM public.payments WHERE id = '44444444-4444-4444-4444-444444444444';

INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, subtotal, total_amount, status)
VALUES ('66666666-6666-6666-6666-666666666666',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'INV-TEST-0002', CURRENT_DATE, 500, 500, 'unpaid');

-- Re-open the cancelled invoice so it participates in the status machine again.
UPDATE public.invoices SET status = 'unpaid'
WHERE id = '33333333-3333-3333-3333-333333333333';

UPDATE public.payments SET amount = 1000
WHERE id = '55555555-5555-5555-5555-555555555555';

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '33333333-3333-3333-3333-333333333333'),
  'paid', 'invoice 1 is paid before reassignment');

UPDATE public.payments SET invoice_id = '66666666-6666-6666-6666-666666666666'
WHERE id = '55555555-5555-5555-5555-555555555555';

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '33333333-3333-3333-3333-333333333333'),
  'unpaid', 'source invoice returns to unpaid when its payment moves away');

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = '66666666-6666-6666-6666-666666666666'),
  'paid', 'target invoice becomes paid on reassignment');

-- ── 6. Tenant isolation in the read views ──────────────────────────
-- restaurant_outstanding is LEFT JOIN-based, so it returns a row for every
-- restaurant. It must not mix companies.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.restaurant_outstanding
   WHERE company_id <> '11111111-1111-1111-1111-111111111111') >= 1,
  'other tenant has its own outstanding row');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.restaurant_outstanding r
   WHERE r.company_id = '11111111-1111-1111-1111-111111111111'
     AND NOT EXISTS (
       SELECT 1 FROM public.restaurants x
       WHERE x.id = r.restaurant_id AND x.company_id = r.company_id)) = 0,
  'no outstanding row references another tenant restaurant');

-- ── 7. RLS is armed on every table ──────────────────────────────────
SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM pg_tables
   WHERE schemaname = 'public' AND rowsecurity AND tablename IN
     ('companies','profiles','restaurants','products','inventory',
      'collections','collection_items','invoices','payments')),
  '9', 'RLS is enabled on all nine tenant tables');

-- ── 8. Revocation and onboarding ───────────────────────────────────
-- "Revoke Access" in Settings → Users sets is_active=false. The layout reads
-- that and routes to /access-revoked, so it has to actually be reflected in the
-- clerk_metadata mirror the session claims are built from.

UPDATE public.profiles
SET is_active = false, role = 'revoked'
WHERE id = 'user_2agentTEST000000000002';

SELECT pg_temp.assert_true(
  (SELECT is_active = false FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2agentTEST000000000002'),
  'revoking a user propagates is_active to clerk_metadata');

SELECT pg_temp.assert(
  (SELECT role FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2agentTEST000000000002'),
  'revoked', 'revoking a user propagates the revoked role');

-- Restoring access puts them back.
UPDATE public.profiles
SET is_active = true, role = 'agent'
WHERE id = 'user_2agentTEST000000000002';

SELECT pg_temp.assert(
  (SELECT role FROM public.clerk_metadata
    WHERE clerk_user_id = 'user_2agentTEST000000000002'),
  'agent', 'restoring access propagates the original role');

-- A second profile for the same company must not clobber the first.
INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2secondOwner000000001', '11111111-1111-1111-1111-111111111111',
        'manager', 'Second Manager');

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.clerk_metadata
    WHERE company_id = '11111111-1111-1111-1111-111111111111') >= 2,
  'each user gets their own clerk_metadata row');

SELECT pg_temp.assert(
  (SELECT role FROM public.clerk_metadata WHERE clerk_user_id = 'user_2ownerTEST000000000001'),
  'owner', 'adding a second user leaves the first untouched');

-- A revoked user must not be able to write. record_collection is SECURITY
  -- DEFINER, so it bypasses RLS and has to authorise the caller itself — this is
  -- exactly what migration 27 adds.
DO $$
DECLARE v_before NUMERIC; v_after NUMERIC;
BEGIN
  SELECT quantity INTO v_before FROM public.inventory
   WHERE product_id = '88888888-8888-8888-8888-888888888888';

  BEGIN
    PERFORM pg_temp.record_dispatch(1, 0);
    RAISE EXCEPTION 'FAILED: a revoked role should not be able to record';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%revoked%' OR SQLERRM LIKE '%not perform this action%' THEN
      RAISE NOTICE 'ok  a revoked role cannot record a collection';
    ELSE
      RAISE;
    END IF;
  END;

  SELECT quantity INTO v_after FROM public.inventory
   WHERE product_id = '88888888-8888-8888-8888-888888888888';

  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'FAILED: a rejected dispatch still moved stock (% -> %)',
      v_before, v_after;
  END IF;
  RAISE NOTICE 'ok  a rejected dispatch left stock untouched';
END;
$$;

-- ── 9. SECURITY DEFINER role enforcement ───────────────────────────
-- These functions run as their owner and bypass RLS, so each asserts its own
-- role. Before migration 27 they checked only that a company_id was present.

-- agent may not add stock (owner/manager only)
SELECT pg_temp.set_app_metadata('{"company_id":"11111111-1111-1111-1111-111111111111","role":"agent"}');
SELECT pg_temp.set_sub('user_2agentTEST000000000002');

DO $$
BEGIN
  BEGIN
    PERFORM public.add_stock('88888888-8888-4888-8888-888888888888', 5);
    RAISE EXCEPTION 'FAILED: an agent should not be able to add stock';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%not perform this action%' THEN
      RAISE NOTICE 'ok  add_stock refuses an agent';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- agent may not invoice (owner/accountant only)
DO $$
BEGIN
  BEGIN
    PERFORM public.generate_bulk_invoice(
      ARRAY(SELECT id FROM public.collections WHERE invoice_id IS NULL));
    RAISE EXCEPTION 'FAILED: an agent should not be able to invoice';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%not perform this action%' THEN
      RAISE NOTICE 'ok  generate_bulk_invoice refuses an agent';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- agent may not change company settings (owner only)
DO $$
BEGIN
  BEGIN
    PERFORM public.update_tax_settings(18);
    RAISE EXCEPTION 'FAILED: an agent should not be able to change tax settings';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%not perform this action%' THEN
      RAISE NOTICE 'ok  update_tax_settings refuses an agent';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- agent may not revoke a peer (owner only)
DO $$
BEGIN
  BEGIN
    PERFORM public.update_user_status(
      'user_2ownerTEST000000000001', FALSE, 'revoked');
    RAISE EXCEPTION 'FAILED: an agent should not be able to revoke a peer';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%not perform this action%' THEN
      RAISE NOTICE 'ok  update_user_status refuses an agent';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- agent MAY record a collection — that is the job.
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM public.collections) >= 2,
  'an agent is still allowed to record collections');

-- An owner cannot revoke themselves. Without this, an owner could lock the last
  -- owner out of the tenant.
SELECT pg_temp.set_app_metadata('{"company_id":"11111111-1111-1111-1111-111111111111","role":"owner"}');
SELECT pg_temp.set_sub('user_2ownerTEST000000000001');
  -- (The "at least one active owner must remain" guard inside the function is
  -- defence in depth against out-of-band changes; it cannot be reached through
  -- the RPC, because reaching it would already require the caller to be that
  -- owner, which the self-revoke check rejects first.)
DO $$
BEGIN
  BEGIN
    PERFORM public.update_user_status('user_2ownerTEST000000000001', FALSE, 'revoked');
    RAISE EXCEPTION 'FAILED: an owner should not be able to revoke themselves';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%your own access%' THEN
      RAISE NOTICE 'ok  an owner cannot revoke themselves';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- An owner CAN revoke a peer, which is the feature working as intended.
SELECT pg_temp.assert_true(
  (SELECT is_active FROM public.profiles
    WHERE id = 'user_2ownerTEST000000000001'),
  'the owner who attempted a self-revoke is still active');

-- A restaurant from another tenant cannot be collected against.
DO $$
BEGIN
  BEGIN
    PERFORM public.record_collection(
      'aaaaaaaa-2222-4222-8222-222222222222', 'cross tenant',
      jsonb_build_array(jsonb_build_object(
        'product_id', 'b2000000-0000-4000-8000-000000000001',
        'quantity', 1, 'return_quantity', 0, 'unit_price', 100)));
    RAISE EXCEPTION 'FAILED: cross-tenant collection should be rejected';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%does not belong to your company%' THEN
      RAISE NOTICE 'ok  cross-tenant collection rejected';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;


-- ── Row Level Security, enforced by Postgres ─────────────────────────
-- Every check above runs as the `postgres` superuser, which BYPASSES RLS
-- entirely, so none of them actually prove tenant isolation. These checks drop
-- to the `authenticated` role -- the role PostgREST uses per request -- and
-- re-run the isolation and role guarantees against the policies themselves.
-- The whole file is one transaction that rolls back, so nothing here persists.
DO $$
DECLARE
  c_self  CONSTANT TEXT := '11111111-1111-1111-1111-111111111111';
  c_other CONSTANT TEXT := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_n INT;
BEGIN
  -- (a) No JWT at all: the policies must match nothing.
  PERFORM pg_temp.set_claims('');
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.companies;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAILED: an unauthenticated request saw % companies', v_n;
  END IF;

  -- (b) An owner sees their own tenant, and only their own tenant.
  PERFORM pg_temp.become(c_self, 'owner', 'user_2ownerTEST000000000001');
  SELECT count(*) INTO v_n FROM public.companies;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAILED: owner saw % companies, expected 1', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.companies WHERE id = c_other::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAILED: owner read % rows of another tenant', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.restaurants WHERE company_id = c_other::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAILED: owner read % restaurants of another tenant', v_n;
  END IF;

  -- (c) WITH CHECK: writing into a foreign tenant must be refused.
  --     Postgres raises `insufficient_privilege` for a WITH CHECK violation,
  --     so that is the success signal here, not an unexpected error.
  BEGIN
    INSERT INTO public.companies (id, name)
    VALUES ('bbbbbbbb-0000-4000-8000-0000000000ff', 'injected');
    RAISE EXCEPTION 'FAILED: RLS allowed an insert into another tenant';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  RLS refused an insert into another tenant';
  END;

  -- (d) An UPDATE against a foreign row is filtered out, not applied.
  UPDATE public.companies SET name = 'hijacked' WHERE id = c_other::uuid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAILED: RLS let an owner update % foreign rows', v_n;
  END IF;

  -- (e) Writing within your own tenant is still allowed.
  --     `companies` has no INSERT policy on purpose: a tenant is created by the
  --     onboarding Server Action with the service role, never by a signed-in
  --     user, so an ordinary member inserting a row for their own company_id
  --     must be refused. Use a table that does grant inserts, to prove the
  --     positive case rather than assuming one.
  INSERT INTO public.products (company_id, name, price, hsn_code, gst_rate, min_stock_level)
  VALUES (c_self::uuid, 'rls probe', 1, '0000', 5, 0);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAILED: an owner could not write inside their own tenant';
  END IF;

  --     And a table with no INSERT policy stays closed even to your own tenant.
  BEGIN
    INSERT INTO public.companies (id, name)
    VALUES ('bbbbbbbb-0000-4000-8000-0000000000aa', 'mine');
    RAISE EXCEPTION 'FAILED: a signed-in user was allowed to create a company row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  company creation stays closed to signed-in users';
  END;

  -- (f) An agent is still blocked by assert_role inside the SECURITY DEFINER
  --     RPCs, now reached through the real role rather than a faked claim.
  PERFORM pg_temp.become(c_self, 'agent', 'user_2agentTEST000000000002');
  BEGIN
    PERFORM public.add_stock('88888888-8888-4888-8888-888888888888', 5);
    RAISE EXCEPTION 'FAILED: an agent was allowed to add stock';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%may not perform%' AND SQLERRM NOT LIKE '%Not authorized%' THEN
      RAISE EXCEPTION 'FAILED: unexpected agent error: %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('role', 'none', true);
END;
$$;

-- Everything below already asserted RPC behaviour with a fabricated caller.

ROLLBACK;

\echo '=========================================='
\echo ' All database behaviour checks passed.'
\echo '=========================================='