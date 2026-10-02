"use client"

import { useForm } from "react-hook-form"
import { formResolver } from "@/components/form-resolvers"
import { paymentSchema, PaymentFormValues } from "@/lib/validations/payment"
import { useState, useEffect, useActionState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { CreditCard, IndianRupee, CheckCircle2 } from "lucide-react"
import { recordPaymentAction, ActionState } from "@/app/actions/payments"

type RestaurantDropdown = {
  id: string
  name: string
}

type InvoiceDropdown = {
  id: string
  invoice_number: string
  total_amount: number
  status: string
}

interface PaymentFormProps {
  restaurants: RestaurantDropdown[]
  defaultRestaurantId?: string
  defaultInvoiceId?: string
}

export function PaymentForm({ restaurants, defaultRestaurantId, defaultInvoiceId }: PaymentFormProps) {
  const router = useRouter()
  const [invoices, setInvoices] = useState<InvoiceDropdown[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(recordPaymentAction, {})

  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: formResolver(paymentSchema),
    defaultValues: {
      restaurant_id: defaultRestaurantId || "",
      invoice_id: defaultInvoiceId || "",
      amount: 0,
      payment_mode: "upi",
      payment_date: new Date().toISOString().split('T')[0],
      reference_number: "",
    },
  })

  const selectedRestaurantId = watch("restaurant_id")
  const selectedInvoiceId = watch("invoice_id")
  const selectedMode = watch("payment_mode")

  useEffect(() => {
    async function fetchInvoices() {
      // This effect only re-runs when the restaurant changes, so any invoice
      // still selected belongs to the previous restaurant and must be cleared.
      setValue('invoice_id', '')

      if (!selectedRestaurantId) {
        setInvoices([])
        setCreditBalance(null)
        return
      }

      setIsLoadingInvoices(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, status')
        .eq('restaurant_id', selectedRestaurantId)
        .in('status', ['unpaid', 'partial'])
        .order('created_at', { ascending: true })

      if (!error && data) {
        setInvoices(data)
      }
      setIsLoadingInvoices(false)

      // Money already paid and not yet matched to an invoice. Shown so an
      // accountant can see the restaurant is square before taking another payment.
      const { data: creditRows } = await supabase
        .from('restaurant_credit')
        .select('amount')
        .eq('restaurant_id', selectedRestaurantId)
        .limit(1)

      const held = creditRows?.[0]?.amount
      setCreditBalance(typeof held === 'number' ? held : 0)
    }

    fetchInvoices()
  }, [selectedRestaurantId, setValue])

  // Pre-fill the amount from the chosen invoice so the common case stays one
  // click. The user can still type a different figure, and must be able to: a
  // partial payment is normal.
  useEffect(() => {
    if (selectedInvoiceId) {
      const invoice = invoices.find(inv => inv.id === selectedInvoiceId)
      if (invoice) {
        setValue('amount', invoice.total_amount)
      }
    }
  }, [selectedInvoiceId, invoices, setValue])

  // Show the outcome before navigating. With FIFO allocation the money may have
  // settled several bills and left a credit, and silently redirecting to the
  // list hides that -- which is the information the user needs to give the
  // customer.
  const [showOutcome, setShowOutcome] = useState(false)
  useEffect(() => {
    if (state.success) {
      setShowOutcome(true)
    }
  }, [state.success])

  const needsReference = selectedMode === 'upi' || selectedMode === 'bank_transfer' || selectedMode === 'cheque'

  if (showOutcome && state.success) {
    const allocated = state.allocated ?? 0
    const credit = state.creditLeft ?? 0
    const partial = credit > 0 || (state.invoicesHit ?? 0) > 1

    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Payment recorded</h2>
            <p className="text-sm text-slate-600 mt-1">
              {partial ? (
                <>
                  ₹{allocated.toFixed(2)} was applied to{' '}
                  {state.invoicesHit === 1 ? 'the oldest open bill' : `the ${state.invoicesHit} oldest open bills`}
                  {credit > 0 && (
                    <>
                      . The remaining <strong className="text-slate-900">₹{credit.toFixed(2)}</strong> is
                      held as credit on this account and will be applied to their next bill
                      automatically.
                    </>
                  )}
                  .
                </>
              ) : (
                <>The full amount was applied to the selected invoice.</>
              )}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/payments')}
            className="flex-1 py-2.5 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
          >
            All Payments
          </button>
          <button
            type="button"
            onClick={() => router.push('/outstanding')}
            className="flex-1 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            View Outstanding
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl mx-auto">
      {state.error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 pb-6 border-b border-slate-100">
        <div>
          <label className="block text-sm font-medium text-slate-700">Select Restaurant</label>
          <select
            {...register("restaurant_id")}
            className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            <option value="" disabled>Select a restaurant...</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {errors.restaurant_id && <p className="mt-1 text-sm text-red-600">{errors.restaurant_id.message}</p>}
        </div>

        {/* A restaurant with nothing outstanding is now a normal state, not a
            dead end: the payment is an advance. The previous version disabled
            submit entirely, which made advance payments unrepresentable. */}
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Apply Against <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <select
            {...register("invoice_id")}
            disabled={!selectedRestaurantId || isLoadingInvoices}
            className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="">
              {isLoadingInvoices
                ? "Loading invoices..."
                : "Auto — apply to oldest unpaid bills first"}
            </option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} (₹{inv.total_amount} - {inv.status})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Leave as auto to settle the oldest open bills first, oldest due date at the top.
            Anything left over is held as credit.
          </p>
          {errors.invoice_id && <p className="mt-1 text-sm text-red-600">{errors.invoice_id.message}</p>}

          {!isLoadingInvoices && selectedRestaurantId && invoices.length === 0 && (
            <p className="mt-1 text-xs text-emerald-600 font-medium">
              No unpaid invoices — this will be recorded as an advance on account.
            </p>
          )}

          {creditBalance !== null && creditBalance > 0 && (
            <p className="mt-2 text-xs text-blue-700 font-medium">
              This restaurant already holds ₹{creditBalance.toFixed(2)} in credit. That is applied
              first, before any of this payment reaches an invoice.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">Amount Received</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <IndianRupee className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="number"
              step="0.01"
              {...register("amount")}
              className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 py-2.5 sm:text-sm border-slate-300 rounded-md border"
              placeholder="0.00"
            />
          </div>
          {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Date of Payment</label>
          <input
            type="date"
            {...register("payment_date")}
            className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          />
          {errors.payment_date && <p className="mt-1 text-sm text-red-600">{errors.payment_date.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Payment Mode</label>
          <select
            {...register("payment_mode")}
            className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            <option value="upi">UPI / Scanner</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer (NEFT/RTGS)</option>
            <option value="cheque">Cheque</option>
          </select>
          {errors.payment_mode && <p className="mt-1 text-sm text-red-600">{errors.payment_mode.message}</p>}
        </div>

        {needsReference && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Reference Number</label>
            <input
              type="text"
              {...register("reference_number")}
              placeholder="UTR / Cheque No."
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full px-3 py-2.5 sm:text-sm border-slate-300 rounded-md border"
            />
            {errors.reference_number && <p className="mt-1 text-sm text-red-600">{errors.reference_number.message}</p>}
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-slate-100 flex gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-2.5 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        {/* Only pending disables the button now. Gating on invoices.length === 0
            is what made advance payments impossible. */}
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CreditCard className="h-4 w-4" />
          {isPending ? "Recording..." : "Record Payment"}
        </button>
      </div>
    </form>
  )
}