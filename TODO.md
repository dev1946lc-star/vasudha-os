# Work Log

## Phase 1: Backend ✅
- [x] Convert all backend routes from `sqlx::query!` to `sqlx::query_as + FromRow`
- [x] Create and register the products route
- [x] Backend compiles, passes `cargo clippy`, and has tests

## Phase 2: Frontend migration to the Rust API ✅
- [x] All eight read pages use `src/lib/api.ts`
- [x] `restaurants` pagination reads the API's real `page_size` (25) instead of assuming 15
- [x] `outstanding` no longer reads the SQL view directly

Writes still go through Supabase from the client. That is deliberate — RLS is the
enforcement mechanism there, and the Rust API has no write handlers yet.

## Phase 3: Schema ✅
- [x] Add the missing `collections.notes` column
- [x] Point the stock-deduction trigger at `return_quantity`
- [x] Fix `unit_price` → `price_per_unit`
- [x] Fix `payments.status` filter in `get_revenue_trend`
- [x] Fix `auth_user_role()` → `get_user_role()`
- [x] Make `cancelled` terminal in the invoice status trigger
- [x] Recompute both invoices when a payment is reassigned
- [x] Idempotent cleanups for existing databases (migrations 22, 23)
- [x] Index the FK and filter columns every list page touches
- [x] Regenerate `src/types/supabase.ts` from the real schema

## Phase 4: Broken pages ✅
- [x] Four pages had unbalanced JSX and could not compile
- [x] `/login` and `/signup` did not exist, so the app was unreachable
- [x] Three settings pages were Server Components using the browser Supabase client
- [x] `products/new` hung on a permanent spinner when the store had no `company_id`
- [x] Payment receipts 404'd because the query asked for a non-existent `companies.phone`
- [x] `/api/backup` used an anonymous client, so every table returned an error object

## Phase 5: Auth and tenancy ✅
- [x] The browser Supabase client sent no Clerk token, so RLS denied every call
- [x] `scripts/setup-clerk-jwt.mjs` provisions the "supabase" JWT template
- [x] The layout read `public_metadata`; the trigger writes `private_metadata`
- [x] Removed the hardcoded `company_id` fallback that could write to another tenant
- [x] Added the `revoked` role to the client guard and its tests

## Phase 6: Backend security ✅
- [x] `API_SECRET` is now required (min 16 chars); no insecure default
- [x] Constant-time key comparison
- [x] Tenant resolved from `X-Company-Id` and injected via request extensions
- [x] All eight read endpoints filter on `company_id`
- [x] A valid key without a tenant is rejected rather than querying unscoped
- [x] 8 Rust tests cover missing/wrong key, missing/malformed tenant, and every route

## Phase 7: Resilience and polish ✅
- [x] `error.tsx` boundary that recognises a down API and offers retry
- [x] `not-found.tsx`
- [x] 16 `loading.tsx` skeletons via a shared component
- [x] Dashboard shows real aging buckets instead of four hardcoded zeros
- [x] Dashboard and inventory now agree on what "low stock" means
- [x] Bulk invoicing navigates to the invoice it just created
- [x] Replace the restore button that claimed to work with an honest disabled state
- [x] All 95 `any` casts removed; lint went 108 errors → 0

## Phase 8: Database behaviour ✅ (tested against a throwaway Postgres)
- [x] All 27 migrations apply cleanly from scratch
- [x] Stock is deducted on dispatch and returns add back (was: never deducted)
- [x] Overselling is rejected with an actionable message, leaving no orphan rows
- [x] Invoice numbers are per-company, per-month, and unique
- [x] `cancelled` invoices are terminal
- [x] Moving a payment recomputes both the source and target invoice
- [x] The outstanding views never cross tenant boundaries
- [x] `generate_bulk_invoice` rejects empty selections and other tenants' rows
- [x] Wired into `npm run verify` via `npm run test:db` (33 checks)

## Phase 9: Identity ✅
- [x] `profiles.id` and `collections.agent_id` are TEXT so Clerk ids fit
- [x] `public.current_user_id()` reads the raw `sub` claim instead of `auth.uid()`
- [x] Staff are created through Clerk's admin API, not Supabase Auth
- [x] Removed PIN handling; staff set their own password via Clerk's invite
- [x] `clerk_metadata` mirror replaces the dead `auth.users` trigger
- [x] Verified: an agent with a Clerk id records a collection and stock moves

## Phase 10: Endpoint behaviour ✅
- [x] All 8 read endpoints executed against a real database (`npm run test:api:e2e`)
- [x] Fixed: out-of-range pages reported `total: 0`, breaking pagination
- [x] Fixed: `last_updated` was emitted in a format `new Date()` cannot parse
- [x] Asserted envelope shapes, null handling, ISO timestamps, tenant isolation
- [x] 76 checks, wired into `npm run verify`

## Phase 11: Onboarding and revocation ✅
- [x] `/onboarding` creates the company and owner profile
- [x] `src/lib/session-claims.ts` copies the profile onto the Clerk user so
      `role`/`company_id` reach the JWT — this was referenced in a migration
      comment but never written, which locked out every new staff account
- [x] `/access-revoked` and an `is_active` check in the layout, so "Revoke
      Access" actually locks someone out instead of only hiding a client link
- [x] `clerk_metadata` carries `is_active`, not just role and company
- [x] Both routes exempted in `proxy.ts` to avoid a redirect loop

## Phase 12: Authorisation of definer functions ✅
- [x] `public.assert_role()` added
- [x] `record_collection`, `add_stock`, `generate_bulk_invoice`,
      `update_company_profile`, `update_tax_settings`, `update_user_status` all
      check the caller's role — `SECURITY DEFINER` bypasses RLS, and none of
      them did, so a revoked user could still write
- [x] Cross-tenant restaurants and products rejected
- [x] An owner cannot revoke themselves
- [x] `update_user_status` takes a TEXT id, matching Clerk's `profiles.id`
- [x] UI guard aligned with the database (agents lose `/inventory/add` and
      `/outstanding`; the sidebar, dashboard and inventory page follow)

## Phase 13: Runtime ✅
Found by finally running the app rather than only typechecking it. Every data page
was throwing "No company is associated with this session".

- [x] `src/lib/api.ts` read the tenant from the session's Clerk claims, which lag
      a profile creation by one request — it now uses `resolveAccess`, the same
      source the layout uses, so they cannot disagree
- [x] Same stale-claims bug fixed in `recordPaymentAction`
- [x] `recordPaymentAction` now refuses roles the payments policy excludes
- [x] `getToken({ template: 'supabase' })` throws when the template is missing,
      which broke every Server Component; it now degrades with a logged warning
- [x] Staff accounts had `skipPasswordRequirement: true` and no invitation, so
      they could never sign in; now created with an unusable password plus a real
      Clerk invitation
- [x] Onboarding returned `throw`, whose message is stripped in production
      builds; it returns a result object so validation messages survive
- [x] `/access-revoked` rendered for anonymous visitors; now redirects
- [x] Added `npm run test:smoke` — boots the built app and requests every route

## Phase 14: Still needs a real environment
- [ ] Sign in and confirm the data pages load (this is the bug just fixed; it
      needs a browser session to confirm end to end)
- [ ] Add a staff member, accept the invitation, confirm they can record
- [ ] Revoke them and confirm they land on `/access-revoked`

### Known data issue to clean up
The production database contains rows from `scripts/api-fixture.sql` — companies
`Alpha Fuels` and `Beta Oils`, plus their restaurants, products, inventory and
invoices. They were created while diagnosing the errors above. They should be
deleted so only real data remains:

```sql
DELETE FROM companies WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);
```

This was deliberately not run: it is a destructive write to a live database.

### Carried-forward gaps
- **No write endpoints on the Rust API.** Reads go through Rust, writes through
  Supabase. Fine, but two data paths.
- **Tenant scoping is header-based.** A leaked `API_SECRET` lets a caller read any
  company by supplying a different `X-Company-Id`. Real multi-tenancy needs the
  tenant from a verified claim, or one API key per company.
- **Authenticated pages are not covered by an automated test.** The smoke suite
  uses unauthenticated requests; it cannot catch a tenant-resolution bug.
- **No React component tests.** Nothing renders a component under test.
- **No offline support**, despite it being in the product vision.
- **Collection, invoice and receipt pages read nested Supabase relations** rather
  than the Rust API, because the flat endpoints do not expose them.
- **Historical stock may need reconciling**: collections recorded before migration
  25 never deducted inventory. Query at the end of that migration.

## Phase 6: RLS matched nothing under postgrest/16.4

Every claim helper read `request.jwt.claim.sub` and
`request.jwt.claim.app_metadata`. PostgREST used to publish one setting per
top-level claim, then retired that in favour of a single `request.jwt.claims`.
Verified directly against postgrest/16.4 with a database carrying only
migrations 00-27:

```
probe_legacy_claim -> legacy app_metadata=<NULL> | legacy sub=<NULL>
                      modern claims={"app_metadata":{"company_id":...,"role":"owner"},...}
current_user_id  null     get_user_role  null     get_company_id  null
companies (RLS)  403 permission denied
```

So on a stock postgrest/16.4 stack:

| helper | returned | consequence |
|---|---|---|
| `get_company_id()` | NULL | every RLS policy matched zero rows |
| `get_user_role()` | NULL | `assert_role()` raised `Not authorized` |
| `current_user_id()` | NULL | per-user RPCs had no caller |

- [x] `migration 28` adds `public.jwt_claims()` / `jwt_claim(name)` and
  repoints all 13 claim-reading functions at them
- [x] `scripts/test-harness-auth-schema.sql` creates the `anon` /
  `authenticated` / `service_role` roles the container was missing
- [x] `scripts/db-regression.sql` now sets `request.jwt.claims` like PostgREST
  does, instead of fabricating the retired settings
- [x] Added RLS checks that run as `authenticated`, not `postgres`

### Why this stayed hidden
Two independent illusions:
1. The suite ran as the `postgres` superuser, which **bypasses RLS entirely**,
   so no check ever exercised a policy.
2. It hand-set `request.jwt.claim.*`, a layout PostgREST no longer produces, so
   the helpers appeared to work.

A green suite therefore proved nothing about tenant isolation. Check 51 now
asserts it against the policies themselves.

### There is no hosted Supabase configured
`NEXT_PUBLIC_SUPABASE_URL` is `http://localhost:54321`, served by
`scripts/supabase-proxy.mjs` (pid 34860). Every Supabase number recorded in this
repo is from that local stack, **not** from a hosted project. There is no pooler
or DDL credential in `.env`; only REST keys, which cannot run DDL. So:

- migration 28 is applied to the **local** stack and verified there
- whether the hosted project needs it is **unverified** — it depends on that
  project's PostgREST version
- to audit the real database, set `NEXT_PUBLIC_SUPABASE_URL` / keys to the hosted
  project and re-run the audit

## Phase 7: Slowness

Measured against the local stack:

| hop | median | max |
|---|---|---|
| Rust API | 6ms | 188ms |
| Supabase REST | 15ms | 123ms |
| **Clerk `users.getUser`** | **407ms** | **1088ms** |

`resolveAccess` awaited a Clerk call on every authenticated request, so page
rendering inherited Clerk's latency including its worst-case spikes.

- [x] Moved the metadata sync into `after()` (`src/lib/session-claims.ts`) so the
  response goes out before Clerk is consulted
- [ ] Consider a short-TTL cache on `resolveAccess`; `cache()` only dedupes
  within one render pass, not across requests
- [ ] 8 pages still declare `revalidate = 30` while `src/lib/api.ts` fetches
  with `cache: 'no-store'`. The declaration is inert and misleading: every
  render already refetches, so there is no ISR to reason about. Either drop the
  export or drop `no-store`, deliberately.

## Phase 8: Money was wrong (migrations 29 + 14b)

Audited the built app against `archive_docs/` and found several defects that
produced *plausible but incorrect* invoices. All silent — nothing errored.

### Fixed

**Returns were billed in full.** `generate_bulk_invoice` summed
`collection_items.amount` (gross dispatched quantity); `return_quantity` only
ever credited *stock*. An agent recording "delivered 20, returned 5" billed for
20. Fixed by billing `quantity - return_quantity` and writing a `bill_items`
snapshot per line. There was nowhere to store a net line before this, which is
why it could not be fixed in place.

**Prices came from the client.** `record_collection` wrote the submitted
`unit_price` verbatim. Invoicing now reads `products.price` instead, so a tampered
form cannot set the price.

**No `due_date` existed.** `restaurants.payment_terms_days` was written by the
form and never used. Aging computed `CURRENT_DATE - invoice_date` and labelled it
`days_overdue`, so a bill dated today on 30-day terms reported as 0-15 days
overdue. `invoices.due_date` added (NOT NULL, backfilled from terms); ageing
re-based in `14b_aging_due_date.sql`; a `current` bucket now separates not-yet-due
money instead of inflating 0-15.

**GST was intra-state by assumption.** `igst` was the literal `0` and
`cgst = sgst = amount × rate / 2 / 100`, with the source comment *"Assuming
intra-state"*. No GSTIN was ever read. Added `gst_state_code()` and
`is_inter_state_supply()`, which compare the two-digit state prefix of both
GSTINs; inter-state takes the full rate as IGST, intra-state splits evenly.

**The invoice page re-derived line items from `collection_items`.** It therefore
showed gross amounts — reintroducing the returns bug in the document — and re-read
live product names and prices, so renaming a product rewrote history. Now reads
`bill_items`. The PDF and HTML gained tax rate, tax amount and total columns, plus
the due date.

**`reports/aging` read `detailed_aging_report`**, a per-restaurant rollup with no
`invoice_id`, `invoice_number`, `days_overdue` or bucket column. It rendered
blank dates and `NaN days` rather than failing. Now reads `invoice_aging`.

### Test corrections

Three existing tests asserted the buggy behaviour and had to change:
- `invoice total is 2000 subtotal + 100 GST` expected `2100.00`, which billed the
  returned cans. Now expects `1470.00` (1400 net + 70 GST) plus five new
  assertions on the bill line.
- The e2e aging checks expected a 5-day-old invoice in 0-15 and a 25-day-old one
  in 16-30. Under correct due-date logic the 5-day one is **not yet due** and the
  other is 1-15. Rewritten, with an explicit assertion that not-yet-due money
  still counts toward the total.
- `invoice_date`-based fixtures in `api-fixture.sql` now carry `due_date`; the
  `NOT NULL` made that mandatory.

### Migration ordering trap

`14_aging_analysis.sql` now reads `due_date`, which `29` introduces — so it fails
on a clean database with *column i.due_date does not exist*. Fixed by adding the
column in a new `14b_aging_due_date.sql` and leaving `14` on `invoice_date` with a
pointer to `14b`. `14b` also needs `DROP VIEW` before `CREATE`: Postgres refuses to
`CREATE OR REPLACE` a view whose column *names* shift.

### Still outstanding (not yet fixed)
- **`credit_limit` is stored, displayed, never enforced** — a distributor can
  deliver indefinitely into unbounded debt.
- **Bulk billing cannot span restaurants** — `generate_bulk_invoice` raises
  "All collections must belong to the same restaurant", so the spec's "200 bills
  in 15 minutes" is one RPC per restaurant.
- **Advance payments impossible** — `PaymentForm` disables submit when there is no
  unpaid invoice, and there is no FIFO allocation to the oldest bill.
- **`products/new` creates no `inventory` row**, so a brand-new product cannot be
  dispatched (`RAISE EXCEPTION 'Cannot dispatch product — it has no stock record'`)
  and is invisible on `/inventory` (INNER JOIN).
- **Hard DELETE on restaurants/products** — no `deleted_at`, so financial history
  is destroyed. Also breaks on FK for anything with collections.
- **Managers cannot reach `/billing`**, while accountants can *verify* collections,
  which the spec does not grant them.
- **`collections.total_quantity` is never written** — permanently 0; report pages
  re-sum nested items instead.
- **Reports hardcode "kg"** for a water/dairy distributor.
- **`ReceiptPDF` derefs `data.invoice.invoice_number`** while `payments.invoice_id`
  is nullable — crashes on a loose payment.
- **GSTR-3B missing entirely**; `reports/gst` hardcodes `"Rate": "5.00"` and
  `"Place Of Supply": "State Code"`.
- **`/payments/new?restaurant_id=` links are dead** — `NewPaymentPage` never reads
  the param.

### Platform mismatch, unresolved
`archive_docs/MVP.md` specifies a **native Android app**: PIN auth, Android 8.0+,
SQLite, 100% offline, APK size, battery drain. The build is a **Next.js web app**
with Clerk email auth and Supabase. The 39 in-scope features were mapped against a
web implementation; items 1 (PIN auth), the offline requirement (AC-01) and the
performance targets are not achievable on this stack as written.

Also on this machine, unrelated to the code: only **0.4 GB free of 15.3 GB**. A
stale `next start -p 3100` from the smoke suite was holding RAM; it has been
stopped. Several unrelated `omni-*` containers are also running.