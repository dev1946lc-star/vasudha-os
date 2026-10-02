"use server"

import { createClient } from "@/lib/supabase/server"
import { resolveAccess } from "@/lib/session-claims"
import { paymentSchema } from "@/lib/validations/payment"
import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"

export type ActionState = {
  success?: boolean
  error?: string
  /** How much of the payment was matched to open invoices. */
  allocated?: number
  /** Surplus held as credit for the restaurant (advance on account). */
  creditLeft?: number
  /** How many invoices the payment touched. */
  invoicesHit?: number
  paymentId?: string
}

export async function recordPaymentAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()

  // Parse and validate the form data
  const rawData = {
    restaurant_id: formData.get("restaurant_id"),
    invoice_id: formData.get("invoice_id"),
    amount: formData.get("amount"),
    payment_mode: formData.get("payment_mode"),
    payment_date: formData.get("payment_date"),
    reference_number: formData.get("reference_number"),
  }

  const parsed = paymentSchema.safeParse(rawData)

  if (!parsed.success) {
    return { error: "Invalid form data provided. Please check the fields." }
  }

  const { data } = parsed

  const { userId } = await auth()

  if (!userId) {
    return { error: "You must be logged in to record a payment." }
  }

  // Read the authoritative profile rather than the session claims. The claims are
  // baked into the JWT at sign-in, so a user who just onboarded has none yet and
  // their first payment would be rejected for no good reason.
  const access = await resolveAccess(userId)

  if (!access) {
    return { error: "Could not identify your company. Please contact support." }
  }

  // Payments are owner/accountant only, matching the RLS policy on the table and
  // the assert_role() check inside record_payment().
  if (access.role !== "owner" && access.role !== "accountant") {
    return { error: "Your role cannot record payments." }
  }

  // record_payment(), not a plain insert. It allocates the money oldest-bill-first
  // and carries any surplus as credit, which is what makes a lump-sum payment
  // against several bills -- or an advance -- representable at all. A direct
  // insert could only ever match one invoice.
  //
  // RLS note: this RPC is SECURITY DEFINER and re-checks the caller's company and
  // role, so the anon-token client cannot widen access by reaching a definer
  // function. Using the service role here would bypass the very policy this
  // action exists to respect.
  // `undefined` rather than null for the optional args: supabase-js omits
  // undefined keys from the POST body, which is what lets the SQL defaults
  // (CURRENT_DATE, NULL) apply. An explicit null would be sent as JSON null and
  // is not the same thing.
  const { data: allocation, error: rpcError } = await supabase.rpc("record_payment", {
    p_restaurant_id: data.restaurant_id,
    p_amount: data.amount,
    p_payment_mode: data.payment_mode,
    p_invoice_id: data.invoice_id,
    p_payment_date: data.payment_date,
    p_reference: data.reference_number || undefined,
  })

  if (rpcError) {
    console.error("record_payment error:", rpcError)
    // These are user-facing, actionable messages (restaurant in another company,
    // invoice belonging elsewhere, non-positive amount), not internal failures.
    return { error: rpcError.message }
  }

  const row = Array.isArray(allocation) ? allocation[0] : allocation

  // Revalidate relevant pages so the new payment shows up instantly. /outstanding
  // matters most: the allocation and any credit both change what is owed.
  revalidatePath('/dashboard')
  revalidatePath('/outstanding')
  revalidatePath('/payments')
  revalidatePath('/billing')

  return {
    success: true,
    // Reported so the form can tell the user what actually happened, rather than
    // implying the whole amount was matched to the invoice they picked.
    allocated: row?.allocated ?? 0,
    creditLeft: row?.credit_left ?? 0,
    invoicesHit: row?.invoices_hit ?? 0,
    paymentId: row?.payment_id,
  }
}
