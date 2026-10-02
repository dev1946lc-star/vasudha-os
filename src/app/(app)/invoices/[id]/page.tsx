import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import DownloadPDFButton from "@/components/invoices/DownloadPDFButton"
import type { InvoiceData, InvoiceLineItem } from "@/components/invoices/InvoicePDF"
import { ArrowLeft, Building2, MapPin, ReceiptText } from "lucide-react"
import Link from "next/link"

// Note: In Next.js App Router, we fetch data on the server component
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  // 1. Fetch the invoice details
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      company:companies (name, address, gst_number),
      restaurant:restaurants (name, address, phone)
    `)
    .eq('id', id)
    .single()

  if (error || !invoice) {
    notFound()
  }

  // 2. Line items come from bill_items, not from re-deriving collection_items.
  //
  // bill_items is the snapshot taken when the invoice was issued (migration 29).
  // Re-deriving from collection_items showed GROSS amounts: an item returned by
  // the agent appeared on the printed invoice as still chargeable, which is
  // exactly the bug migration 29 fixed at the source. It also re-read live
  // product names and prices, so renaming a product would silently rewrite a
  // historical invoice. bill_items has neither problem.
  const { data: billLines } = await supabase
    .from('bill_items')
    .select(`
      quantity, gross_quantity, return_quantity, unit_price, hsn_code,
      gst_rate, taxable_amount, cgst, sgst, igst, total_amount,
      product:products (name)
    `)
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: true })

  const lineItems: InvoiceLineItem[] = (billLines ?? []).map((line) => ({
    name: line.product?.name ?? 'Unknown',
    hsn_code: line.hsn_code ?? '',
    // Net of returns: this is what the customer is charged for.
    quantity: line.quantity,
    unit_price: line.unit_price,
    amount: line.taxable_amount,
    gst_rate: line.gst_rate,
    cgst: line.cgst,
    sgst: line.sgst,
    igst: line.igst,
    total_amount: line.total_amount,
    return_quantity: line.return_quantity,
  }))

  // Prepare full data structure for the PDF generator
  const pdfData = {
    ...invoice,
    items: lineItems
  }

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/collections" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoice {invoice.invoice_number}</h1>
            <p className="text-sm text-slate-500">
              Generated on {new Date(invoice.invoice_date).toLocaleDateString()}
              {/* due_date drives ageing, so surface it here too. */}
              {invoice.due_date ? <> · Due {new Date(invoice.due_date).toLocaleDateString()}</> : null}
            </p>
          </div>
        </div>
        
        {/* `InvoiceData` declares the embedded `company`/`restaurant` columns as
            non-nullable while the schema makes them nullable, so the payload is
            handed over unchanged. */}
        <DownloadPDFButton data={pdfData as unknown as InvoiceData} />
      </div>

      {/* Invoice HTML Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <Building2 className="h-5 w-5" />
              <h2 className="text-xl font-bold">{invoice.company.name}</h2>
            </div>
            <p className="text-sm text-slate-600 max-w-xs">{invoice.company.address}</p>
            <p className="text-sm text-slate-600 mt-1">GSTIN: {invoice.company.gst_number || 'N/A'}</p>
          </div>
          
          <div className="text-left md:text-right">
            <h2 className="text-3xl font-bold text-slate-300 tracking-wider mb-2">INVOICE</h2>
            <div className="text-sm">
              <span className="text-slate-500">Invoice Number:</span>
              <span className="ml-2 font-medium text-slate-900">{invoice.invoice_number}</span>
            </div>
            <div className="text-sm mt-1">
              <span className="text-slate-500">Invoice Date:</span>
              <span className="ml-2 font-medium text-slate-900">{new Date(invoice.invoice_date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="p-8 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Billed To</h3>
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
            <div>
              <div className="font-bold text-slate-900 text-lg">{invoice.restaurant.name}</div>
              <div className="text-slate-600 mt-1">{invoice.restaurant.address}</div>
              <div className="text-slate-600 mt-1">Phone: {invoice.restaurant.phone}</div>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-8 py-4 font-medium">Item Description</th>
                <th className="px-8 py-4 font-medium">HSN/SAC</th>
                <th className="px-8 py-4 font-medium text-right">Qty</th>
                <th className="px-8 py-4 font-medium text-right">Rate</th>
                <th className="px-8 py-4 font-medium text-right">Taxable</th>
                <th className="px-8 py-4 font-medium text-right">GST</th>
                <th className="px-8 py-4 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-8 py-4">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    {/* A returned line bills net quantity, so the customer can see
                        why the qty is lower than what was dispatched. */}
                    {item.return_quantity > 0 && (
                      <div className="text-xs text-amber-700">
                        {item.return_quantity} returned — not charged
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-4 text-slate-600">{item.hsn_code || '-'}</td>
                  <td className="px-8 py-4 text-slate-900 text-right">{item.quantity}</td>
                  <td className="px-8 py-4 text-slate-900 text-right">₹{item.unit_price.toFixed(2)}</td>
                  <td className="px-8 py-4 text-slate-900 text-right">₹{item.amount.toFixed(2)}</td>
                  <td className="px-8 py-4 text-slate-900 text-right">
                    ₹{(item.cgst + item.sgst + item.igst).toFixed(2)}
                    <div className="text-xs text-slate-500">
                      {item.igst > 0
                        ? `IGST ${item.gst_rate}%`
                        : `CGST+SGST ${item.gst_rate}%`}
                    </div>
                  </td>
                  <td className="px-8 py-4 font-medium text-slate-900 text-right">
                    ₹{item.total_amount.toFixed(2)}
                  </td>
                </tr>
              ))}

              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-8 text-center text-slate-500">
                    <ReceiptText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    No line items found for this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-8 bg-slate-50 flex justify-end">
          <div className="w-full sm:w-1/2 lg:w-1/3 space-y-3">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium text-slate-900">₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            
            {/* Inter-state invoices carry IGST at the full rate and no CGST/SGST;
                intra-state ones are the reverse. Printing zeroes for the
                absent component would misstate which regime applied. */}
            {invoice.igst > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>IGST</span>
                <span className="font-medium text-slate-900">₹{invoice.igst.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST</span>
                  <span className="font-medium text-slate-900">₹{invoice.cgst.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>SGST</span>
                  <span className="font-medium text-slate-900">₹{invoice.sgst.toFixed(2)}</span>
                </div>
              </>
            )}

            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-900">Total Amount</span>
              <span className="text-xl font-bold text-blue-600">₹{invoice.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
