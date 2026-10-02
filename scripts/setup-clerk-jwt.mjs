// Provisions the Clerk "supabase" JWT template that src/lib/supabase.ts and
// src/lib/supabase/server.ts both request.
//
//   node --env-file=.env scripts/setup-clerk-jwt.mjs
//
// Why this is required: Clerk is the session authority, but every Supabase RLS
// policy resolves the tenant from `request.jwt.claim.app_metadata`. PostgREST
// populates that from the verified JWT, and only a JWT signed with Supabase's
// JWT secret is accepted. Clerk signs its own tokens, so the template has to be
// minted by Clerk *using* Supabase's secret as the signing key.
//
// Without this, `get_company_id()` returns NULL and RLS denies every query.
//
// Idempotent: updates the template if it already exists.

const CLERK_API = 'https://api.clerk.com/v1'

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET

if (!CLERK_SECRET_KEY) {
  console.error('Missing CLERK_SECRET_KEY.')
  process.exit(1)
}
if (!SUPABASE_JWT_SECRET) {
  console.error('Missing SUPABASE_JWT_SECRET.')
  console.error('Find it in Supabase Dashboard → Settings → API → JWT Settings → JWT Secret.')
  console.error('This is NOT the anon/publishable key. On projects using the newer')
  console.error('sb_publishable_/sb_secret_ keys, the anon key is not a signing secret')
  console.error('at all, so it cannot be used here.')
  process.exit(1)
}

const TEMPLATE_NAME = 'supabase'

const claims = {
  // `sub` is reserved — Clerk sets it to the user id automatically.
  aud: 'authenticated',
  // These two are what the RLS policies read:
  //   public.get_company_id() -> request.jwt.claim.app_metadata ->> 'company_id'
  //   public.get_user_role()  -> request.jwt.claim.app_metadata ->> 'role'
  //
  // private_metadata, not public_metadata: public metadata is writable from the
  // browser, so a claim read from it cannot be trusted for authorisation. The app
  // writes these two fields to private metadata in src/lib/session-claims.ts.
  app_metadata: {
    role: '{{user.private_metadata.role}}',
    company_id: '{{user.private_metadata.company_id}}',
  },
}

const body = {
  name: TEMPLATE_NAME,
  claims,
  // Clerk signs with Supabase's secret so Supabase accepts the token.
  signing_algorithm: 'HS256',
  signing_key: SUPABASE_JWT_SECRET,
  lifetime: 60 * 60, // seconds; Supabase re-verifies on every request
}

const headers = {
  Authorization: `Bearer ${CLERK_SECRET_KEY}`,
  'Content-Type': 'application/json',
}

async function main() {
  const listRes = await fetch(`${CLERK_API}/jwt_templates`, { headers })
  const templates = listRes.ok ? await listRes.json() : []
  const existing = Array.isArray(templates) ? templates.find((t) => t.name === TEMPLATE_NAME) : null

  const method = existing ? 'PATCH' : 'POST'
  const url = existing
    ? `${CLERK_API}/jwt_templates/${existing.id}`
    : `${CLERK_API}/jwt_templates`

  const res = await fetch(url, { method, headers, body: JSON.stringify(body) })

  if (!res.ok) {
    const detail = await res.text()
    console.error(`Failed to ${method} the JWT template: ${res.status} ${detail}`)
    console.error('\nCheck that CLERK_SECRET_KEY is valid and the Clerk instance')
    console.error('is the one backing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.')
    process.exit(1)
  }

  const saved = await res.json()

  console.log(`✓ Clerk JWT template "${TEMPLATE_NAME}" ${existing ? 'updated' : 'created'}`)
  console.log('  app_metadata reads from privateMetadata (set by src/lib/session-claims.ts)')

  // Verify rather than assume. Clerk accepts signing_algorithm: 'HS256' on a
  // development instance and silently returns RS256 with no signing key, which
  // Supabase cannot verify — the failure is invisible until every RLS read comes
  // back empty.
  if (saved.signing_algorithm !== 'HS256' || !saved.signing_key) {
    console.error(
      `\n✗ Saved as ${saved.signing_algorithm} with ${saved.signing_key ? 'a' : 'no'} signing key,` +
        ' but Supabase only verifies HS256 tokens signed with the project JWT secret.',
    )
    console.error('\n  Custom symmetric signing keys are a Clerk *production* feature; on a')
    console.error('  development instance Clerk silently ignores the request. Options:')
    console.error('    1. Move this Clerk instance to production, then re-run this script.')
    console.error("    2. In Supabase → Settings → API → JWT Settings, set the JWT secret to")
    console.error("       the Clerk instance's PEM public key so Supabase verifies RS256.")
    console.error('    3. Bypass the JWT bridge: use the service-role client on the server')
    console.error('       (src/lib/session-claims.ts already does) and rely on explicit')
    console.error('       company_id scoping instead of RLS.')
    process.exit(2)
  }

  console.log(`✓ HS256 signing verified, lifetime ${saved.lifetime}s`)
  console.log('\nSign in once so each user\'s privateMetadata is populated, then confirm a')
  console.log('read through the SSR client is no longer empty.')
}

main().catch((err) => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})