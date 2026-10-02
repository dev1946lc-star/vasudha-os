"use server"

import { createClient } from "@/lib/supabase/server"
import { resolveAccess } from "@/lib/session-claims"
import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"

export type InvoiceActionResult = {
  error?: string
  success?: boolean
  invoiceId?: string
}

/**
 * Each action is a thin wrapper over one lifecycle RPC.
 *
 * The rules live in the database, not here: who may act, which transitions are
 * legal, and what happens to the underlying collections and allocations. Doing
 * the checks in both places would give two answers that could drift, and the copy
 * in the UI is the one an attacker would not read.
 *
 * The service-role client is deliberate. These RPCs are SECURITY DEFINER and
 * re-derive the caller's company and role from the verified JWT, so the browser's
 * anon token is irrelevant here — and the anon client could not reach them
 * anyway. resolveAccess supplies the identity the RPC then authorises against.
 */
async function requireCompany() {
  const { userId } = await auth()
  if (!userId) return { error: "You must be signed in." }

  const access = await resolveAccess(userId)
  if (!access) return { error: "Could not identify your company." }
  if (access.role === "revoked" || !access.is_active) {
    return { error: "Your access has been revoked." }
  }
  return { access }
}

export async function approveInvoiceAction(invoiceId: string): Promise<InvoiceActionResult> {
  const { access, error } = await requireCompany()
  if (error) return { error }
  if (!access) return { error: "Could not identify your company." }

  const supabase = await createClient()
  const { data, error: rpcError } = await supabase.rpc("approve_invoice", {
    p_invoice_id: invoiceId,
  })

  if (rpcError) {
    // These are user-facing and actionable ("Only a draft can be approved",
    // "does not belong to your company"), not internal failures.
    return { error: rpcError.message }
  }

  revalidatePath('/billing')
  revalidatePath('/invoices/generate')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/outstanding')
  return { success: true, invoiceId: data as string }
}

export async function sendInvoiceAction(invoiceId: string): Promise<InvoiceActionResult> {
  const { access, error } = await requireCompany()
  if (error) return { error }
  if (!access) return { error: "Could not identify your company." }

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc("send_invoice", {
    p_invoice_id: invoiceId,
  })

  if (rpcError) return { error: rpcError.message }

  // Sending changes what the restaurant owes, so every money view is stale now.
  revalidatePath('/billing')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/outstanding')
  revalidatePath('/reports/aging')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function cancelInvoiceAction(
  invoiceId: string,
  reason: string,
): Promise<InvoiceActionResult> {
  const { access, error } = await requireCompany()
  if (error) return { error }
  if (!access) return { error: "Could not identify your company." }

  // Checked here as well as in the RPC so the user gets a field-level message
  // rather than a database error string.
  if (!reason.trim()) {
    return { error: "A cancellation reason is required." }
  }

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
  })

  if (rpcError) return { error: rpcError.message }

  // A cancellation releases the deliveries and moves received money to credit, so
  // collections, outstanding and the ageing report all change.
  revalidatePath('/billing')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/collections')
  revalidatePath('/invoices/generate')
  revalidatePath('/outstanding')
  revalidatePath('/reports/aging')
  revalidatePath('/dashboard')
  return { success: true }
}
