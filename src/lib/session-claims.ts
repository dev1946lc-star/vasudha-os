import { cache } from "react"
import { after } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import type { Role } from "@/lib/auth-guards"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * The caller's profile: company, role, and whether their access is still live.
 *
 * This is the bridge between Postgres (which owns authorisation) and Clerk (which
 * owns identity). Every RLS policy resolves the tenant from
 * `request.jwt.claim.app_metadata`, and that only exists if Clerk's private
 * metadata carries it. So after reading the authoritative profile we push it onto
 * the Clerk user; the next request's JWT then carries the claims and RLS can do
 * its job.
 *
* The read uses the service role deliberately. It cannot use the RLS-scoped
 * client: a brand-new user has no company_id in their JWT yet, so every policy
 * would evaluate false and the row would be invisible �?" the exact situation this
 * function exists to resolve. The lookup is keyed on the Clerk user id taken from
 * a verified session, never on anything client-supplied, so this does not widen
 * access: it only reads that one user's own profile.
 *
 * NOTE: the docstring above used to say the claims live in
 * `request.jwt.claim.app_metadata`. PostgREST retired those per-claim settings
 * (this project is served by postgrest/16.4) and publishes the whole payload as
 * `request.jwt.claims` instead, so every RLS policy was silently evaluating
 * NULL. migration 28 repoints the claim helpers; see that file for the detail.
 */
export type AccessProfile = {
  company_id: string
  role: Role
  name: string
  is_active: boolean
}

/** `cache` dedupes within a single render pass, so a page calling this twice
 *  does not read the profile or hit Clerk twice. */
export const resolveAccess = cache(async (userId: string): Promise<AccessProfile | null> => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set so the server can read the caller's profile.",
    )
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: profile, error } = await db
    .from("profiles")
    .select("company_id, role, name, is_active")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("Could not read profile for", userId, error)
    return null
  }

  // No profile yet: the user still needs to complete onboarding.
  if (!profile) return null

  if (profile.is_active === false) {
    return {
      company_id: profile.company_id,
      role: "revoked",
      name: profile.name,
      is_active: false,
    }
  }

  // Deliberately not part of the response path. Clerk answers in ~400ms at best
  // and seconds at worst, and awaiting it here made every authenticated page pay
  // that latency for a metadata write that only matters to a LATER request's JWT.
  //
  // `after` schedules this once the response is already on the wire. A bare
  // floating promise would race request teardown and lose the write on cold
  // starts; after() does not. Deferred rather than dropped, because Postgres is
  // authoritative here, so a sync that lands late can only delay a claim that is
  // already correct by the time anyone reads it. syncClerkMetadata is idempotent
  // and swallows its own errors.
  after(async () => {
    await syncClerkMetadata(userId, {
      company_id: profile.company_id,
      role: profile.role,
    })
  })

  return {
    company_id: profile.company_id,
    role: profile.role as Role,
    name: profile.name,
    is_active: profile.is_active,
  }
})

/**
 * Copy the authoritative claims onto the Clerk user so they appear in the JWT.
 *
 * Only writes when something actually changed: this runs on every authenticated
 * request, and an unconditional Clerk write would be both slow and, for a user
 * with many tabs, a stream of redundant updates.
 */
async function syncClerkMetadata(
  userId: string,
  claims: { company_id: string; role: string },
): Promise<void> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const current = (user.privateMetadata ?? {}) as Record<string, unknown>

    if (current.company_id === claims.company_id && current.role === claims.role) {
      return
    }

    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        ...current,
        company_id: claims.company_id,
        role: claims.role,
      },
    })
  } catch (err) {
    // A failed metadata sync degrades to "this request cannot see data", which the
    // caller already handles. It must not take the page down.
    console.error("Could not sync Clerk private metadata for", userId, err)
  }
}