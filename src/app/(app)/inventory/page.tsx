import { api, type InventoryItem } from "@/lib/api"
import { auth } from "@clerk/nextjs/server"
import { canAccessRoute } from "@/lib/auth-guards"
import { resolveAccess } from "@/lib/session-claims"
import Link from "next/link"
import { Plus, Package, AlertTriangle } from "lucide-react"

export const revalidate = 30

export default async function InventoryPage() {
  // add_stock is owner/manager-only in the database, so hide the link from roles
  // that would only get an authorisation error if they followed it.
  const { userId } = await auth()
  const role = (await resolveAccess(userId ?? ""))?.role ?? "agent"
  const canAddStock = canAccessRoute(role, "/inventory/add")

  let inventory: InventoryItem[] = []

  try {
    inventory = await api.inventory()
  } catch (e) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load inventory: {(e as Error).message}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Stock</h1>
          <p className="text-sm text-slate-500">Track current stock levels across all products.</p>
        </div>
        {canAddStock && (
          <Link
            href="/inventory/add"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Stock
          </Link>
        )}
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        {inventory.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p>No stock available. Add stock to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">HSN Code</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity in Stock</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Last Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {inventory.map((item) => {
                  const isLowStock = item.quantity < (item.min_stock_level || 0)
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50 ${isLowStock ? "bg-red-50/50" : ""}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isLowStock && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          <div className={`text-sm font-medium ${isLowStock ? "text-red-900" : "text-slate-900"}`}>
                            {item.product_name}
                          </div>
                        {isLowStock && (
                          <div className="text-xs text-red-500 mt-1">
                            Below minimum of {item.min_stock_level}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.hsn_code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className={`text-sm font-bold ${isLowStock ? "text-red-600" : "text-slate-900"}`}>
                          {item.quantity}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-500">
                        {new Date(item.last_updated).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
