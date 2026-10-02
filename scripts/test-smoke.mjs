// Runtime smoke test for the Next.js app.
//
//   npm run test:smoke            # boots `next start` on a free port
//   npm run test:smoke -- --dev   # against `next dev`
//
// Why this exists: every other suite here is static or database-level. A broken
// JSX tag, a bad import, or a Server Component that throws at render time passes
// typecheck and lint and only shows up when a request is actually served. This
// boots the app and requests every route.
//
// SCOPE LIMIT, stated plainly: these are unauthenticated requests, so protected
// routes are expected to redirect. This catches 500s, bad imports and render
// crashes — it does NOT exercise authenticated pages, which is where the
// "no company associated with this session" class of bug lived.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const useDev = process.argv.includes('--dev')
const PORT = Number(process.env.SMOKE_PORT ?? 31777)
const BASE = `http://127.0.0.1:${PORT}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Routes that must render for an anonymous visitor. */
const PUBLIC_ROUTES = ['/', '/login', '/signup']

/** Routes that must redirect rather than render or crash. */
const PROTECTED_ROUTES = [
  '/dashboard',
  '/collections',
  '/restaurants',
  '/products',
  '/inventory',
  '/billing',
  '/payments',
  '/outstanding',
  '/reports',
  '/settings',
  '/settings/users',
  '/collections/new',
  '/inventory/add',
  '/invoices/generate',
  '/payments/new',
  '/restaurants/new',
  '/products/new',
]

let passed = 0
const failures = []

function check(label, ok, detail = '') {
  if (ok) passed++
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

async function probe(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  const body = await res.text()
  return { status: res.status, body }
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (res.status < 500) return true
    } catch {
      // not listening yet
    }
    await sleep(750)
  }
  return false
}

async function main() {
  if (!existsSync('.next')) {
    console.log('• No .next build found — run `npm run build` first. Skipping.')
    return
  }

  console.log(`• Starting ${useDev ? 'next dev' : 'next start'} on :${PORT}...`)
  // Spawn the local Next binary directly. `npx` is a .cmd shim on Windows and is
  // not resolvable by spawn() without a shell, which fails with ENOENT.
  const nextBin = existsSync('node_modules/next/dist/bin/next')
    ? 'node_modules/next/dist/bin/next'
    : null

  if (!nextBin) {
    console.error('• Could not find node_modules/next/dist/bin/next — run npm install.')
    failures.push('next binary not found')
    return
  }

  const server = spawn(
    process.execPath,
    [nextBin, useDev ? 'dev' : 'start', '--port', String(PORT)],
    {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  server.on('error', (err) => {
    console.error('• Failed to spawn the Next server:', err.message)
  })

  let log = ''
  server.stdout.on('data', (d) => { log += d })
  server.stderr.on('data', (d) => { log += d })

  try {
    if (!(await waitForServer())) {
      console.error('\nServer never became ready. Output:\n' + log)
      failures.push('server did not become ready')
      return
    }

    console.log('• Probing routes...\n')

    for (const route of PUBLIC_ROUTES) {
      const { status, body } = await probe(route)
      check(`${route} renders`, status === 200 || status === 307,
        `status ${status}${status >= 500 ? `\n${body.slice(0, 400)}` : ''}`)
      check(`${route} does not 500`, status < 500, `status ${status}`)
    }

    for (const route of PROTECTED_ROUTES) {
      const { status, body } = await probe(route)
      check(`${route} does not 500`, status < 500,
        `status ${status}${status >= 500 ? `\n${body.slice(0, 400)}` : ''}`)
      // Unauthenticated: Clerk must redirect rather than render the page body.
      check(`${route} redirects when signed out`,
        status === 307 || status === 302 || status === 401 || status === 403,
        `expected a redirect, got ${status}`)
    }

    // A crash during render shows up as a 500 or as Next's error payload.
    const dashboard = await probe('/dashboard')
    check('no server-render crash payload on /dashboard',
      !dashboard.body.includes('digest'), 'rendered an error digest')

    // /login must actually contain the Clerk sign-in form, not a blank shell.
    const login = await probe('/login')
    check('/login renders a sign-in form',
      /sign-?in|email|password/i.test(login.body),
      'no sign-in markup found')
  } finally {
    server.kill()
    await sleep(500)
    // Kill the process tree so the port is released on Windows.
    spawnSync('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' })
  }
}

try {
  await main()

  if (failures.length > 0) {
    console.error(`\n${failures.length} smoke check(s) failed:`)
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exit(1)
  }

  console.log(`\n${passed} smoke checks passed.`)
} catch (err) {
  console.error(`\nSmoke test could not run: ${err.message}`)
  process.exit(1)
}