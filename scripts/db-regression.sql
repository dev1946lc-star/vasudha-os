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

-- The products trigger (migration 30) now inserts a zero-quantity inventory row
-- for every new product, so this fixture only has to top it up to 100.
INSERT INTO public.inventory (company_id, product_id, quantity)
VALUES ('11111111-1111-1111-1111-111111111111',
        '88888888-8888-8888-8888-888888888888', 100)
ON CONFLICT (company_id, product_id) DO UPDATE SET quantity = 100;

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
-- ── 2. Negative stock warns, and never blocks a real delivery ──────────────
--
-- Behaviour changed in migration 30. Previously an oversell RAISEd and the
-- collection was refused. That is worse than it sounds: the delivery physically
-- happened, so refusing to record it loses the fact and leaves stock lying about
-- what left the warehouse. Per the spec, negative stock is allowed and flagged.
--
-- The dispatch therefore succeeds and leaves a visible shortfall.
SELECT pg_temp.record_dispatch(9999, 0);

SELECT pg_temp.assert(
  pg_temp.inventory_qty()::TEXT, '-9913.00',
  'an oversell is recorded as negative stock rather than refused');

SELECT pg_temp.assert_true(
  (SELECT status FROM public.collections ORDER BY created_at DESC LIMIT 1) = 'completed',
  'a delivery that physically happened is still recorded as completed');

SELECT pg_temp.assert_true(
  pg_temp.inventory_qty() < 0,
  'negative stock is visible rather than silently clamped to zero');

-- Put the count back so later checks are not reasoning about -9913.
UPDATE public.inventory SET quantity = 100
WHERE company_id = '11111111-1111-1111-1111-111111111111'
  AND product_id = '88888888-8888-8888-8888-888888888888';

-- A product with no stock record at all is a data error, not a count lag, and is
-- still refused -- otherwise the deduction silently does nothing.
DO $$
DECLARE
  v_product UUID;
BEGIN
  BEGIN
    SELECT id INTO v_product FROM public.products
    WHERE company_id = '11111111-1111-1111-1111-111111111111' LIMIT 1;

    DELETE FROM public.inventory
     WHERE company_id = '11111111-1111-1111-1111-111111111111'
       AND product_id = v_product;

    PERFORM pg_temp.record_dispatch(1, 0);
    RAISE EXCEPTION 'FAILED: a product with no stock record should be refused';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%no stock record%' THEN
      RAISE NOTICE 'ok  a missing stock record is refused as a data error';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- The refused dispatch (the product with no stock record, above) must not have
-- left a partial collection behind. The count is 3, not 2, because the oversell
-- in this section is now deliberately recorded rather than refused.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.collections) = 3,
  'a refused dispatch leaves no orphan collection');

-- The refused one is specifically the missing-stock-record attempt, so assert on
-- the shortfall rather than on the total: the oversell is legitimately persisted.
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.collections c
    JOIN public.collection_items ci ON ci.collection_id = c.id
    WHERE c.notes = 'dispatch'
      AND ci.quantity = 1
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory inv
        WHERE inv.company_id = c.company_id AND inv.product_id = ci.product_id
      )
  ),
  'the missing-stock-record dispatch wrote no collection row');

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
-- Scope: only the two normal dispatches from section 1. The 9999-unit
-- oversell from section 2 is also verified and would otherwise dominate the
-- invoice, so it is excluded by selecting on quantity rather than by
-- sweeping every collection.
UPDATE public.collections SET status = 'verified'
WHERE invoice_id IS NULL
  AND id IN (SELECT ci.collection_id FROM public.collection_items ci WHERE ci.quantity = 10);

SELECT public.generate_bulk_invoice(
  ARRAY(SELECT id FROM public.collections WHERE invoice_id IS NULL AND status = 'verified'));

SELECT pg_temp.assert(
  (SELECT invoice_number FROM public.invoices LIMIT 1), 'INV-' ||
    to_char(CURRENT_DATE, 'YYYYMM') || '-0001',
  'first invoice of the month is numbered 0001');

-- Billing is NET of returns. Two dispatches of 10 and 7 with 3 returned:
--   gross 17 x 100        = 1700.00
--   returns 3 x 100       = -300.00
--   taxable               = 1400.00
--   GST 5% intra-state    =   70.00  (cgst 35.00 + sgst 35.00)
--   total                = 1470.00
-- The previous expectation of 2100.00 billed the returned cans in full.
SELECT pg_temp.assert(
  (SELECT subtotal::TEXT FROM public.invoices LIMIT 1), '1400.00',
  'invoice subtotal is net of returns');
SELECT pg_temp.assert(
  (SELECT total_amount::TEXT FROM public.invoices LIMIT 1), '1470.00',
  'invoice total is 1400 subtotal + 70 GST');
SELECT pg_temp.assert(
  (SELECT cgst::TEXT FROM public.invoices LIMIT 1), '35.00',
  'cgst is half the GST for an intra-state supply');
SELECT pg_temp.assert(
  (SELECT igst::TEXT FROM public.invoices LIMIT 1), '0.00',
  'igst is zero when both parties are in the same state');

-- One bill_items row per product, carrying the net quantity and a frozen split.
SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM public.bill_items WHERE invoice_id = (
     SELECT id FROM public.invoices LIMIT 1)), '1',
  'a single-product invoice produces exactly one bill line');
SELECT pg_temp.assert(
  (SELECT quantity::TEXT FROM public.bill_items LIMIT 1), '14.00',
  'bill line quantity is net of returns');
SELECT pg_temp.assert(
  (SELECT (gross_quantity - return_quantity)::TEXT FROM public.bill_items LIMIT 1), '14.00',
  'gross minus returns reconciles with the billed quantity');
SELECT pg_temp.assert(
  (SELECT (cgst + sgst + igst)::TEXT FROM public.bill_items LIMIT 1), '70.00',
  'bill line tax split sums to the invoice GST');

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

-- ── 4b. GST state detection (migration 29) ───────────────────────────────
-- The head of a GSTIN is the state code. These are the inputs to the CGST+SGST
-- vs IGST split, so the edge cases (missing, truncated, non-numeric) matter:
-- a wrong answer here is wrong tax on a real invoice.
SELECT pg_temp.assert(
  public.gst_state_code('27AAAAA1234A1Z5')::TEXT, '27',
  'a GSTIN head yields its numeric state code');
SELECT pg_temp.assert(
  coalesce(public.gst_state_code(NULL)::TEXT, '<null>'), '<null>',
  'an absent GSTIN has no state code');
SELECT pg_temp.assert(
  coalesce(public.gst_state_code('27')::TEXT, '<null>'), '<null>',
  'a 2-character GSTIN is too short to carry a state code');
SELECT pg_temp.assert(
  coalesce(public.gst_state_code('27AAAAA1234A1Z')::TEXT, '<null>'), '<null>',
  'a 14-character GSTIN is one character short of a valid GSTIN');
SELECT pg_temp.assert(
  coalesce(public.gst_state_code('XYAAAAA1234A1Z5')::TEXT, '<null>'), '<null>',
  'a non-numeric state code is rejected rather than cast');

SELECT pg_temp.assert_true(
  public.is_inter_state_supply('27AAAAA1234A1Z5', '29BBBBB1234B1Z5'),
  'different state codes mean an inter-state supply');
SELECT pg_temp.assert_true(
  NOT public.is_inter_state_supply('27AAAAA1234A1Z5', '27BBBBB1234B1Z5'),
  'matching state codes mean an intra-state supply');
SELECT pg_temp.assert_true(
  NOT public.is_inter_state_supply('27AAAAA1234A1Z5', NULL),
  'an unregistered buyer is billed intra-state (CGST+SGST)');
SELECT pg_temp.assert_true(
  NOT public.is_inter_state_supply(NULL, NULL),
  'two absent GSTINs do not manufacture an inter-state supply');

-- ── 4c. Ageing is measured from due_date (migration 14b) ──────────────────
-- The old definition computed CURRENT_DATE - invoice_date and called the column
-- "days_overdue", so an invoice inside its payment term was reported as overdue.
-- These fixtures are 15-day terms, chosen so the naive and correct answers differ.

-- A dedicated restaurant, so the buckets below are measured in isolation from the
-- other fixtures that share the tenant.
INSERT INTO public.restaurants (id, company_id, name, payment_terms_days)
VALUES ('dddddddd-0000-4000-8000-00000000000d',
        '11111111-1111-1111-1111-111111111111', 'Ageing Probe', 15);

-- Dated today, due in 15 days: NOT overdue, however the invoice ages later.
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES ('dd000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'dddddddd-0000-4000-8000-00000000000d',
        'INV-AGE-0001', CURRENT_DATE, CURRENT_DATE + 15, 400, 400, 'unpaid');

-- Dated 40 days ago, due 25 days ago: 25 days overdue -> the 16-30 bucket.
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES ('dd000000-0000-4000-8000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'dddddddd-0000-4000-8000-00000000000d',
        'INV-AGE-0002', CURRENT_DATE - 40, CURRENT_DATE - 25, 600, 600, 'unpaid');

SELECT pg_temp.assert(
  (SELECT bucket::TEXT FROM public.invoice_aging
    WHERE id = 'dd000000-0000-4000-8000-000000000001'), 'current',
  'an invoice inside its payment term buckets as current, not overdue');

SELECT pg_temp.assert(
  (SELECT bucket::TEXT FROM public.invoice_aging
    WHERE id = 'dd000000-0000-4000-8000-000000000002'), '16-30',
  'days_overdue is counted from due_date, landing in 16-30');

SELECT pg_temp.assert(
  (SELECT days_overdue::TEXT FROM public.invoice_aging
    WHERE id = 'dd000000-0000-4000-8000-000000000001'), '-15',
  'a not-yet-due invoice reports negative days_overdue');

-- The restaurant rollup must keep the two apart, otherwise "current" money is
-- silently folded into the first overdue bucket.
SELECT pg_temp.assert(
  (SELECT bucket_current::TEXT FROM public.restaurant_outstanding
    WHERE restaurant_id = 'dddddddd-0000-4000-8000-00000000000d'), '400.00',
  'not-yet-due money is reported separately from the overdue buckets');

SELECT pg_temp.assert_true(
  (SELECT bucket_15_30 FROM public.restaurant_outstanding
    WHERE restaurant_id = 'dddddddd-0000-4000-8000-00000000000d') >= 600,
  'overdue money is bucketed by days past due');

-- The total must still equal current + overdue, or the header figure and the
-- columns underneath it would disagree.
SELECT pg_temp.assert(
  (SELECT total_outstanding::TEXT FROM public.restaurant_outstanding
    WHERE restaurant_id = 'dddddddd-0000-4000-8000-00000000000d'),
  (SELECT (bucket_current + bucket_0_15 + bucket_15_30 + bucket_30_60 + bucket_60_plus)::TEXT
     FROM public.restaurant_outstanding
    WHERE restaurant_id = 'dddddddd-0000-4000-8000-00000000000d'),
  'outstanding total equals the sum of every bucket including not-yet-due');

-- Clean up so the later status-machine checks see the fixture they expect.
DELETE FROM public.invoices WHERE restaurant_id = 'dddddddd-0000-4000-8000-00000000000d';
DELETE FROM public.restaurants WHERE id = 'dddddddd-0000-4000-8000-00000000000d';

-- Invoice numbers are unique per company.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM (
    SELECT company_id, invoice_number FROM public.invoices
    GROUP BY company_id, invoice_number HAVING count(*) > 1
  ) dupes) = 0,
  'no duplicate invoice numbers');

-- ── 5. Invoice status transitions ───────────────────────────────────
-- due_date is NOT NULL since migration 29. Real invoices get it from the
-- restaurant's payment_terms_days inside generate_bulk_invoice; this row is
-- inserted directly by the test, so the term is supplied here.
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'INV-TEST-0001', CURRENT_DATE,
        CURRENT_DATE + COALESCE((SELECT payment_terms_days FROM public.restaurants
                                  WHERE id = '22222222-2222-2222-2222-222222222222'), 15),
        1000, 1000, 'unpaid');

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
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES ('66666666-6666-6666-6666-666666666666',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'INV-TEST-0002', CURRENT_DATE, CURRENT_DATE + 15, 500, 500, 'unpaid');

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

-- ── 7. Stock records and soft delete (migration 30) ───────────────────────
-- Still as the superuser, because creating a product needs the table owner and
-- these are structural checks rather than policy checks.

-- Every product has a stock record. Without this a new product cannot be
-- dispatched at all, and is invisible on /inventory (INNER JOIN).
SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM public.products p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.company_id = p.company_id AND i.product_id = p.id
    )), '0',
  'every product has an inventory row, so none is undispatchable');

-- And a product created from now on gets one automatically.
INSERT INTO public.products (id, company_id, name, price, hsn_code, gst_rate, min_stock_level)
VALUES ('ee000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Auto Stock Product', 50, '15121110', 5, 0);

SELECT pg_temp.assert(
  (SELECT quantity::TEXT FROM public.inventory
    WHERE company_id = '11111111-1111-1111-1111-111111111111'
      AND product_id = 'ee000000-0000-4000-8000-000000000001'), '0.00',
  'inserting a product creates its stock record at zero');

-- Soft delete: the row survives so its invoices keep a valid referent.
SELECT pg_temp.set_claims(jsonb_build_object(
  'sub', 'user_2ownerTEST000000000001',
  'role', 'authenticated',
  'app_metadata', jsonb_build_object(
    'company_id', '11111111-1111-1111-1111-111111111111', 'role', 'owner')
)::TEXT);

-- A dedicated restaurant with exactly one unpaid bill, so the balance is known
-- and settling it is a single step. Reusing the shared Test Restaurant would
-- inherit an unrelated 2470.00 from the invoice-status section above.
INSERT INTO public.restaurants (id, company_id, name, payment_terms_days, credit_limit)
VALUES ('ffff0000-0000-4000-8000-00000000000f',
        '11111111-1111-1111-1111-111111111111', 'Removal Probe', 15, 500);

INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES ('ff000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'ffff0000-0000-4000-8000-00000000000f',
        'INV-DEL-' || to_char(CURRENT_DATE, 'YYYYMMDD'), CURRENT_DATE, CURRENT_DATE + 15, 300, 300, 'unpaid');

DO $$
DECLARE
  v_probe CONSTANT UUID := 'ffff0000-0000-4000-8000-00000000000f';
BEGIN
  -- Refused while money is owed, with the amount named so the user can act.
  BEGIN
    PERFORM public.delete_restaurant(v_probe);
    RAISE EXCEPTION 'FAILED: a restaurant with an outstanding balance must not be removed';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%still outstanding%' THEN
      RAISE NOTICE 'ok  removal refused while money is still owed';
    ELSE
      RAISE;
    END IF;
  END;

  -- Settle the balance in full, then removal succeeds.
  INSERT INTO public.payments (id, company_id, restaurant_id, invoice_id, amount, payment_date)
  VALUES ('ff000000-0000-4000-8000-000000000002',
          '11111111-1111-1111-1111-111111111111', v_probe,
          'ff000000-0000-4000-8000-000000000001', 300, CURRENT_DATE);

  PERFORM public.delete_restaurant(v_probe);
END;
$$;

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.restaurants
    WHERE id = 'ffff0000-0000-4000-8000-00000000000f' AND deleted_at IS NOT NULL),
  'removal marks the restaurant deleted instead of dropping the row');

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.invoices
    WHERE id = 'ff000000-0000-4000-8000-000000000001'),
  'the removed restaurant keeps its invoices, so history survives');

-- Deleted restaurants drop out of the money figures.
SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM public.restaurant_outstanding
    WHERE restaurant_id = 'ffff0000-0000-4000-8000-00000000000f'), '0',
  'a deleted restaurant disappears from outstanding');

-- And removal is reversible.
SELECT public.restore_restaurant('ffff0000-0000-4000-8000-00000000000f');

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.restaurants
    WHERE id = 'ffff0000-0000-4000-8000-00000000000f' AND deleted_at IS NULL),
  'a mistaken removal can be undone');

-- credit_limit was stored and displayed but never enforced. This is the helper
-- that makes it checkable.
UPDATE public.restaurants SET credit_limit = 500
WHERE id = 'ffff0000-0000-4000-8000-00000000000f';

SELECT pg_temp.assert_true(
  (SELECT exceeded FROM public.restaurant_credit_status(
     'ffff0000-0000-4000-8000-00000000000f', 600)),
  'a delivery past the credit limit is flagged');

SELECT pg_temp.assert_true(
  NOT (SELECT exceeded FROM public.restaurant_credit_status(
     'ffff0000-0000-4000-8000-00000000000f', 100)),
  'a delivery within the credit limit is not flagged');

SELECT pg_temp.assert_true(
  NOT (SELECT exceeded FROM public.restaurant_credit_status(
     'ffff0000-0000-4000-8000-00000000000f', 0)),
  'credit_limit = 0 means unlimited, not zero allowance');

-- ── 8. Advance payments and FIFO allocation (migration 31) ────────────────
-- The everyday case: a restaurant pays a round number against several bills,
-- or pays before the period is even billed. Both were unrepresentable before.

-- A restaurant with three open bills on a known, controlled timeline.
INSERT INTO public.restaurants (id, company_id, name, payment_terms_days)
VALUES ('aa000000-0000-4000-8000-00000000000a',
        '11111111-1111-1111-1111-111111111111', 'FIFO Probe', 15);

-- Oldest first. due_date drives the order; invoice_date breaks ties.
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES
  ('ab000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-4000-8000-00000000000a',
   'INV-FIFO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-1',
   CURRENT_DATE - 40, CURRENT_DATE - 25, 300, 300, 'unpaid'),
  ('ab000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-4000-8000-00000000000a',
   'INV-FIFO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-2',
   CURRENT_DATE - 20, CURRENT_DATE - 5, 400, 400, 'unpaid'),
  ('ab000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-4000-8000-00000000000a',
   'INV-FIFO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-3',
   CURRENT_DATE - 2, CURRENT_DATE + 13, 500, 500, 'unpaid');

SELECT pg_temp.set_claims(jsonb_build_object(
  'sub', 'user_2ownerTEST000000000001',
  'role', 'authenticated',
  'app_metadata', jsonb_build_object(
    'company_id', '11111111-1111-1111-1111-111111111111', 'role', 'owner')
)::TEXT);

-- (a) 500 against a 300 oldest bill and part of the 400 next: spills across both.
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.record_payment(
    'aa000000-0000-4000-8000-00000000000a', 500, 'cash', NULL, CURRENT_DATE, 'ADV-1');

  PERFORM pg_temp.assert(r.allocated::TEXT, '500.00',
    'a 500 payment against 300+400 open bills allocates in full');
  PERFORM pg_temp.assert(r.credit_left::TEXT, '0.00',
    'no credit is left when the payment is fully absorbed');
  PERFORM pg_temp.assert(r.invoices_hit::TEXT, '2',
    'the payment settles the oldest bill first, then spills onto the next');
END;
$$;

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ab000000-0000-4000-8000-000000000001'),
  'paid', 'the oldest bill is settled first, not the newest');
SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ab000000-0000-4000-8000-000000000002'),
  'partial', 'the spill leaves the second bill partially paid');
SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ab000000-0000-4000-8000-000000000003'),
  'unpaid', 'the newest bill is untouched');

SELECT pg_temp.assert(
  (SELECT amount::TEXT FROM public.payment_allocations
    WHERE invoice_id = 'ab000000-0000-4000-8000-000000000001'), '300.00',
  'the oldest bill absorbed exactly its own total');
SELECT pg_temp.assert(
  (SELECT amount::TEXT FROM public.payment_allocations
    WHERE invoice_id = 'ab000000-0000-4000-8000-000000000002'), '200.00',
  'the remainder is recorded against the next oldest bill');

-- (b) An advance with nothing to absorb it becomes credit, not a lost payment.
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.record_payment(
    'aa000000-0000-4000-8000-00000000000a', 1000, 'upi', NULL, CURRENT_DATE, 'ADV-2');

  PERFORM pg_temp.assert(r.allocated::TEXT, '400.00',
    'an advance settles the remaining 200 on bill 2 and 400 of bill 3');
  PERFORM pg_temp.assert(r.credit_left::TEXT, '600.00',
    'the unabsorbed remainder is held as credit rather than disappearing');
END;
$$;

SELECT pg_temp.assert(
  (SELECT amount::TEXT FROM public.restaurant_credit
    WHERE restaurant_id = 'aa000000-0000-4000-8000-00000000000a'), '600.00',
  'restaurant_credit holds the overpayment');

-- This is the defect being fixed: the surplus used to vanish from the
-- money-owed figures because the views filtered on status.
SELECT pg_temp.assert(
  (SELECT credit_balance::TEXT FROM public.restaurant_outstanding
    WHERE restaurant_id = 'aa000000-0000-4000-8000-00000000000a'), '600.00',
  'credit is visible on the outstanding report instead of vanishing');

-- (c) A later payment spends the existing credit before touching new bills.
DO $$
DECLARE
  r RECORD;
BEGIN
  INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                               invoice_date, due_date, subtotal, total_amount, status)
  VALUES ('ab000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
          'aa000000-0000-4000-8000-00000000000a',
          'INV-FIFO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-4',
          CURRENT_DATE, CURRENT_DATE + 15, 900, 900, 'unpaid');

  SELECT * INTO r FROM public.record_payment(
    'aa000000-0000-4000-8000-00000000000a', 500, 'cash', NULL, CURRENT_DATE, 'ADV-3');

  PERFORM pg_temp.assert(r.credit_left::TEXT, '100.00',
    'the new payment draws down the 600 of credit before allocating');
  PERFORM pg_temp.assert(r.allocated::TEXT, '0.00',
    'with credit available the whole payment is consumed by it');
END;
$$;

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ab000000-0000-4000-8000-000000000004'),
  'unpaid', 'held credit does not settle a bill raised after it arrived');
SELECT pg_temp.assert(
  (SELECT amount::TEXT FROM public.restaurant_credit
    WHERE restaurant_id = 'aa000000-0000-4000-8000-00000000000a'), '100.00',
  'the remaining credit balance is still carried');

-- (d) A payment with no invoice and nothing outstanding is pure credit.
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.record_payment(
    'aa000000-0000-4000-8000-00000000000a', 250, 'cash', NULL, CURRENT_DATE, 'ADV-4');

  PERFORM pg_temp.assert(r.allocated::TEXT, '0.00',
    'a payment with nothing to absorb is not allocated to anything');
  PERFORM pg_temp.assert(r.credit_left::TEXT, '350.00',
    'it simply increases the credit held');
END;
$$;

-- (e) Guards. A zero payment, a foreign restaurant, and a mismatched invoice
-- must all be refused rather than silently recorded.
DO $$
BEGIN
  BEGIN
    PERFORM public.record_payment(
      'aa000000-0000-4000-8000-00000000000a', 0, 'cash');
    RAISE EXCEPTION 'FAILED: a zero payment should be refused';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%greater than zero%' THEN
      RAISE NOTICE 'ok  a zero-amount payment is refused';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.record_payment(
      'aaaaaaaa-2222-4222-8222-222222222222', 100, 'cash');
    RAISE EXCEPTION 'FAILED: another tenant''s restaurant should be refused';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%does not belong to your company%' THEN
      RAISE NOTICE 'ok  paying against another tenant''s restaurant is refused';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    -- An invoice belonging to a different restaurant must not settle this bill.
    PERFORM public.record_payment(
      'aa000000-0000-4000-8000-00000000000a', 100, 'cash',
      '33333333-3333-3333-3333-333333333333');
    RAISE EXCEPTION 'FAILED: a mismatched invoice should be refused';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%does not belong to that restaurant%' THEN
      RAISE NOTICE 'ok  a payment cannot settle another restaurant''s bill';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

-- (f) FIFO follows due_date, not creation order.
INSERT INTO public.restaurants (id, company_id, name, payment_terms_days)
VALUES ('aa000000-0000-4000-8000-00000000000b',
        '11111111-1111-1111-1111-111111111111', 'Order Probe', 15);

-- Deliberately inserted newest-first, so a naive ORDER BY id would settle the
-- wrong bill. The later due_date must win.
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number,
                             invoice_date, due_date, subtotal, total_amount, status)
VALUES
  ('ac000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-4000-8000-00000000000b',
   'INV-ORD-' || to_char(CURRENT_DATE, 'YYYYMM') || '-1',
   CURRENT_DATE - 1, CURRENT_DATE + 14, 700, 700, 'unpaid'),
  ('ac000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-4000-8000-00000000000b',
   'INV-ORD-' || to_char(CURRENT_DATE, 'YYYYMM') || '-2',
   CURRENT_DATE - 30, CURRENT_DATE - 15, 700, 700, 'unpaid');

DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.record_payment(
    'aa000000-0000-4000-8000-00000000000b', 700, 'cash', NULL, CURRENT_DATE, 'ORD-1');

  PERFORM pg_temp.assert(r.allocated::TEXT, '700.00',
    'a payment equal to the oldest bill settles exactly that bill');
END;
$$;

SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ac000000-0000-4000-8000-000000000001'),
  'unpaid', 'the bill due LATER is left alone: FIFO orders by due_date');
SELECT pg_temp.assert(
  (SELECT status FROM public.invoices WHERE id = 'ac000000-0000-4000-8000-000000000002'),
  'paid', 'the bill due SOONER is settled, not the one inserted first');

-- (g) Batch billing across restaurants: one call, one invoice per restaurant.
INSERT INTO public.restaurants (id, company_id, name, is_active)
VALUES
  ('ad000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Batch A', TRUE),
  ('ad000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'Batch B', TRUE);

SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM public.inventory WHERE quantity = 500), '1',
  'only the probe product carries a 500 balance to dispatch');

-- Verified collections for two different restaurants in one selection.
INSERT INTO public.collections (id, company_id, restaurant_id, agent_id,
                                collection_date, status, total_amount)
VALUES
  ('ae000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'ad000000-0000-4000-8000-000000000001', 'user_2ownerTEST000000000001',
   CURRENT_DATE, 'verified', 0),
  ('ae000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'ad000000-0000-4000-8000-000000000002', 'user_2ownerTEST000000000001',
   CURRENT_DATE, 'verified', 0);

INSERT INTO public.collection_items (collection_id, product_id, quantity,
                                     return_quantity, price_per_unit, amount)
VALUES
  ('ae000000-0000-4000-8000-000000000001', '88888888-8888-8888-8888-888888888888', 1, 0, 100, 100),
  ('ae000000-0000-4000-8000-000000000002', '88888888-8888-8888-8888-888888888888', 2, 0, 100, 200);

DO $$
DECLARE
  v_rows INT;
  v_a UUID;
  v_b UUID;
BEGIN
  SELECT count(*), min(invoice_id), max(invoice_id)
  INTO v_rows, v_a, v_b
  FROM public.generate_bulk_invoices_batch(ARRAY[
    'ae000000-0000-4000-8000-000000000001'::UUID,
    'ae000000-0000-4000-8000-000000000002'::UUID]);

  -- This is the whole point: the old RPC refused a selection spanning two
  -- restaurants, so a billing run was one manual cycle per restaurant.
  PERFORM pg_temp.assert(v_rows::TEXT, '2',
    'one batch call issues one invoice per restaurant');
  PERFORM pg_temp.assert_true(v_a IS DISTINCT FROM v_b,
    'the two restaurants get two distinct invoices');
END;
$$;

SELECT pg_temp.assert(
  (SELECT count(*)::TEXT FROM public.bill_items), '2',
  'each batched invoice gets its own bill line');
SELECT pg_temp.assert(
  (SELECT count(DISTINCT invoice_number)::TEXT FROM public.invoices), '2',
  'the batched invoices have distinct numbers');

-- An unverified collection is skipped, not fatal: one unverified stop must not
-- block billing the other 199.
INSERT INTO public.restaurants (id, company_id, name)
VALUES ('ad000000-0000-4000-8000-000000000003',
        '11111111-1111-1111-1111-111111111111', 'Batch C');

INSERT INTO public.collections (id, company_id, restaurant_id, agent_id,
                                collection_date, status, total_amount)
VALUES ('ae000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
        'ad000000-0000-4000-8000-000000000003', 'user_2ownerTEST000000000001',
        CURRENT_DATE, 'completed', 0);

DO $$
DECLARE
  v_rows INT;
BEGIN
  BEGIN
    SELECT count(*) INTO v_rows
    FROM public.generate_bulk_invoices_batch(
      ARRAY['ae000000-0000-4000-8000-000000000003'::UUID]);
    PERFORM pg_temp.assert(v_rows::TEXT, '0',
      'an unverified collection is skipped rather than aborting the batch');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'FAILED: an unverified collection broke the whole batch: %', SQLERRM;
  END;
END;
$$;

ROLLBACK;

\echo '=========================================='
\echo ' All database behaviour checks passed.'
\echo '=========================================='