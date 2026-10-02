# VASUDHA OS

<p align="center">
  <strong>ERP for Used Cooking Oil collection and settlement</strong><br/>
  <em>Route collection · Inventory · GST invoicing · Aging &amp; outstanding</em>
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#setup">Setup</a> ·
  <a href="#scripts">Scripts</a> ·
  <a href="#verification">Verification</a> ·
  <a href="#known-gaps">Known gaps</a>
</p>

---

## What it does

VASUDHA OS (Sanskrit: वसुधा — *"The Earth"*) manages the lifecycle of used
cooking oil for distribution businesses: restaurants are onboarded with credit
limits and payment terms, field agents record daily collections against a route,
collections flow into stock, verified collections are batched into GST invoices,
payments settle them, and the aging report shows who owes what and for how long.

| Module | Route | What it covers |
|---|---|---|
| Dashboard | `/dashboard` | Today's revenue, route progress, market debt, low-stock alerts, 30-day trend, aging donut |
| Today's route | `/collections` | Every active restaurant with per-stop status; record and verify collections |
| Restaurants | `/restaurants` | Buyer database, credit limits, payment terms, full transaction history |
| Products | `/products` | Catalog with HSN codes, GST slabs, prices, reorder points |
| Inventory | `/inventory` | Stock levels with low-stock flagging; automatic deduction on dispatch |
| Billing | `/billing` | Invoice list; bulk-generates invoices from verified collections |
| Payments | `/payments` | Payment ledger and printable/PDF receipts |
| Outstanding | `/outstanding` | Per-restaurant aging buckets (0-15 / 16-30 / 31-60 / 60+ days) |
| Reports | `/reports/*` | Daily route, detailed aging, GSTR-1 export, sales by product/restaurant |
| Settings | `/settings/*` | Company profile, tax configuration, staff roles, JSON backup |

### Roles

Five roles, enforced in PostgreSQL Row Level Security (the real boundary) and
mirrored in the UI by `src/lib/auth-guards.ts`:

| Role | Access |
|---|---|
| `owner` | Everything |
| `manager` | Operations only — no billing, payments, or settings |
| `accountant` | Billing, payments, reports, dashboard — no settings |
| `agent` | Field collection only — no billing, payments, reports, or settings |
| `revoked` | Nothing |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                       │
│  React 19 client components ── Zustand (UI state only)       │
│         │                                                    │
│         │ Clerk session JWT (template "supabase")            │
│         ▼                                                    │
│  src/lib/supabase.ts ── accessToken: per-request Clerk JWT   │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router)                                      │
│  Server Components ── src/lib/supabase/server.ts (Clerk JWT) │
│         │                                                    │
│         ├── reads  ──▶ @/lib/api ──▶ Rust API  :3001          │
│         └── writes ──▶ Supabase RPC / tables (RLS-enforced)  │
└─────────────────────────────┬────────────────────────────────┘
                              │ x-api-key + x-company-id
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Rust / Axum API  (backend/)                                  │
│  9 read endpoints, tenant-scoped, PgPool                     │
│         │                                                    │
│         ▼                                                    │
│  PostgreSQL (Supabase)  ── tables · views · triggers · RLS    │
└──────────────────────────────────────────────────────────────┘
```

**Two data paths, deliberately.** Reads go through the Rust API, which talks to
Postgres over the wire protocol (no PostgREST hop). Writes go through Supabase
from the client and from Server Actions, because RLS is the enforcement
mechanism there and the Rust API has no POST/PUT/DELETE handlers yet.

### The tenant boundary

The Rust API connects as the `postgres` role, which **bypasses RLS**. It
therefore cannot infer which company is calling and must be told:

- `src/lib/api.ts` reads `company_id` from the caller's Clerk session claims and
  sends it as `X-Company-Id`.
- The backend middleware validates the `X-Api-Key` in constant time, parses
  `X-Company-Id` as a UUID, and injects it into the request extensions.
- **Every** query filters on `company_id`. A request with a valid key but no
  tenant is rejected with 401 rather than falling back to an unscoped query.

`cargo test` asserts this: no header, wrong key, missing tenant, or malformed
tenant all yield 401 on all eight protected routes.

### Why Clerk + Supabase needs a JWT template

Every RLS policy resolves the tenant from
`request.jwt.claim.app_metadata ->> 'company_id'`. PostgREST populates that from
the verified JWT, and only a token signed with Supabase's JWT secret is
accepted. Clerk signs its own tokens, so the template must be minted *by Clerk
using* Supabase's secret:

```bash
npm run clerk:jwt   # creates/updates the "supabase" template in Clerk
```

Without this, `get_company_id()` returns NULL and RLS denies every query.

### Identity is Clerk's, and the schema reflects that

The schema was originally written for Supabase Auth, which made two things
impossible: Clerk ids are strings (`user_2abc...`), not UUIDs, so staff could not
be added; and `auth.uid()` casts the JWT `sub` to uuid, so `record_collection()`
— the main collection flow — failed for every user.

Migration `26_clerk_identity.sql` fixes both:

- `profiles.id` and `collections.agent_id` are `TEXT`, holding Clerk ids
- `public.current_user_id()` reads the raw `sub` claim, bypassing `auth.uid()`
- `public.clerk_metadata` mirrors `role`/`company_id`/`is_active` per Clerk user,
  and a trigger keeps it in step. This replaces the `auth.users.raw_app_meta_data`
  trigger, which is a Supabase Auth mechanism that silently did nothing here.

`src/lib/session-claims.ts` is the bridge that finishes the job: it reads the
authoritative profile from Postgres and copies those claims onto the Clerk user,
so the next request's JWT carries them and RLS can work. It uses the service role
deliberately — a brand-new user has no `company_id` in their JWT yet, so every RLS
policy would evaluate false and the row would be invisible, which is the exact
situation the bridge exists to resolve. The lookup is keyed on the verified Clerk
id and never on client input.

**Staff are created through Clerk's admin API, not Supabase Auth.** The old code
called `supabaseAdmin.auth.signUp`, minting an identity the application never
reads. No PIN handling remains either — Clerk's invite flow means the app never
touches a password.

### Onboarding

A signed-in user with no profile lands on `/onboarding` and creates their company.
This path did not exist before: the layout redirected to
`/login?error=missing_company`, which bounced back to the same dead end because
nothing ever created a company, so a new user could never get in.

`/access-revoked` is the other half. Revoking a user in Settings → Users now
actually locks them out: the layout reads `is_active` from the profile and routes
them there. Previously `revoked` was enforced only by a client-side route guard.

### SECURITY DEFINER functions authorise themselves

`SECURITY DEFINER` runs as the function owner, which **bypasses RLS**. Every
mutating RPC therefore has to check the caller's role itself — and none of them
did. They verified only that a `company_id` was present in the JWT, so a revoked
user could still record collections, and any agent could add stock or generate
invoices despite the RLS policies restricting those tables.

Migration `27_rpc_authorization.sql` adds `public.assert_role()` and applies it
to `record_collection`, `add_stock`, `generate_bulk_invoice`,
`update_company_profile`, `update_tax_settings`, and `update_user_status`, with
each allowed set taken from the corresponding RLS policy so the database and the
UI agree. It also stops an owner revoking themselves and rejecting
cross-tenant restaurants and products.

---

## Setup

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Frontend and scripts |
| Rust | 1.75+ | Backend |
| Supabase CLI | latest | Applying migrations |

### 1. Environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page — server only, bypasses RLS |
| `SUPABASE_JWT_SECRET` | Same page → JWT Settings → **JWT Secret** (not the anon key) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Clerk → API Keys |
| `RUST_API_URL` | `http://localhost:3001` |
| `RUST_API_SECRET` | Any random 32-char string; **must match** `API_SECRET` in `backend/.env` |

Generate the shared secret with `openssl rand -hex 32`.

Then mirror the backend values:

```bash
cp backend/.env.example backend/.env
# set DATABASE_URL and API_SECRET (same value as RUST_API_SECRET)
```

The backend refuses to start if `API_SECRET` is unset or under 16 characters.

### 2. Database

```bash
npm run db:reset    # drops and re-applies supabase/migrations/*
```

### 3. Clerk JWT template

```bash
npm run clerk:jwt
```

### 4. Seed a demo tenant

```bash
npm run seed
```

Creates a company, an owner login, 8 restaurants, 6 products, ~12 months of
collections, invoices, and payments. It prints the demo credentials.

### 5. Run

```bash
npm run api     # Rust API on :3001
npm run dev     # Next.js on :3000
```

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run api` | Rust API (`cargo run`) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Route-guard tests |
| `npm run test:api` | Rust middleware tests (`cargo test`) |
| `npm run test:db` | Applies all migrations to a throwaway Postgres and runs 33 behavioural checks |
| `npm run test:api:e2e` | Boots the real API against a throwaway Postgres and runs 76 endpoint checks |
| `npm run test:smoke` | Boots the built app and requests every route (42 checks) |
| `npm run verify` | Everything above, then `next build` |
| `npm run seed` | Seed a demo tenant |
| `npm run clerk:jwt` | Provision the Clerk "supabase" JWT template |
| `npm run db:reset` | Reapply migrations against your own Supabase |

---

## Verification

`npm run verify` runs the full gate:

```
typecheck      → 0 errors
lint           → 0 errors (4 warnings, see below)
test           → route-guard assertions
test:api       → 8 middleware assertions (auth + tenant isolation)
test:db        → 28 migrations apply cleanly, 49 behavioural assertions
test:api:e2e   → 76 endpoint assertions against a live API + Postgres
build          → 34 routes
test:smoke     → 42 runtime assertions against the built app
```

### `test:smoke` — the runtime gate

Every other suite is static or database-level. A broken JSX tag, a bad import,
or a Server Component that throws while rendering passes `typecheck`, passes
`lint`, and passes every database test — it only fails when someone requests the
page. This boots the built app on a free port and requests all 21 routes,
asserting that public ones render, protected ones redirect rather than render,
and nothing returns a 500 or an error digest.

**Its limit, stated plainly:** these are unauthenticated requests. It catches 500s,
bad imports and render crashes. It does *not* exercise authenticated pages — which
is exactly where a real bug lived: `resolveCompanyId` read the company from the
session's Clerk claims, which lag a profile creation by one request, so every data
page threw "No company is associated with this session" immediately after
onboarding. Static analysis, the database suite and the endpoint suite all passed
while the app was unusable. `src/lib/session-claims.ts` is the single source of
truth for the tenant now, so the layout and the data client cannot disagree.

### `test:db` — database behaviour

Boots a disposable `postgres:16` container, stubs the `auth` schema that Supabase
normally provides, replays `supabase/migrations/*` in order, then exercises the
business logic:

- stock is deducted on dispatch, and returns add back
- overselling is rejected with an actionable message and leaves no orphan rows
- agents cannot verify collections
- invoice numbers are per-company, per-month, and unique
- invoice status tracks payments, `cancelled` is terminal, and moving a payment
  recomputes both invoices
- the outstanding views never cross tenant boundaries
- Clerk ids round-trip through `profiles`, `collections.agent_id`, and the
  `clerk_metadata` mirror
- revocation propagates to the mirror, and a `SECURITY DEFINER` RPC rejects a
  revoked role without touching stock
- each mutating RPC refuses roles the RLS policy excludes (an agent cannot add
  stock, invoice, change tax settings, or revoke a peer)
- an owner cannot revoke themselves; cross-tenant restaurants and products are
  rejected

### `test:api:e2e` — endpoint behaviour

The handlers use sqlx's runtime `query_as`, so a wrong column name is a 500 at
request time, not a compile error. This suite starts the actual server, seeds two
tenants with edge-case data (a product with NULL `hsn_code`, a restaurant with no
address, an inactive restaurant, unpaid/partial/paid invoices spanning every aging
bucket), and asserts:

- every endpoint returns 200 with the documented envelope shape
  (`/api/inventory` is a bare array; `/api/outstanding` uses `rows`, not `data`)
- pagination reports the true total even when the page is past the end
- nulls are emitted as `null` rather than omitted
- timestamps are ISO-8601 the browser can parse
- low-stock counting agrees with `min_stock_level`, not a hardcoded threshold
- no response contains the other tenant's data

Neither suite touches your real database, and both skip cleanly where Docker is
absent.

The 4 remaining lint warnings are deliberate:

- 2 × `jsx-a11y/alt-text` on `@react-pdf/renderer`'s `Image`, which has no `alt`
  prop. The rule cannot be satisfied without an incorrect prop.
- 2 × `react-hooks/incompatible-library`, the React Compiler noting it will skip
  memoizing components that call `react-hook-form`'s `watch()`.

---

## Known gaps

These are real and deliberate, not oversights:

| Gap | Impact | Where |
|---|---|---|
| **No write endpoints on the Rust API** | Writes round-trip through Supabase instead | `backend/src/routes/` |
| **Tenant scoping is header-based** | A leaked `API_SECRET` lets a caller read any company by supplying a different `X-Company-Id`. Fine while only the Next.js server calls it; real multi-tenancy needs a verified identity claim | `backend/src/main.rs` |
| **Client-side writes depend on the JWT template** | If `npm run clerk:jwt` was never run, every client write fails with an RLS denial | `src/lib/supabase.ts` |
| **Route guards are client-side** | `canAccessRoute` is UX, not security. RLS is the boundary | `src/lib/auth-guards.ts` |
| **Restore is not implemented** | Export works. Restore is an explicit disabled control rather than a button that pretends to work | `settings/backup` |
| **Offline-first is not implemented** | The product vision mentions it; there is no service worker or sync queue | — |
| **No React component tests** | Coverage is route guards, backend middleware, database behaviour, and endpoint behaviour — nothing renders a component or exercises a Server Action | — |

---

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design principles, data flow, security layers |
| [TECH_STACK.md](./TECH_STACK.md) | Technology choices and rationale |
| [backend/README.md](./backend/README.md) | API endpoints, envelopes, error format, tenancy |
| [TODO.md](./TODO.md) | Migration status and remaining work |

---

## License

Copyright © 2025–2026 VASUDHA OS. All rights reserved. Proprietary and
confidential.