import { createClient } from "@/lib/supabase/server"
import { CheckCircle2, Clock, Package, TrendingUp } from "lucide-react"
import ExportReportButtons from "@/components/reports/ExportReportButtons"

export const revalidate = 0

type DailyStop = {
  id: string
  status: string | null
  notes: string | null
  total_quantity: number | null
  total_amount: number | null
  restaurant: { name?: string } | null
  collection_items: { quantity: number; return_quantity: number | null }[] | null
}

export default async function DailyCollectionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()

  // Await searchParams for Next.js 15+
  const resolvedSearchParams = await searchParams;

  // Use provided date or default to today
  const targetDate = resolvedSearchParams.date || new Date().toISOString().split('T')[0]

  // Fetch all collections and payments for the target date in parallel.
  // Quantities live on collection_items, so they are pulled in nested and
  // summed here — `collections` only carries the header totals.
  const [collectionsRes, paymentsRes] = await Promise.all([
    supabase
      .from('collections')
      .select(`
        id, status, notes, total_quantity, total_amount,
        restaurant:restaurants(name),
        collection_items(quantity, return_quantity)
      `)
      .eq('collection_date', targetDate)
      .order('created_at', { ascending: false })
      .returns<DailyStop[]>(),

    supabase
      .from('payments')
      .select('amount')
      .eq('payment_date', targetDate)
      .returns<{ amount: number }[]>()
  ])

  const cols = (collectionsRes.data ?? []).map((c) => ({
    ...c,
    delivered: (c.collection_items ?? []).reduce(
      (sum, i) => sum + Number(i.quantity ?? 0),
      0
    ),
    returned: (c.collection_items ?? []).reduce(
      (sum, i) => sum + Number(i.return_quantity ?? 0),
      0
    ),
  }))
  const pays = paymentsRes.data ?? []

  const isDone = (c: { status: string | null }) =>
    c.status === 'completed' || c.status === 'verified'

  // Aggregations
  const pendingCount = cols.filter((c) => c.status === 'draft' || c.status === 'pending').length
  const completedCount = cols.filter(isDone).length

  const totalDelivered = cols
    .filter(isDone)
    .reduce((sum, c) => sum + Number(c.delivered), 0)

  const totalReturned = cols
    .filter(isDone)
    .reduce((sum, c) => sum + Number(c.returned), 0)

  const totalRevenue = pays.reduce((sum: number, p) => sum + Number(p.amount), 0)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      
      {/* Header and Controls */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Daily Route Report</h1>
          <p className="text-sm text-slate-500">Summary of all deliveries and collections for {new Date(targetDate).toLocaleDateString()}.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <form className="flex items-center gap-2">
            <input 
              type="date" 
              name="date"
              defaultValue={targetDate}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <button type="submit" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
              Filter
            </button>
          </form>
          <ExportReportButtons
            data={cols.map((c) => ({
              "Status": c.status,
              "Restaurant": (c.restaurant as { name?: string } | null)?.name || "Unknown",
              "Delivered (kg)": c.delivered,
              "Returned (kg)": c.returned,
              "Amount": Number(c.total_amount ?? 0),
              "Notes": c.notes || ""
            }))}
            filename={`Daily_Report_${targetDate}`}
          />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Delivered</p>
              <p className="text-3xl font-bold mt-2 text-slate-900">{totalDelivered.toFixed(1)} <span className="text-lg text-slate-500 font-normal">kg</span></p>
              <p className="text-xs text-slate-500 mt-1">
                {totalReturned.toFixed(1)} kg of empty containers returned
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <Package className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Revenue Collected</p>
              <p className="text-3xl font-bold mt-2 text-slate-900">₹{totalRevenue.toFixed(2)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Completed Stops</p>
              <p className="text-3xl font-bold mt-2 text-emerald-600">{completedCount}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Stops</p>
              <p className="text-3xl font-bold mt-2 text-amber-600">{pendingCount}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Route Log Details</h3>
          <span className="text-sm text-slate-500">Total Stops: {cols.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Restaurant</th>
                <th className="px-6 py-4 font-medium text-right">Delivered (kg)</th>
                <th className="px-6 py-4 font-medium text-right">Returned (kg)</th>
                <th className="px-6 py-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cols.map((col) => {
                const isCompleted = isDone(col);
                return (
                  <tr key={col.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      {isCompleted ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          {col.status === 'verified' ? 'Verified' : 'Completed'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {(col.restaurant as { name?: string } | null)?.name}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isCompleted ? (
                        <span className="font-bold text-slate-900">{col.delivered.toFixed(1)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isCompleted ? (
                        <span className={col.returned > 0 ? 'text-red-600 font-bold' : 'text-slate-500'}>
                          {col.returned.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                      {col.notes || '-'}
                    </td>
                  </tr>
                );
              })}
              {cols.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No route data recorded for this date.
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
