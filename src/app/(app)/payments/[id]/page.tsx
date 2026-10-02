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

  // Format data for the PDF Generator
  const pdfData = {
    payment_id: payment.id,
    payment_date: payment.payment_date,
    amount: Number(payment.amount),
    payment_mode: payment.payment_mode,
    reference_number: payment.reference_number,
    restaurant: payment.restaurant,
    company: payment.company,
    invoice: payment.invoice,
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
              Receipt for Invoice {payment.invoice?.invoice_number}
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

          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-slate-500 ml-6">Applied to Invoice</span>
            <span className="font-medium text-slate-900">{payment.invoice?.invoice_number}</span>
          </div>
        </div>
        
        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Receipt ID: {payment.id}</p>
        </div>

      </div>
    </div>
  )
}
