import { api, type OutstandingRow } from "@/lib/api"
import { AlertCircle, ArrowUpRight, Search } from "lucide-react"
import Link from "next/link"
import ExportReportButtons from "@/components/reports/ExportReportButtons"

export const revalidate = 30

export default async function OutstandingTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const params = await searchParams
  const search = (params.search || "").trim()

  let rows: OutstandingRow[] = []
  let totalGlobalOutstanding = 0
  let totalRestaurantsWithDebt = 0
  let error: string | null = null

  try {
    const data = await api.outstanding()
    totalGlobalOutstanding = data.total_outstanding
    totalRestaurantsWithDebt = data.restaurants_with_debt

    const needle = search.toLowerCase()
    rows = needle
      ? data.rows.filter(
          (r) =>
            r.restaurant_name.toLowerCase().includes(needle) ||
            (r.phone ?? "").toLowerCase().includes(needle)
        )
      : data.rows
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Outstanding Tracking</h1>
          <p className="text-sm text-slate-500">Track unpaid balances perfectly aggregated per restaurant.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportReportButtons data={rows} filename="Outstanding_Tracking" />
          <Link
            href="/payments/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors print:hidden"
          >
            Record Payment
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load outstanding balances: {error}
        </div>
      )}

      {/* High-level Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-red-50 rounded-lg text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Market Outstanding</p>
            <p className="text-3xl font-bold text-slate-900">₹{totalGlobalOutstanding.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-amber-50 rounded-lg text-amber-600">
            <ArrowUpRight className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Restaurants with Debt</p>
            <p className="text-3xl font-bold text-slate-900">{totalRestaurantsWithDebt}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4 items-center">
          <form method="GET" className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search restaurants..."
              className="w-full pl-10 pr-4 py-2 text-sm border-slate-300 rounded-lg border focus:ring-blue-500 focus:border-blue-500"
            />
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Restaurant</th>
                <th className="px-6 py-4 font-medium text-center">Unpaid Invoices</th>
                {/* Buckets are days PAST DUE. Money inside the payment term is
                    not overdue, so it gets its own column rather than inflating
                    the 0-15 bucket. */}
                <th className="px-6 py-4 font-medium text-right">Not Yet Due</th>
                <th className="px-6 py-4 font-medium text-right">1-15 Days Overdue</th>
                <th className="px-6 py-4 font-medium text-right">16-30 Days Overdue</th>
                <th className="px-6 py-4 font-medium text-right">31-60 Days Overdue</th>
                <th className="px-6 py-4 font-medium text-right">60+ Days Overdue</th>
                <th className="px-6 py-4 font-medium text-right">Total Outstanding</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => {
                const outAmount = Number(item.total_outstanding)
                return (
                  <tr key={item.restaurant_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{item.restaurant_name}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{item.phone || "No phone on file"}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.unpaid_invoice_count > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          {item.unpaid_invoice_count} Bills
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-500">
                      {Number(item.bucket_current) > 0 ? `₹${Number(item.bucket_current).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-600">
                      {Number(item.bucket_0_15) > 0 ? `₹${Number(item.bucket_0_15).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-amber-600">
                      {Number(item.bucket_15_30) > 0 ? `₹${Number(item.bucket_15_30).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-orange-600 font-medium">
                      {Number(item.bucket_30_60) > 0 ? `₹${Number(item.bucket_30_60).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-red-600 font-bold">
                      {Number(item.bucket_60_plus) > 0 ? `₹${Number(item.bucket_60_plus).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`font-bold ${outAmount > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                        ₹{outAmount.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {outAmount > 0 && (
                        <Link 
                          href={`/payments/new?restaurant_id=${item.restaurant_id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          Collect Payment
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
              
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    {search ? `No restaurants match "${search}".` : "No active restaurants found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
