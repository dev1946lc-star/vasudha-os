"use server"

import { createClient } from "@/lib/supabase/server"
import { resolveAccess } from "@/lib/session-claims"
import { paymentSchema } from "@/lib/validations/payment"
import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"

export type ActionState = {
  success?: boolean
  error?: string
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

  const result = paymentSchema.safeParse(rawData)

  if (!result.success) {
    return { error: "Invalid form data provided. Please check the fields." }
  }

  const { data } = result

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

  const companyId = access.company_id

  // Payments are owner/accountant only, matching the RLS policy on the table and
  // the assert_role() check the definer functions apply.
  if (access.role !== "owner" && access.role !== "accountant") {
    return { error: "Your role cannot record payments." }
  }

  // Insert payment
  const { error: insertError } = await supabase
    .from("payments")
    .insert({
      company_id: companyId,
      restaurant_id: data.restaurant_id,
      invoice_id: data.invoice_id,
      amount: data.amount,
      payment_mode: data.payment_mode,
      payment_date: data.payment_date,
      reference_number: data.reference_number || null,
    })

  if (insertError) {
    console.error("Payment insert error:", insertError)
    return { error: "Failed to record payment. Please try again." }
  }

  // Revalidate relevant pages so the new payment shows up instantly
  revalidatePath('/dashboard')
  revalidatePath('/outstanding')
  revalidatePath('/payments')

  // Instead of redirecting inside the action which throws an error if caught by a try/catch, 
  // we'll return success and let the client component handle the redirect.
  return { success: true }
}
