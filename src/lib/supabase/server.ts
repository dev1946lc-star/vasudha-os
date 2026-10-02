import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'
import { auth } from '@clerk/nextjs/server'
import { cache } from 'react'

export const createClient = cache(async () => {
  const cookieStore = await cookies()
  const { getToken } = await auth()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  // getToken() *throws* if the named JWT template does not exist in the Clerk
  // instance. An unconfigured template is a deployment mistake, not a reason to
  // crash every Server Component in the app, so it degrades to an anonymous
  // request — which RLS then denies, producing a clear "no rows" instead of a
  // stack trace. Run `npm run clerk:jwt` to fix it properly.
  let supabaseToken: string | null = null
  try {
    supabaseToken = await getToken({ template: 'supabase' })
  } catch (err) {
    console.error(
      'Could not mint a Clerk "supabase" JWT template token. ' +
        'Run `npm run clerk:jwt`. Falling back to an anonymous request, which RLS will deny.',
      err instanceof Error ? err.message : err,
    )
  }

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          ...(supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : {}),
        },
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
})
