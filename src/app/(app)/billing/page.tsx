import { api } from "@/lib/api"
import Link from "next/link"
import { FileText, Eye, Plus, ChevronLeft, ChevronRight } from "lucide-react"

export const revalidate = 30 // ISR: revalidate every 30 seconds

const PAGE_SIZE = 25

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1") || 1)

  const { data: invoices, total } = await api.billing(page)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing & Invoices</h1>
          <p className="text-sm text-slate-500">Manage all generated invoices.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/invoices/generate"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Generate Invoice
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Invoice Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Restaurant</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{inv.invoice_number}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">
                    {inv.restaurant_name}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                      inv.status === 'draft' ? 'bg-slate-100 text-slate-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {inv.status || 'Generated'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-bold text-slate-900">
                      ₹{Number(inv.total_amount).toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/invoices/${inv.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="h-4 w-4" /> View
                    </Link>
                  </td>
                </tr>
              ))}
              
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <p className="text-sm text-slate-600">
              Showing <span className="font-medium">{(page - 1) * PAGE_SIZE + 1}</span>–
              <span className="font-medium">{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
              <span className="font-medium">{total}</span> invoices
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={`/billing?page=${page - 1}`}
                aria-disabled={page === 1}
                className={`inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                  page === 1
                    ? 'border-slate-200 text-slate-300 pointer-events-none'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <span className="text-sm text-slate-600 font-medium px-2">
                {page} / {totalPages}
              </span>
              <Link
                href={`/billing?page=${page + 1}`}
                aria-disabled={page === totalPages}
                className={`inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                  page === totalPages
                    ? 'border-slate-200 text-slate-300 pointer-events-none'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
