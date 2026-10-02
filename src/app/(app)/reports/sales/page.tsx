import { createClient } from "@/lib/supabase/server"
import { BarChart3, Building2, Package } from "lucide-react"
import ExportReportButtons from "@/components/reports/ExportReportButtons"

export const revalidate = 0

// `get_sales_by_product` / `get_sales_by_restaurant` return `jsonb`, so the
// generated `Functions` types only say `Json[]`. These are the concrete RETURNS
// TABLE shapes declared in supabase/migrations/17_sales_report.sql.
type SalesByProduct = {
  product_id: string
  product_name: string
  total_quantity: number
  total_revenue: number
}

type SalesByRestaurant = {
  restaurant_id: string
  restaurant_name: string
  total_quantity: number
  total_revenue: number
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams;

  // Default to current month
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const startDate = resolvedSearchParams.start || firstDay
  const endDate = resolvedSearchParams.end || lastDay

  // Fetch sales breakdowns in parallel directly from PostgreSQL for mathematical purity
  const [
    { data: productSales },
    { data: restaurantSales }
  ] = await Promise.all([
    supabase.rpc('get_sales_by_product', { p_start: startDate, p_end: endDate }).returns<SalesByProduct[]>(),
    supabase.rpc('get_sales_by_restaurant', { p_start: startDate, p_end: endDate }).returns<SalesByRestaurant[]>()
  ])

  const products = productSales || []
  const restaurants = restaurantSales || []

  const totalVolume = products.reduce((sum: number, p) => sum + Number(p.total_quantity), 0)
  const totalRevenue = products.reduce((sum: number, p) => sum + Number(p.total_revenue), 0)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      
      {/* Header and Controls */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Report</h1>
          <p className="text-sm text-slate-500">Breakdown of sales volume and revenue by product and restaurant.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <form className="flex items-center gap-2">
            <input 
              type="date" 
              name="start"
              defaultValue={startDate}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-slate-400">to</span>
            <input 
              type="date" 
              name="end"
              defaultValue={endDate}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <button type="submit" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
              Filter
            </button>
          </form>
          <ExportReportButtons 
            data={[
              ...products.map((p) => ({ Type: 'Product', Name: p.product_name, Volume_kg: p.total_quantity, Revenue_Rs: p.total_revenue })),
              ...restaurants.map((r) => ({ Type: 'Restaurant', Name: r.restaurant_name, Volume_kg: r.total_quantity, Revenue_Rs: r.total_revenue }))
            ]}
            filename={`Sales_Report_${startDate}_to_${endDate}`}
          />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 rounded-lg text-emerald-600">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Volume Sold</p>
            <p className="text-3xl font-bold text-slate-900">{totalVolume.toFixed(2)} <span className="text-lg text-slate-500 font-normal">kg</span></p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 rounded-lg text-blue-600">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Revenue Generated</p>
            <p className="text-3xl font-bold text-slate-900">₹{totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Product Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <Package className="h-5 w-5 text-slate-400" />
            <h2 className="font-bold text-slate-900">Sales by Product</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 font-medium text-right">Volume (kg)</th>
                  <th className="px-6 py-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.map((p) => (
                  <tr key={p.product_id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{p.product_name}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{Number(p.total_quantity).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900">₹{Number(p.total_revenue).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Restaurant Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Building2 className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-800">Sales by Restaurant</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white text-xs uppercase text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 font-medium">Restaurant</th>
                  <th className="px-6 py-3 font-medium text-right">Volume (kg)</th>
                  <th className="px-6 py-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {restaurants.map((r) => (
                  <tr key={r.restaurant_id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{r.restaurant_name}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{Number(r.total_quantity).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-medium text-emerald-600">₹{Number(r.total_revenue).toFixed(2)}</td>
                  </tr>
                ))}
                {restaurants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No sales recorded for this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
