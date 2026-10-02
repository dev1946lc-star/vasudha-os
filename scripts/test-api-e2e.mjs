// Integration tests for the Rust read endpoints.
//
//   npm run test:api:e2e
//
// Why this exists: the handlers use sqlx's runtime `query_as`, not the
// compile-time-checked `query!` macro, so a wrong column name or type mismatch is
// not a build error — it is a 500 at request time. The middleware tests in
// main.rs never touch the SQL. This boots the real server against a real
// Postgres and calls every endpoint.
//
// Requires Docker and a built binary. Skips cleanly (exit 0) when either is
// missing.

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const CONTAINER = 'vasudha-api-e2e'
const IMAGE = 'postgres:16-alpine'
const PORT = 39411
const BASE = `http://127.0.0.1:${PORT}`
const SECRET = 'integration-test-secret-value'
const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    passed++
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function dockerAvailable() {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function psqlIn(sql, { db = 'postgres' } = {}) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'postgres', '-d', db, '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  if (result.status !== 0) {
    throw new Error(
      `psql failed:\n${result.stdout || ''}\n${result.stderr || ''}`,
    )
  }
  return `${result.stdout || ''}${result.stderr || ''}`
}

function psqlFile(path, opts) {
  return psqlIn(readFileSync(path, 'utf8'), opts)
}

async function get(path, { tenant = TENANT_A, key = SECRET } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': key, 'x-company-id': tenant },
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // left null; callers assert on status or shape
  }
  return { status: res.status, json, text, headers: res.headers }
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  return false
}

function cargoBinaryPath() {
  for (const profile of ['debug', 'release']) {
    const p = `backend/target/${profile}/vasudha-api.exe`
    if (existsSync(p)) return p
  }
  return null
}

async function runEndpointTests() {
  // ── /health ────────────────────────────────────────────────────────
  const health = await fetch(`${BASE}/health`)
  check('GET /health returns 200 without credentials', health.status === 200,
    `got ${health.status}`)
  check('GET /health returns OK', (await health.text()).trim() === 'OK')

  // ── auth ───────────────────────────────────────────────────────────
  const noKey = await fetch(`${BASE}/api/dashboard`, { headers: { 'x-company-id': TENANT_A } })
  check('missing key is rejected', noKey.status === 401, `got ${noKey.status}`)

  const noTenant = await fetch(`${BASE}/api/dashboard`, { headers: { 'x-api-key': SECRET } })
  check('missing tenant is rejected', noTenant.status === 401, `got ${noTenant.status}`)

  const badTenant = await get('/api/dashboard', { tenant: 'not-a-uuid' })
  check('malformed tenant is rejected', badTenant.status === 401, `got ${badTenant.status}`)

  // ── /api/dashboard ─────────────────────────────────────────────────
  const dash = await get('/api/dashboard')
  check('/api/dashboard is 200', dash.status === 200, `got ${dash.status}: ${dash.text.slice(0, 160)}`)

  if (dash.json) {
    const k = dash.json.kpis
    check('dashboard kpis present',
      k && typeof k.today_revenue === 'number' &&
      typeof k.total_stops === 'number' &&
      typeof k.completed_stops === 'number' &&
      typeof k.market_debt === 'number' &&
      typeof k.low_stock_count === 'number',
      JSON.stringify(k))

    // Only one tenant A collection is dated today (d100...0001).
    check('dashboard total_stops is tenant-scoped', k.total_stops === 1, `got ${k.total_stops}`)
    check('dashboard completed_stops counts completed',
      k.completed_stops === 1, `got ${k.completed_stops}`)

    // Only the Ghee row (5) is below its min_stock_level (20). The bulk oil (7)
    // has min_stock_level 2, so it must NOT count.
    check('low_stock_count uses min_stock_level, not a hardcoded 10',
      k.low_stock_count === 1, `got ${k.low_stock_count}`)

    // invoice 1 (2468.50, unpaid) + invoice 2's remainder (811.26)
    check('market_debt excludes paid invoices',
      Math.abs(k.market_debt - 3279.76) < 0.02,
      `got ${k.market_debt}`)

    check('trend_7 is at most 7 entries', dash.json.trend_7.length <= 7,
      `got ${dash.json.trend_7.length}`)
    check('trend_30 is a list', Array.isArray(dash.json.trend_30))
    check('trend points carry a date and a revenue',
      dash.json.trend_30.every((p) => typeof p.payment_date === 'string' && typeof p.total_revenue === 'number'))
  }

  // ── /api/restaurants ───────────────────────────────────────────────
  const rest = await get('/api/restaurants')
  check('/api/restaurants is 200', rest.status === 200, `got ${rest.status}: ${rest.text.slice(0, 160)}`)

  if (rest.json) {
    check('restaurants envelope shape',
      Array.isArray(rest.json.data) && typeof rest.json.total === 'number' &&
      typeof rest.json.page === 'number' && typeof rest.json.page_size === 'number')

    const names = rest.json.data.map((r) => r.name)
    check('restaurants are tenant-scoped (no Beta row)',
      !names.includes('Beta Secret Bistro'), names.join(', '))
    check('restaurants include all three tenant A rows', rest.json.total === 3,
      `got ${rest.json.total}`)
    check('restaurants are sorted by name',
      JSON.stringify(names) === JSON.stringify([...names].sort()),
      names.join(', '))

    // The row with NULL address/phone must serialise those keys as null rather
    // than omitting them, because the frontend renders `address || '—'`.
    const bhavan = rest.json.data.find((r) => r.name === 'Udupi Bhavan')
    check('nullable restaurant fields are present as null',
      bhavan && 'address' in bhavan && bhavan.address === null &&
      'phone' in bhavan && bhavan.phone === null,
      JSON.stringify(bhavan))
  }

  const activeOnly = await get('/api/restaurants?status=active')
  check('restaurants status=active filters correctly',
    activeOnly.json?.total === 2, `got ${activeOnly.json?.total}`)

  const searched = await get('/api/restaurants?search=Malabar')
  check('restaurants search matches by name',
    searched.json?.total === 1, `got ${searched.json?.total}`)

  const searchedByPhone = await get('/api/restaurants?search=9845012345')
  check('restaurants search matches by phone',
    searchedByPhone.json?.total === 1, `got ${searchedByPhone.json?.total}`)

  // A page beyond the end must still report the real total, not 0.
  const pastEnd = await get('/api/restaurants?page=99')
  check('restaurants reports the true total on an out-of-range page',
    pastEnd.json?.total === 3, `got ${pastEnd.json?.total}`)
  check('restaurants returns an empty array past the end',
    Array.isArray(pastEnd.json?.data) && pastEnd.json.data.length === 0)

  const zeroPage = await get('/api/restaurants?page=0')
  check('restaurants clamps page=0 to page 1',
    zeroPage.json?.page === 1, `got ${zeroPage.json?.page}`)

  // ── /api/products ──────────────────────────────────────────────────
  const prod = await get('/api/products')
  check('/api/products is 200', prod.status === 200,
    `got ${prod.status}: ${prod.text.slice(0, 160)}`)

  if (prod.json) {
    // This is the regression that mattered: hsn_code is nullable in the schema
    // but non-nullable in the Rust struct, so a NULL used to abort the decode
    // and return 500 for the whole page.
    check('products with a NULL hsn_code do not break the page',
      prod.json.data.some((p) => p.name === 'Unclassified Bulk' && p.hsn_code === ''),
      `data: ${JSON.stringify(prod.json.data.map((p) => [p.name, p.hsn_code]))}`)

    check('products are tenant-scoped (no Beta row)',
      !prod.json.data.some((p) => p.name === 'Beta Secret Oil'))
    check('products page_size is 15',
      prod.json.page_size === 15, `got ${prod.json.page_size}`)

    const activeProducts = await get('/api/products?status=active')
    check('products status=active excludes inactive',
      !activeProducts.json?.data.some((p) => p.name === 'Discontinued Oil'),
      JSON.stringify(activeProducts.json?.data.map((p) => p.name)))
  }

  const prodSearch = await get('/api/products?search=15121100')
  check('products search matches by HSN code',
    prodSearch.json?.total === 1, `got ${prodSearch.json?.total}`)

  // ── /api/collections/today ─────────────────────────────────────────
  const today = await get('/api/collections/today')
  check('/api/collections/today is 200', today.status === 200,
    `got ${today.status}: ${today.text.slice(0, 160)}`)

  if (today.json) {
    check('today route excludes the inactive restaurant',
      !today.json.stops.some((s) => s.name === 'Closed Diner'),
      today.json.stops.map((s) => s.name).join(', '))
    check('today route is tenant-scoped',
      !today.json.stops.some((s) => s.name === 'Beta Secret Bistro'))
    check('today route counts active restaurants',
      today.json.total === 2, `got ${today.json.total}`)
    check('today route reports completed stops',
      today.json.completed === 1, `got ${today.json.completed}`)
    check('today route computes progress',
      today.json.progress_percent === 50, `got ${today.json.progress_percent}`)

    // The stop with no collection today must report the synthetic status.
    const unvisited = today.json.stops.find((s) => s.collection_id === null)
    check('a stop with no collection reports pending_visit',
      unvisited && unvisited.status === 'pending_visit',
      JSON.stringify(unvisited))

    const visited = today.json.stops.find((s) => s.collection_id !== null)
    check('a visited stop reports its status and amount',
      visited && visited.status === 'completed' && visited.total_amount === 2350,
      JSON.stringify(visited))
  }

  // ── /api/inventory ─────────────────────────────────────────────────
  const inv = await get('/api/inventory')
  check('/api/inventory is 200', inv.status === 200,
    `got ${inv.status}: ${inv.text.slice(0, 160)}`)

  check('/api/inventory returns a bare array (not an envelope)',
    Array.isArray(inv.json), `got ${typeof inv.json}`)
  check('/api/inventory is tenant-scoped',
    Array.isArray(inv.json) && !inv.json.some((i) => i.product_name === 'Beta Secret Oil'),
    JSON.stringify(inv.json?.map?.((i) => i.product_name)))
  check('/api/inventory returns all tenant A rows',
    inv.json?.length === 3, `got ${inv.json?.length}`)
  check('/api/inventory orders low stock first',
    inv.json?.[0]?.product_name === 'Ghee 5kg',
    `got ${inv.json?.[0]?.product_name}`)
  check('/api/inventory flags low stock against min_stock_level',
    inv.json?.find((i) => i.product_name === 'Ghee 5kg')?.is_low_stock === true &&
    inv.json?.find((i) => i.product_name === 'Refined Oil 20L')?.is_low_stock === false)
  // last_updated must be ISO-8601 so the browser can parse it directly. It used
  // to arrive as Postgres' default "2026-10-01 13:26:14.293203+00", which
  // new Date() rejects, so the inventory table showed "Invalid Date".
  check('/api/inventory emits parseable ISO-8601 timestamps',
    inv.json?.every((i) => typeof i.last_updated === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(i.last_updated) &&
      !Number.isNaN(Date.parse(i.last_updated))),
    JSON.stringify(inv.json?.map((i) => i.last_updated)))

  check('/api/inventory timestamps are what new Date() accepts',
    inv.json?.every((i) => new Date(i.last_updated).toISOString().endsWith('Z')))

  // ── /api/payments ──────────────────────────────────────────────────
  const pays = await get('/api/payments')
  check('/api/payments is 200', pays.status === 200,
    `got ${pays.status}: ${pays.text.slice(0, 160)}`)

  if (pays.json) {
    check('payments envelope shape',
      Array.isArray(pays.json.data) && typeof pays.json.total === 'number')
    check('payments are tenant-scoped',
      !pays.json.data.some((p) => p.amount === 11758.82),
      JSON.stringify(pays.json.data.map((p) => p.amount)))
    check('payments join the restaurant name',
      pays.json.data.every((p) => typeof p.restaurant_name === 'string'))
    check('payments page_size is 25', pays.json.page_size === 25, `got ${pays.json.page_size}`)
    check('payments are newest first',
      pays.json.data.length >= 2 &&
      pays.json.data[0].payment_date >= pays.json.data[pays.json.data.length - 1].payment_date,
      JSON.stringify(pays.json.data.map((p) => p.payment_date)))
  }

  const paysPastEnd = await get('/api/payments?page=99')
  check('payments reports the true total past the end',
    paysPastEnd.json?.total === 3, `got ${paysPastEnd.json?.total}`)

  // ── /api/billing ───────────────────────────────────────────────────
  const bill = await get('/api/billing')
  check('/api/billing is 200', bill.status === 200,
    `got ${bill.status}: ${bill.text.slice(0, 160)}`)

  if (bill.json) {
    check('billing envelope shape',
      Array.isArray(bill.json.data) && typeof bill.json.total === 'number')
    check('billing is tenant-scoped (no INV-BETA)',
      !bill.json.data.some((i) => i.invoice_number === 'INV-BETA-0001'),
      JSON.stringify(bill.json.data.map((i) => i.invoice_number)))
    check('billing returns every invoice number',
      bill.json.data.length === 3, `got ${bill.json.data.length}`)
    check('billing exposes a status per invoice',
      bill.json.data.every((i) => typeof i.status === 'string'),
      JSON.stringify(bill.json.data.map((i) => i.status)))
    check('billing orders newest first',
      bill.json.data[0].invoice_date >= bill.json.data[bill.json.data.length - 1].invoice_date)
  }

  // ── /api/outstanding ───────────────────────────────────────────────
  const out = await get('/api/outstanding')
  check('/api/outstanding is 200', out.status === 200,
    `got ${out.status}: ${out.text.slice(0, 160)}`)

  if (out.json) {
    // Note the envelope key is `rows`, unlike every other paginated endpoint.
    check('outstanding uses the `rows` key',
      Array.isArray(out.json.rows) && out.json.data === undefined,
      `keys: ${Object.keys(out.json).join(', ')}`)
    check('outstanding is tenant-scoped',
      !out.json.rows.some((r) => r.restaurant_name === 'Beta Secret Bistro'),
      out.json.rows.map((r) => r.restaurant_name).join(', '))

    const hotel = out.json.rows.find((r) => r.restaurant_name === 'Hotel Malabar')
    check('outstanding has a row per restaurant', out.json.rows.length === 3,
      `got ${out.json.rows.length}`)
    check('outstanding orders by debt descending',
      out.json.rows.every((r, i) => i === 0 ||
        out.json.rows[i - 1].total_outstanding >= r.total_outstanding))

    if (hotel) {
      // invoice 1: 5 days old, unpaid, 2468.50 -> 0-15 bucket
      // invoice 2: 25 days old, partial, 811.26 remaining -> 16-30 bucket
      check('aging puts a 5-day invoice in the 0-15 bucket',
        Math.abs(hotel.bucket_0_15 - 2468.50) < 0.02, `got ${hotel.bucket_0_15}`)
      check('aging puts a 25-day invoice in the 16-30 bucket',
        Math.abs(hotel.bucket_15_30 - 811.26) < 0.02, `got ${hotel.bucket_15_30}`)
      check('paid invoices are excluded from aging',
        hotel.bucket_30_60 === 0 && hotel.bucket_60_plus === 0,
        `30-60: ${hotel.bucket_30_60}, 60+: ${hotel.bucket_60_plus}`)
      check('outstanding total matches the buckets',
        Math.abs(hotel.total_outstanding - (hotel.bucket_0_15 + hotel.bucket_15_30)) < 0.02,
        `total ${hotel.total_outstanding}`)
      check('outstanding counts unpaid invoices',
        hotel.unpaid_invoice_count === 2, `got ${hotel.unpaid_invoice_count}`)
    }

    check('outstanding envelope totals are present',
      typeof out.json.total_outstanding === 'number' &&
      typeof out.json.restaurants_with_debt === 'number',
      JSON.stringify(out.json))
    check('restaurants_with_debt counts only positive balances',
      out.json.restaurants_with_debt === 1, `got ${out.json.restaurants_with_debt}`)
  }

  // ── tenant isolation, side by side ─────────────────────────────────
  const tenantB = await get('/api/restaurants', { tenant: TENANT_B })
  check('tenant B sees only its own restaurant',
    tenantB.json?.data?.length === 1 &&
    tenantB.json.data[0].name === 'Beta Secret Bistro',
    JSON.stringify(tenantB.json?.data?.map((r) => r.name)))

  const dashB = await get('/api/dashboard', { tenant: TENANT_B })
  check('tenant B dashboard does not see tenant A debt',
    dashB.json?.kpis?.market_debt !== dash.json?.kpis?.market_debt,
    `A=${dash.json?.kpis?.market_debt} B=${dashB.json?.kpis?.market_debt}`)

  const invB = await get('/api/inventory', { tenant: TENANT_B })
  check('tenant B inventory is isolated',
    invB.json?.length === 1 && invB.json[0].product_name === 'Beta Secret Oil',
    JSON.stringify(invB.json?.map?.((i) => i.product_name)))
}

async function main() {
  if (!dockerAvailable()) {
    console.log('• Docker not available — skipping API integration tests.')
    return
  }

  const binary = cargoBinaryPath()
  if (!binary) {
    console.log('• Backend binary not built — skipping API integration tests.')
    console.log('  Build it with: cargo build --manifest-path backend/Cargo.toml')
    return
  }

  console.log('• Starting throwaway postgres...')
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })

  // The API process runs on the host, so postgres must be reachable from here.
  const hostPort = 55433
  spawnSync(
    'docker',
    ['run', '-d', '--name', CONTAINER,
      '-e', 'POSTGRES_PASSWORD=postgres',
      '-e', 'POSTGRES_DB=postgres',
      '-p', `${hostPort}:5432`, IMAGE],
    { stdio: 'ignore' }
  )

  // Readiness: two consecutive successes, because initdb briefly runs a
  // temporary server.
  let consecutive = 0
  for (let i = 0; i < 60 && consecutive < 2; i++) {
    try {
      execFileSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' })
      consecutive++
    } catch {
      consecutive = 0
    }
    if (consecutive < 2) await sleep(1000)
  }
  if (consecutive < 2) throw new Error('postgres did not become ready')

  // The DATABASE_URL must be built after the container is up so the database
  // exists before we connect.
  psqlIn('CREATE DATABASE vasudha;')

  console.log('• Applying migrations and fixture...')
  psqlFile('scripts/test-harness-auth-schema.sql')

  const { readdirSync } = await import('node:fs')
  for (const name of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    psqlIn(readFileSync(`supabase/migrations/${name}`, 'utf8'), { db: 'vasudha' })
  }
  psqlFile('scripts/api-fixture.sql', { db: 'vasudha' })

  console.log('• Starting the API...')
  const dbUrl =
    `postgresql://postgres:postgres@127.0.0.1:${hostPort}/vasudha?sslmode=disable`

  const server = spawn(binary, [], {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      API_SECRET: SECRET,
      PORT: String(PORT),
      RUST_LOG: 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLog = ''
  server.stdout.on('data', (d) => { serverLog += d })
  server.stderr.on('data', (d) => { serverLog += d })

  try {
    const up = await waitForHealth()
    if (!up) {
      console.error('\nAPI did not become healthy. Server output:\n' + serverLog)
      failures.push('API never became healthy')
      return
    }

    console.log('• Exercising endpoints...\n')
    await runEndpointTests()
  } finally {
    server.kill()
    await sleep(500)
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  }
}

try {
  await main()

  if (failures.length > 0) {
    console.error(`\n${failures.length} API check(s) failed:`)
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exit(1)
  }

  console.log(`\n${passed} API checks passed.`)
} catch (err) {
  console.error(`\nAPI integration tests could not run: ${err.message}`)
  process.exit(1)
}