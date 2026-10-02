"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Send, Ban, Loader2 } from "lucide-react"

/**
 * The lifecycle controls for one invoice.
 *
 * Each button maps to a single RPC rather than a bare UPDATE, because each
 * transition enforces something the column cannot: who may act, what must be
 * true first, and what has to happen to the collections alongside. A generic
 * status dropdown would let a caller skip approval entirely, and would lose the
 * cancellation reason that makes a void auditable later.
 */
type InvoiceStatus =
  | 'draft'
  | 'approved'
  | 'sent'
  | 'unpaid'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled'

type Props = {
  invoiceId: string
  status: InvoiceStatus
  totalAmount: number
  /** Only the owner may void a bill. */
  isOwner: boolean
}

const COPY: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
  sent: { label: 'Sent', className: 'bg-indigo-100 text-indigo-800' },
  unpaid: { label: 'Unpaid', className: 'bg-amber-100 text-amber-800' },
  partial: { label: 'Part Paid', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-200 text-slate-600' },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const c = COPY[status] ?? COPY.unpaid
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  )
}

export function InvoiceLifecycleActions({ invoiceId, status, totalAmount, isOwner }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await fn()
        if (result.error) setError(result.error)
        else router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.")
      }
    })
  }

  const doApprove = () =>
    run(async () => {
      const { approveInvoiceAction } = await import("@/app/actions/invoices")
      return approveInvoiceAction(invoiceId)
    })

  const doSend = () => {
    // Sending is the moment the bill becomes money owed, so it is the step worth
    // being deliberate about.
    if (
      !window.confirm(
        `Send this invoice to the customer?\n\n₹${totalAmount.toFixed(2)} will then appear ` +
          `as money owed and the deliveries behind it become permanently frozen.`,
      )
    ) {
      return
    }
    run(async () => {
      const { sendInvoiceAction } = await import("@/app/actions/invoices")
      return sendInvoiceAction(invoiceId)
    })
  }

  const doCancel = () => {
    const reason = window.prompt(
      "Why is this invoice being cancelled?\n\nThis is recorded on the invoice permanently.",
    )
    if (reason === null) return
    if (!reason.trim()) {
      setError("A cancellation reason is required.")
      return
    }
    run(async () => {
      const { cancelInvoiceAction } = await import("@/app/actions/invoices")
      return cancelInvoiceAction(invoiceId, reason.trim())
    })
  }

  const cancelled = status === 'cancelled'
  const settled = status === 'paid'

  // Nothing to offer on a void or a settled bill.
  if (cancelled || settled) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {status === 'draft' && (
          <ActionButton onClick={doApprove} disabled={isPending} icon={<Check className="h-4 w-4" />}>
            Approve
          </ActionButton>
        )}

        {status === 'approved' && (
          <ActionButton onClick={doSend} disabled={isPending} primary icon={<Send className="h-4 w-4" />}>
            Send to customer
          </ActionButton>
        )}

        {(status === 'sent' || status === 'unpaid' || status === 'partial' || status === 'overdue') && isOwner && (
          <ActionButton onClick={doCancel} disabled={isPending} danger icon={<Ban className="h-4 w-4" />}>
            Cancel
          </ActionButton>
        )}
      </div>

      {status === 'draft' && (
        <p className="text-xs text-slate-500 text-right max-w-[16rem]">
          Not yet owed. Approve to review and freeze it, then send it to the customer.
        </p>
      )}
      {status === 'approved' && (
        <p className="text-xs text-slate-500 text-right max-w-[16rem]">
          Reviewed and frozen. It becomes money owed once sent.
        </p>
      )}
      {status === 'overdue' && (
        <p className="text-xs text-red-600 text-right max-w-[16rem]">
          Past its due date and not settled in full.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 text-right max-w-[20rem] bg-red-50 px-2 py-1 rounded">
          {error}
        </p>
      )}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  icon,
  primary,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  primary?: boolean
  danger?: boolean
}) {
  const tone = danger
    ? 'border-red-200 text-red-700 hover:bg-red-50'
    : primary
      ? 'bg-blue-600 border-transparent text-white hover:bg-blue-700'
      : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors disabled:opacity-50 ${tone}`}
    >
      {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}