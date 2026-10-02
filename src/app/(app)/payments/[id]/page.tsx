import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import DownloadReceiptButton from "@/components/payments/DownloadReceiptButton"
import type { ReceiptData } from "@/components/payments/ReceiptPDF"
import { ArrowLeft, Building2, Calendar, CreditCard, Receipt } from "lucide-react"
import Link from "next/link"

// Row shape for the nested PostgREST select below. `companies` has no `phone`
// column, so requesting one would make PostgREST reject the whole query with a
// 42703 and the page would 404 on every receipt.
type PaymentWithRelations = {
  id: string
  amount: number
  payment_mode: string | null
  payment_date: string
  reference_number: string | null
  restaurant_id: string
  company: { name: string; address: string | null; gst_number: string | null; logo_url: string | null } | null
  restaurant: { name: string; phone: string | null } | null
  invoice: { invoice_number: string } | null
}

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch payment details along with nested relations
  const { data: payment, error } = await supabase
    .from('payments')
    .select(`
      id, amount, payment_mode, payment_date, reference_number,
      company:companies (name, address, gst_number, logo_url),
      restaurant:restaurants (name, phone),
      invoice:invoices (invoice_number)
    `)
    .eq('id', id)
    .single<PaymentWithRelations>()

  if (error || !payment) {
    notFound()
  }

  // Which bills this payment actually closed. One payment can settle several, so
  // the receipt must show the split rather than naming a single invoice.
  const { data: allocationRows } = await supabase
    .from('payment_allocations')
    .select('amount, invoice:invoices (invoice_number)')
    .eq('payment_id', id)
    .order('created_at', { ascending: true })

  const allocations = (allocationRows ?? []).flatMap((row) => {
    const embedded = Array.isArray(row.invoice) ? row.invoice[0] : row.invoice
    if (!embedded?.invoice_number) return []
    return [{ invoice_number: embedded.invoice_number, amount: Number(row.amount) }]
  })

  // Credit held after allocation, so the receipt agrees with the account. Read
  // as the balance, not a delta: the receipt is a point-in-time statement.
  const { data: creditRows } = await supabase
    .from('restaurant_credit')
    .select('amount')
    .eq('restaurant_id', payment.restaurant_id ?? '')
    .limit(1)

  const creditLeft = creditRows?.[0]?.amount ?? 0
  const isAdvance = allocations.length === 0

  // Format data for the PDF Generator
  const pdfData = {
    payment_id: payment.id,
    payment_date: payment.payment_date,
    amount: Number(payment.amount),
    payment_mode: payment.payment_mode,
    reference_number: payment.reference_number,
    restaurant: payment.restaurant,
    company: payment.company,
    // The embedded invoice is only populated for payments inserted before
    // migration 31, which recorded the match inline. Everything since is carried
    // by payment_allocations, so the first allocation stands in.
    invoice: payment.invoice ?? (allocations[0]
      ? { invoice_number: allocations[0].invoice_number }
      : null),
    allocations,
    creditLeft: isAdvance ? Number(creditLeft) : 0,
  }

  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Receipt</h1>
            <p className="text-sm text-slate-500">
              {isAdvance
                ? "Received on account"
                : payment.invoice?.invoice_number
                  ? `Receipt for Invoice ${payment.invoice.invoice_number}`
                  : `Receipt — ${allocations.length} bills settled`}
            </p>
          </div>
        </div>
        
        {/* `ReceiptData` declares `payment_mode` and the embedded relations as
            non-nullable while the schema makes them nullable, so the payload is
            handed over unchanged. */}
        <DownloadReceiptButton data={pdfData as unknown as ReceiptData} />
      </div>

      {/* HTML Preview of Receipt */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-lg mx-auto">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-100 bg-slate-50 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-100 text-emerald-600 rounded-full mb-4">
            <Receipt className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">{payment.company?.name}</h2>
          <p className="text-sm text-slate-500 mt-1">Digital Payment Receipt</p>
        </div>

        {/* Amount Big Box */}
        <div className="p-8 text-center border-b border-slate-100">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Amount Received</p>
          <div className="text-4xl font-bold text-emerald-600">₹{Number(payment.amount).toFixed(2)}</div>
        </div>

        {/* Details Grid */}
        <div className="p-8 space-y-4">
          <div className="flex justify-between items-center py-3 border-b border-slate-50">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Receipt Date</span>
            </div>
            <span className="font-medium text-slate-900">{new Date(payment.payment_date).toLocaleDateString()}</span>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-slate-50">
            <div className="flex items-center gap-2 text-slate-500">
              <Building2 className="h-4 w-4" />
              <span className="text-sm">Received From</span>
            </div>
            <span className="font-medium text-slate-900">{payment.restaurant?.name}</span>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-slate-50">
            <div className="flex items-center gap-2 text-slate-500">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm">Payment Mode</span>
            </div>
            <span className="font-medium text-slate-900 uppercase">{payment.payment_mode}</span>
          </div>

          {payment.reference_number && (
            <div className="flex justify-between items-center py-3 border-b border-slate-50">
              <span className="text-sm text-slate-500 ml-6">Reference No.</span>
              <span className="font-medium text-slate-900">{payment.reference_number}</span>
            </div>
          )}

          {/* One payment can close several bills, and an advance closes none.
              Both cases need to read correctly rather than printing a blank. */}
          {isAdvance ? (
            <div className="flex justify-between items-center py-3">
              <span className="text-sm text-slate-500 ml-6">Applied to</span>
              <span className="font-medium text-slate-900">Payment on account (advance)</span>
            </div>
          ) : (
            <div className="py-3">
              <p className="text-sm text-slate-500 mb-2">
                {allocations.length > 1
                  ? `Bills Settled (${allocations.length})`
                  : "Applied to Invoice"}
              </p>
              {allocations.length > 0 ? (
                <ul className="space-y-1">
                  {allocations.map((a) => (
                    <li key={a.invoice_number} className="flex justify-between text-sm">
                      <span className="font-medium text-slate-900">{a.invoice_number}</span>
                      <span className="text-slate-600">₹{a.amount.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="font-medium text-slate-900 text-sm">
                  {payment.invoice?.invoice_number}
                </span>
              )}
            </div>
          )}

          {isAdvance && Number(creditLeft) > 0 && (
            <div className="flex justify-between items-center py-3 border-t border-slate-50">
              <span className="text-sm text-slate-500 ml-6">Credit Held On Account</span>
              <span className="font-medium text-emerald-700">₹{Number(creditLeft).toFixed(2)}</span>
            </div>
          )}
        </div>
        
        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Receipt ID: {payment.id}</p>
        </div>

      </div>
    </div>
  )
}
