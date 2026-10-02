# Vasudha API — Rust/Axum Backend

A blazing-fast internal API server built with Axum + sqlx that connects **directly** to Supabase PostgreSQL (no REST API overhead).

## Why This Is Fast

| Layer | Supabase REST | Vasudha API (Rust) |
|---|---|---|
| Protocol | HTTP/JSON (PostgREST) | TCP → Postgres wire protocol |
| Serialization | JS/TS | serde_json (fastest JSON on any platform) |
| Runtime | Node.js (GC pauses) | Tokio (zero-cost async) |
| Dashboard KPIs | 4 HTTP round-trips | 1 single DB query (CTE) |
| Connection pooling | Per-request | Shared `PgPool` (pre-warmed) |

## Setup

### 1. Create `.env` in this directory

```env
# Direct Postgres connection string (NOT the Supabase REST URL)
# Find it in: Supabase Dashboard → Settings → Database → Connection string
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.hlerjucjakatvxckzkdr.supabase.co:5432/postgres?sslmode=require

# Shared secret between Next.js and this API (set the same value in the root .env)
API_SECRET=change-me-to-a-random-string

# Port (default 3001)
PORT=3001
```

### 2. Run the server

```bash
cd backend
cargo run --release
```

### 3. Add to Next.js `.env`

```env
RUST_API_URL=http://localhost:3001
RUST_API_SECRET=change-me-to-a-random-string
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | no | Liveness probe. Returns `OK` as plain text. |
| GET | `/api/dashboard` | yes | All KPIs + 30-day revenue trend |
| GET | `/api/restaurants?page=&search=&status=` | yes | Paginated restaurants (25/page) |
| GET | `/api/products?page=&search=&status=` | yes | Paginated products (15/page) |
| GET | `/api/collections/today` | yes | Today's route with per-stop status |
| GET | `/api/inventory` | yes | Stock levels. Returns a bare JSON **array**, not an envelope. |
| GET | `/api/payments?page=` | yes | Paginated payments (25/page) |
| GET | `/api/billing?page=` | yes | Paginated invoices (25/page) |
| GET | `/api/outstanding` | yes | Aging breakdown. Envelope key is `rows`, not `data`. |

All response keys are `snake_case`, matching the Rust structs.

### Response envelopes

Paginated endpoints return `{ data, total, page, page_size }`. `/api/outstanding`
returns `{ rows, total_outstanding, restaurants_with_debt }` and `/api/inventory`
returns a bare array — the client in `src/lib/api.ts` already accounts for all
three shapes.

## Security notes

The connection string uses the direct `postgres` role over the Postgres wire
protocol, which **bypasses Row Level Security** (RLS only applies to the
`authenticated`/`anon` roles that PostgREST uses). None of the queries filter on
`company_id`, so a valid `X-Api-Key` sees every tenant's data.

This is acceptable for a single-tenant deployment. For multi-tenant, resolve the
company from the authenticated caller and add a `company_id` predicate to each
query before exposing this API beyond localhost.

Note also that the server binds `127.0.0.1` only, so it is not reachable from
other hosts or containers unless you change the bind address in `src/main.rs`.

## Error responses

Errors are bare status codes with an empty body — the detail goes to the tracing
log, not the response:

| Status | Meaning |
|---|---|
| `401` | Missing or wrong `X-Api-Key` |
| `400` | Unparseable query string |
| `500` | SQL error (see the server log for the cause) |

Clients must check `res.ok` before calling `res.json()`.
