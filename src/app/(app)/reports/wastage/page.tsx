import { createClient } from "@/lib/supabase/server"
import { Trash2, TrendingDown, DollarSign, Package, AlertTriangle } from "lucide-react"
import Link from "next/link"
import DownloadCSVButton from "@/components/reports/DownloadCSVButton"

export const revalidate = 0

type WastageRow = {
  company_id: string
  product_id: string
  product_name: string
  unit: string | null
  month: string
  entries: number
  quantity_wasted: number
  estimated_value: number
}

export default async function WastageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams
  const filterMonth = resolvedSearchParams.month || ""

  let query = supabase.from("wastage_report").select("*").order("month", { ascending: false })

  if (filterMonth) {
    const formattedMonth = `${filterMonth}-01`
    query = query.eq("month", formattedMonth)
  }

  const { data, error } = await query

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load wastage report: {error.message}
        </div>
      </div>
    )
  }

  const rows: WastageRow[] = (data as WastageRow[]) || []

  // Aggregate metrics
  const totalQuantity = rows.reduce((acc, r) => acc + Number(r.quantity_wasted || 0), 0)
  const totalValue = rows.reduce((acc, r) => acc + Number(r.estimated_value || 0), 0)
  const totalEntries = rows.reduce((acc, r) => acc + Number(r.entries || 0), 0)
  const uniqueProductsCount = new Set(rows.map((r) => r.product_id)).size

  const csvData = rows.map((r) => ({
    "Month": r.month ? r.month.substring(0, 7) : "",
    "Product Name": r.product_name,
    "Unit": r.unit || "unit",
    "Incidents / Entries": r.entries,
    "Quantity Wasted": Number(r.quantity_wasted).toFixed(2),
    "Estimated Loss (INR)": Number(r.estimated_value).toFixed(2),
  }))

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/reports"
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              Reports Hub
            </Link>
            <span className="text-slate-300 text-xs">/</span>
            <span className="text-xs font-semibold text-rose-600">Wastage Analysis</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Trash2 className="h-6 w-6 text-rose-600" />
            Stock Wastage &amp; Write-off Report
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Audit inventory destroyed or written off from non-restockable returns and damage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={filterMonth}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-rose-500 focus:border-rose-500 bg-white"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              Filter
            </button>
            {filterMonth && (
              <Link
                href="/reports/wastage"
                className="text-xs text-rose-600 hover:underline px-1"
              >
                Reset
              </Link>
            )}
          </form>

          <DownloadCSVButton
            data={csvData}
            filename={`Wastage_Report_${filterMonth || "all"}`}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-lg text-rose-600">
            <TrendingDown className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Units Lost
            </p>
            <p className="text-2xl font-bold mt-1 text-slate-900">
              {totalQuantity.toFixed(1)}{" "}
              <span className="text-xs font-normal text-slate-500">units</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Estimated Loss (₹)
            </p>
            <p className="text-2xl font-bold mt-1 text-rose-600">
              ₹{totalValue.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Products Affected
            </p>
            <p className="text-2xl font-bold mt-1 text-slate-900">{uniqueProductsCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Wastage Incidents
            </p>
            <p className="text-2xl font-bold mt-1 text-slate-900">{totalEntries}</p>
          </div>
        </div>
      </div>

      {/* Wastage Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Monthly Wastage Breakdown</h2>
          <span className="text-xs text-slate-500">
            Derived directly from ledger wastage entries
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Trash2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-700">No wastage recorded.</p>
            <p className="text-xs text-slate-400 mt-1">
              Goods returned and marked non-restockable will automatically be audited here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-medium">Month</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium text-center">Incidents</th>
                  <th className="px-5 py-3 font-medium text-right">Units Written Off</th>
                  <th className="px-5 py-3 font-medium text-right">Estimated Financial Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {r.month ? r.month.substring(0, 7) : "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {r.product_name}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-600">{r.entries}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-rose-600">
                      {Number(r.quantity_wasted).toFixed(1)}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        {r.unit || "unit"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                      ₹{Number(r.estimated_value).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
