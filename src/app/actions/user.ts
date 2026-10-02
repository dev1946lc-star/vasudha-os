"use server"

import { clerkClient } from "@clerk/nextjs/server"
import { createClient } from "@/lib/supabase/server"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

const ROLES = ["agent", "accountant", "manager"] as const
type StaffRole = (typeof ROLES)[number]

export type AddStaffResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Create a staff account.
 *
 * Identity is Clerk's, so this has to go through Clerk's admin API. The previous
 * implementation called `supabaseAdmin.auth.signUp`, which created a *Supabase*
 * auth user that this application never reads — anyone added through the UI could
 * never sign in. Worse, `profiles.id` was a UUID at the time, so inserting a Clerk
 * id failed outright.
 *
 * The Clerk user is created with the email left unverified: they set their own
 * password through Clerk's invitation flow, which avoids the app ever handling a
 * password or a PIN.
 */
export async function addStaffUser(input: {
  email: string
  name: string
  role: StaffRole
}): Promise<AddStaffResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, error: "You must be signed in to add staff." }
  }

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  if (!email || !name) {
    return { ok: false, error: "Name and email are required." }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email address does not look valid." }
  }

  if (!ROLES.includes(input.role)) {
    return { ok: false, error: `"${input.role}" is not an assignable role.` }
  }

  // Only an owner may add staff. The database enforces this too, but failing
  // early gives a clear message instead of an RLS denial.
  const supabase = await createClient()

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .single()

  if (meError || !me) {
    return { ok: false, error: "Could not resolve your company." }
  }

  if (me.role !== "owner") {
    return { ok: false, error: "Only an owner can add staff." }
  }

  const client = await clerkClient()

  // A random password the user will never know. Clerk requires an initial
  // credential to create a user, but the account is only usable once they follow
  // the invitation and choose their own — so this value exists only to satisfy the
  // API, not to authenticate anyone.
  const unusablePassword = `!${crypto.randomUUID().replace(/-/g, "")}`

  let clerkUserId: string
  try {
    const created = await client.users.createUser({
      emailAddress: [email],
      firstName: name,
      password: unusablePassword,
    })
    clerkUserId = created.id

    // Without this the account exists but can never sign in: the random password
    // is unknown to them and Clerk has no reset flow wired up.
    //
    // No metadata is attached to the invitation. `role` and `company_id` must
    // only ever live on private metadata (public metadata is writable from the
    // frontend), and `resolveAccess` copies them onto the Clerk user from the
    // database on their first signed-in request anyway.
    await client.invitations.createInvitation({
      emailAddress: email,
      // Where the invitation link lands after they accept.
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
    })
  } catch (err) {
    const message =
      err && typeof err === "object" && "errors" in err && Array.isArray(err.errors)
        ? err.errors.map((e) => (e as { longMessage?: string }).longMessage ?? "").join("; ")
        : (err as Error)?.message ?? ""
    return {
      ok: false,
      error: message
        ? `Could not create the account: ${message}`
        : "Could not create the account.",
    }
  }

  // The profiles row is what grants company access. If this fails the Clerk user
  // exists but cannot see anything, so delete it rather than leave a dead
  // identity behind.
  const { error: profileError } = await supabase.from("profiles").insert({
    id: clerkUserId,
    company_id: me.company_id,
    role: input.role,
    name,
    is_active: true,
  })

  if (profileError) {
    try {
      await client.users.deleteUser(clerkUserId)
    } catch {
      // Best effort — report the original failure.
    }
    return {
      ok: false,
      error: `The account was created but could not be given access: ${profileError.message}`,
    }
  }

  revalidatePath("/settings/users")

  return { ok: true, id: clerkUserId }
}