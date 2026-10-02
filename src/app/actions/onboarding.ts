"use server"

import { createClient } from "@supabase/supabase-js"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/i

/**
 * Create the company and the caller's owner profile.
 *
 * There is deliberately no `redirect` here: throwing NEXT_REDIRECT from inside a
 * try/catch gets swallowed by the catch block, which then reports a fake failure
 * to the user. The action returns, and the client navigates.
 *
 * Uses the service role because a brand-new user has no company_id in their JWT,
 * so no RLS policy would permit the insert. Every field is validated first, and
 * the profile is pinned to the caller's own Clerk id.
 */
export type OnboardingResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string }

/**
 * Create the company and the caller's owner profile.
 *
 * Returns a result rather than throwing. In a production build Next.js replaces a
 * thrown Server Action error with a generic "an error occurred" message, so every
 * validation message below would be replaced with noise the user cannot act on.
 *
 * Uses the service role because a brand-new user has no company_id in their JWT,
 * so no RLS policy would permit the insert. Every field is validated first, and
 * the profile is pinned to the caller's own Clerk id.
 */
export async function createCompanyAndProfile(input: {
  companyName: string
  gstNumber: string
  address: string
  ownerName: string
}): Promise<OnboardingResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, error: "You must be signed in to set up a company." }
  }

  const companyName = input.companyName.trim()
  const ownerName = input.ownerName.trim()
  const gstNumber = input.gstNumber.trim().toUpperCase()
  const address = input.address.trim()

  if (companyName.length < 2) {
    return { ok: false, error: "Company name must be at least 2 characters." }
  }
  if (ownerName.length < 2) {
    return { ok: false, error: "Your name must be at least 2 characters." }
  }
  if (gstNumber && !GSTIN.test(gstNumber)) {
    return {
      ok: false,
      error: "That does not look like a valid GSTIN (e.g. 29ABCDE1234F1Z5).",
    }
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Already set up: send them onward rather than creating a second company.
  const { data: existing } = await db
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle()

  if (existing?.company_id) {
    return { ok: true, companyId: existing.company_id }
  }

  const { data: company, error: companyError } = await db
    .from("companies")
    .insert({
      name: companyName,
      gst_number: gstNumber || null,
      address: address || null,
      // Opening GST slab for the product catalog. Editable in Settings → Tax.
      default_gst_rate: 5,
    })
    .select("id")
    .single()

  if (companyError) {
    return { ok: false, error: `Could not create the company: ${companyError.message}` }
  }

  const { error: profileError } = await db.from("profiles").insert({
    id: userId,
    company_id: company.id,
    role: "owner",
    name: ownerName,
    is_active: true,
  })

  if (profileError) {
    return { ok: false, error: `Could not create your profile: ${profileError.message}` }
  }

  // The profiles trigger has mirrored this into clerk_metadata; resolveAccess
  // picks it up and pushes it onto the Clerk user on the next request.
  revalidatePath("/", "layout")

  return { ok: true, companyId: company.id }
}