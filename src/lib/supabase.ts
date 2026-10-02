import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * Clerk owns authentication; Supabase needs a JWT it recognises so that
 * `auth.uid()` and `request.jwt.claim.app_metadata` resolve, which is what every
 * RLS policy in supabase/migrations/02_rls_policies.sql keys off.
 *
 * Without this, the browser client is anonymous, `get_company_id()` returns
 * NULL, and every policy evaluates to false — so all reads return nothing and
 * all writes are rejected.
 *
 * `accessToken` is invoked per request, so the token is always fresh and there
 * is no cached header to invalidate on sign-in/sign-out. It pairs with the
 * Clerk JWT template named "supabase", the same one the server client uses.
 *
 * See scripts/setup-clerk-jwt.mjs for how to provision that template.
 */
type ClerkSession = {
  getToken: (opts?: { template?: string }) => Promise<string | null>
}

async function clerkAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const clerk = (
    window as unknown as {
      Clerk?: { session?: ClerkSession | null }
    }
  ).Clerk

  if (!clerk?.session) return null

  try {
    return await clerk.session.getToken({ template: 'supabase' })
  } catch {
    // The template may not exist yet, or the session may be mid-refresh. An
    // absent token simply means RLS denies the request, which is the correct
    // outcome for an unauthenticated caller.
    return null
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  accessToken: clerkAccessToken,
  auth: {
    // Clerk is the session authority; Supabase must not keep its own.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})