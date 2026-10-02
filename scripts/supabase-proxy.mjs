import http from 'node:http'
import crypto from 'node:crypto'

/**
 * LOCAL DEVELOPMENT SHIM -- not a security boundary, and never to be exposed.
 *
 * It exists so the browser can reach the local PostgREST container over http
 * without CORS or mixed-content problems. Everything it does is a shortcut that
 * a real Supabase project does not, and two of them are actively dangerous:
 *
 *   1. It RE-SIGNS every request with this file's shared secret and upgrades the
 *      caller's role to `owner` (see below). Against a real project the token
 *      would be forged rather than merely weak.
 *   2. It INJECTS `DEFAULT_COMPANY_ID` when the caller carries no tenant claim,
 *      so an unauthenticated request is silently given a valid, signed owner
 *      token for tenant 11111111-....
 *
 * The practical effect today: RLS cannot be tested through this proxy, because
 * the proxy hands out an owner token before RLS ever sees the request. Tests that
 * "prove" isolation while pointed at port 54321 prove nothing. The RLS checks in
 * scripts/db-regression.sql run against PostgREST directly for this reason.
 *
 * Never point NEXT_PUBLIC_SUPABASE_URL here for a hosted project, and never bind
 * this beyond localhost.
 */
const PORT = 54321
const TARGET_PORT = 3002
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const DEFAULT_COMPANY_ID = '11111111-1111-1111-1111-111111111111'

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function parseJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (Origin: ${req.headers.origin || 'none'})`)

  // Comprehensive CORS and Private Network Access headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, x-client-info, x-company-id, range, x-upsert')
  res.setHeader('Access-Control-Expose-Headers', 'content-range, range-unit, content-length')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  let targetPath = req.url
  if (targetPath.startsWith('/rest/v1')) {
    targetPath = targetPath.replace('/rest/v1', '') || '/'
  }

  const headers = {
    ...req.headers,
    host: `127.0.0.1:${TARGET_PORT}`,
  }

  const authHeader = req.headers['authorization'] || ''
  if (authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7).trim()
    const payload = parseJwt(rawToken)

    if (payload) {
      if (payload.role === 'service_role') {
        const token = createJwt({
          role: 'service_role',
          iss: 'supabase',
          iat: Math.floor(Date.now() / 1000) - 10,
          exp: Math.floor(Date.now() / 1000) + 7200,
        })
        headers['authorization'] = `Bearer ${token}`
      } else {
        const userId = payload.sub || payload.id || 'user_anonymous'
        const appMeta = payload.app_metadata || {}
        const companyId =
          appMeta.company_id ||
          payload.company_id ||
          payload.public_metadata?.company_id ||
          payload.private_metadata?.company_id ||
          DEFAULT_COMPANY_ID

        let role =
          appMeta.role ||
          payload.public_metadata?.role ||
          payload.private_metadata?.role

        if (!role || role === 'authenticated') {
          role = 'owner'
        }

        const token = createJwt({
          role: 'authenticated',
          sub: userId,
          aud: 'authenticated',
          app_metadata: {
            company_id: companyId,
            role: role,
          },
          iat: Math.floor(Date.now() / 1000) - 10,
          exp: Math.floor(Date.now() / 1000) + 7200,
        })
        headers['authorization'] = `Bearer ${token}`
      }
    }
  }

  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: targetPath,
    method: req.method,
    headers,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res, { end: true })
  })

  proxyReq.on('error', (err) => {
    console.error(`Proxy request error: ${err.message}`)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  })

  req.pipe(proxyReq, { end: true })
})

// Listen on all network interfaces (0.0.0.0) so localhost and 127.0.0.1 both work
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Supabase REST gateway listening on http://0.0.0.0:${PORT} -> PostgREST :${TARGET_PORT}`)
})
