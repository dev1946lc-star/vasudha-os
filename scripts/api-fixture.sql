-- Fixture data for the API integration test.
--
-- Creates two tenants with overlapping data so every endpoint can be checked for
-- both shape and tenant isolation. Runs inside the transaction the harness opens;
-- it never touches a real database.
--
--   npm run test:api:e2e
--
-- Deliberately includes edge cases the read endpoints have to survive:
--   * a product with NULL hsn_code          -> /api/products must not 500
--   * a restaurant with no address/phone    -> nullable fields must be present as null
--   * an inactive restaurant                -> /api/collections/today excludes it
--   * unpaid / partial / paid invoices      -> /api/billing covers every status
--   * an invoice aged into each bucket      -> /api/outstanding sums correctly

\set ON_ERROR_STOP on

-- ── Tenant A ────────────────────────────────────────────────────────
INSERT INTO public.companies (id, name, gst_number, address, default_gst_rate)
VALUES ('11111111-1111-1111-1111-111111111111', 'Alpha Fuels', '29AAAAA0000A1Z5',
        '1 Alpha Way, Bengaluru', 5);

INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2alphaOwner00000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'Alpha Owner');

INSERT INTO public.restaurants (id, company_id, name, address, contact_person, phone,
                                credit_limit, payment_terms_days, is_active, gst_number)
VALUES
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Hotel Malabar', '12 MG Road, Bengaluru', 'Ramesh Iyer', '+919845012345',
   250000, 15, TRUE, '29AAAAA0000A1Z5'),
  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Udupi Bhavan', NULL, NULL, NULL,
   120000, 7, TRUE, NULL),
  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Closed Diner', '9 Old Road, Bengaluru', 'Old Owner', '+919845000000',
   50000, 15, FALSE, NULL);

INSERT INTO public.products (id, company_id, name, description, hsn_code, price, gst_rate,
                             is_active, min_stock_level)
VALUES
  ('b1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Refined Oil 20L', 'Everyday cooking oil', '15121100', 2350, 5, TRUE, 40),
  -- NULL hsn_code: this row used to make /api/products return 500.
  ('b1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Unclassified Bulk', NULL, NULL, 62000, 18, TRUE, 2),
  -- Below threshold, so it must be counted as low stock.
  ('b1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Ghee 5kg', 'Clarified butter', '04061000', 4250, 12, TRUE, 20),
  -- Inactive: must not appear in /api/products?status=active.
  ('b1000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Discontinued Oil', 'Old stock', '15121990', 900, 5, FALSE, 0);

-- The products trigger (migration 30) creates a zero-quantity row for every
-- product on insert, so these top-ups must upsert rather than insert. The
-- per-product quantities are what the low-stock and stock-take assertions read.
INSERT INTO public.inventory (id, company_id, product_id, quantity, last_updated)
VALUES
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'b1000000-0000-4000-8000-000000000001', 820, NOW()),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'b1000000-0000-4000-8000-000000000002', 7, NOW()),
  -- Below min_stock_level (20) -> low stock.
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'b1000000-0000-4000-8000-000000000003', 5, NOW())
ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = EXCLUDED.quantity, last_updated = EXCLUDED.last_updated;

-- Collections across today and the recent past.
INSERT INTO public.collections (id, company_id, restaurant_id, agent_id, collection_date,
                                status, total_quantity, total_amount)
VALUES
  ('d1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'user_2alphaOwner00000000001',
   CURRENT_DATE, 'completed', 20, 2350),
  ('d1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000002', 'user_2alphaOwner00000000001',
   CURRENT_DATE - 10, 'verified', 15, 1725),
  ('d1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'user_2alphaOwner00000000001',
   CURRENT_DATE - 25, 'verified', 30, 3450),
  ('d1000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'user_2alphaOwner00000000001',
   CURRENT_DATE - 70, 'verified', 12, 1380);

INSERT INTO public.collection_items (id, collection_id, product_id, quantity,
                                     return_quantity, price_per_unit, amount)
VALUES
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', 20, 0, 2350, 2350),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-000000000001', 15, 3, 2350, 1725),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003',
   'b1000000-0000-4000-8000-000000000001', 30, 0, 2350, 3450),
  ('e1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004',
   'b1000000-0000-4000-8000-000000000001', 12, 0, 2350, 1380);

-- Invoices spanning every aging bucket and every status.
--
-- due_date (migration 29) is NOT NULL, and aging is measured from it rather than
-- from invoice_date. The restaurant has payment_terms_days = 15, so:
--   invoice 1: dated 5 days ago  -> due in 10 days  -> 'current'
--   invoice 2: dated 25 days ago -> due 10 days ago -> 10 days overdue -> '0-15'
--   invoice 3: dated 70 days ago -> due 55 days ago -> '31-60'
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number, invoice_date, due_date,
                             subtotal, cgst, sgst, igst, total_amount, status)
VALUES
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001',
   'INV-' || to_char(CURRENT_DATE, 'YYYYMM') || '-0001', CURRENT_DATE - 5, CURRENT_DATE + 10,
   2350, 58.75, 58.75, 0, 2468.50, 'unpaid'),
  ('f1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001',
   'INV-' || to_char(CURRENT_DATE - 10, 'YYYYMM') || '-0002', CURRENT_DATE - 25, CURRENT_DATE - 10,
   1725, 43.13, 43.13, 0, 1811.26, 'partial'),
  ('f1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001',
   'INV-' || to_char(CURRENT_DATE - 25, 'YYYYMM') || '-0003', CURRENT_DATE - 70, CURRENT_DATE - 55,
   1380, 34.50, 34.50, 0, 1449.00, 'unpaid');

-- Payments, partial or full, against invoices that are already aged:
--   * invoice 2 -> partial, leaving 811.26 outstanding, 10 days overdue
--   * invoice 3 -> covered by the first payment, drops out of outstanding
-- Invoice 1 is deliberately left unpaid so it exercises the not-yet-due bucket,
-- which the old invoice_date-based aging could not produce at all.
INSERT INTO public.payments (id, company_id, restaurant_id, invoice_id, amount,
                             payment_mode, payment_date, reference_number)
VALUES
  ('a2000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002',
   1000, 'upi', CURRENT_DATE - 24, 'PAY10001'),
  ('a2000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003',
   1449, 'bank_transfer', CURRENT_DATE - 69, 'PAY10002'),
  -- A payment that gives the dashboard a same-day revenue figure.
  ('a2000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003',
   500, 'upi', CURRENT_DATE, 'PAY10003');

UPDATE public.collections SET invoice_id = 'f1000000-0000-4000-8000-000000000002'
WHERE id = 'd1000000-0000-4000-8000-000000000002';

INSERT INTO public.invoice_sequences (company_id, period, last_value)
VALUES ('11111111-1111-1111-1111-111111111111', to_char(CURRENT_DATE, 'YYYYMM'), 3)
ON CONFLICT DO NOTHING;

-- ── Tenant B ────────────────────────────────────────────────────────
-- A second company with its own restaurant, product and payment. Every read
-- endpoint must return only tenant A's rows.
INSERT INTO public.companies (id, name) VALUES ('22222222-2222-4222-8222-222222222222', 'Beta Oils');
INSERT INTO public.profiles (id, company_id, role, name)
VALUES ('user_2betaOwner000000000001', '22222222-2222-4222-8222-222222222222', 'owner', 'Beta Owner');
INSERT INTO public.restaurants (id, company_id, name, phone, is_active)
VALUES ('a2000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222',
        'Beta Secret Bistro', '+919999999999', TRUE);
INSERT INTO public.products (id, company_id, name, price, hsn_code, gst_rate, is_active, min_stock_level)
VALUES ('b2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        'Beta Secret Oil', 9999, '15129999', 18, TRUE, 5);
-- The products trigger (migration 30) already creates a zero row per product,
-- so this only tops it up to 1.
INSERT INTO public.inventory (company_id, product_id, quantity)
VALUES ('22222222-2222-4222-8222-222222222222', 'b2000000-0000-4000-8000-000000000001', 1)
ON CONFLICT (company_id, product_id) DO UPDATE SET quantity = 1;
INSERT INTO public.invoices (id, company_id, restaurant_id, invoice_number, invoice_date, due_date,
                             subtotal, total_amount, status)
VALUES ('f2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        'a2000000-0000-4000-8000-000000000009', 'INV-BETA-0001',
        CURRENT_DATE - 100, CURRENT_DATE - 85,
        9999, 11758.82, 'unpaid');
INSERT INTO public.payments (id, company_id, restaurant_id, invoice_id, amount,
                             payment_mode, payment_date)
VALUES ('a3000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        'a2000000-0000-4000-8000-000000000009', 'f2000000-0000-4000-8000-000000000001',
        0, 'cash', CURRENT_DATE - 99);