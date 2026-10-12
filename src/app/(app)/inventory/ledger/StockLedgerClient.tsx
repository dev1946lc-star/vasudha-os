"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
  Package,
  Layers,
  Search,
  Filter,
  Building2,
  Plus
} from "lucide-react"
import DownloadCSVButton from "@/components/reports/DownloadCSVButton"

export type StockEntryItem = {
  id: string
  entry_date: string
  quantity_change: number
  quantity_before: number | null
  quantity_after: number | null
  entry_type: string
  reference_type: string | null
  reference_id: string | null
  unit_cost: number | null
  unit_cost_total: number | null
  unit: string | null
  supplier: string | null
  supplier_gstin: string | null
  batch_number: string | null
  expiry_date: string | null
  notes: string | null
  created_at: string
  product_name: string
  product_unit: string
  hsn_code: string | null
}

interface Props {
  initialEntries: StockEntryItem[]
  canAddStock: boolean
}

const ENTRY_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
  purchase: {
    label: "Purchase / Received",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: ArrowDownLeft,
  },
  opening_stock: {
    label: "Opening Stock",
    color: "bg-slate-50 text-slate-700 border-slate-200",
    icon: Layers,
  },
  dispatch: {
    label: "Dispatch / Delivery",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: ArrowUpRight,
  },
  return_from_customer: {
    label: "Customer Return",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: RotateCcw,
  },
  wastage: {
    label: "Wastage / Write-off",
    color: "bg-rose-50 text-rose-700 border-rose-200",
    icon: Trash2,
  },
  adjustment: {
    label: "Inventory Adjustment",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: SlidersHorizontal,
  },
  physical_count: {
    label: "Physical Count Reconciled",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    icon: Package,
  },
}

export default function StockLedgerClient({ initialEntries, canAddStock }: Props) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>()
    initialEntries.forEach((e) => {
      if (e.product_name) map.set(e.product_name, e.product_name)
    })
    return Array.from(map.values()).sort()
  }, [initialEntries])

  const filteredEntries = useMemo(() => {
    return initialEntries.filter((entry) => {
      if (typeFilter !== "all" && entry.entry_type !== typeFilter) {
        return false
      }
      if (productFilter !== "all" && entry.product_name !== productFilter) {
        return false
      }
      if (startDate && entry.entry_date < startDate) {
        return false
      }
      if (endDate && entry.entry_date > endDate) {
        return false
      }
      if (search) {
        const query = search.toLowerCase()
        const matchesProduct = entry.product_name?.toLowerCase().includes(query)
        const matchesSupplier = entry.supplier?.toLowerCase().includes(query)
        const matchesGstin = entry.supplier_gstin?.toLowerCase().includes(query)
        const matchesBatch = entry.batch_number?.toLowerCase().includes(query)
        const matchesNotes = entry.notes?.toLowerCase().includes(query)
        if (!matchesProduct && !matchesSupplier && !matchesGstin && !matchesBatch && !matchesNotes) {
          return false
        }
      }
      return true
    })
  }, [initialEntries, typeFilter, productFilter, startDate, endDate, search])

  // Summary KPIs
  const summary = useMemo(() => {
    let unitsIn = 0
    let unitsDispatched = 0
    let unitsReturned = 0
    let unitsWasted = 0

    filteredEntries.forEach((e) => {
      const qty = Number(e.quantity_change) || 0
      if (e.entry_type === "purchase" || e.entry_type === "opening_stock") {
        unitsIn += qty
      } else if (e.entry_type === "dispatch") {
        unitsDispatched += Math.abs(qty)
      } else if (e.entry_type === "return_from_customer") {
        unitsReturned += qty
      } else if (e.entry_type === "wastage") {
        unitsWasted += Math.abs(qty)
      }
    })

    return {
      totalCount: filteredEntries.length,
      unitsIn,
      unitsDispatched,
      unitsReturned,
      unitsWasted,
    }
  }, [filteredEntries])

  // CSV export mapping
  const csvData = useMemo(() => {
    return filteredEntries.map((e) => ({
      "Entry Date": e.entry_date,
      "Product": e.product_name,
      "Unit": e.product_unit || e.unit || "unit",
      "Entry Type": e.entry_type,
      "Quantity Change": e.quantity_change,
      "Quantity Before": e.quantity_before ?? "",
      "Quantity After": e.quantity_after ?? "",
      "Unit Cost (INR)": e.unit_cost ?? "",
      "Supplier": e.supplier ?? "",
      "Supplier GSTIN": e.supplier_gstin ?? "",
      "Batch Number": e.batch_number ?? "",
      "Expiry Date": e.expiry_date ?? "",
      "Notes": e.notes ?? "",
    }))
  }, [filteredEntries])

  return (
    <div className="space-y-6">
      {/* Navigation Tabs between Current Stock and Ledger */}
      <div className="flex border-b border-slate-200 gap-6">
        <Link
          href="/inventory"
          className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          Current Stock Levels
        </Link>
        <Link
          href="/inventory/ledger"
          className="pb-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 transition-colors flex items-center gap-2"
        >
          <Layers className="h-4 w-4" />
          Stock Movement Ledger
        </Link>
      </div>

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Ledger</h1>
          <p className="text-sm text-slate-500 mt-1">
            Complete audit trail of every purchase, delivery, return, and write-off.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadCSVButton data={csvData} filename={`stock_ledger_${new Date().toISOString().split("T")[0]}`} />
          {canAddStock && (
            <Link
              href="/inventory/add"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add / Adjust Stock
            </Link>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Entries Logged</p>
          <p className="text-2xl font-bold mt-1 text-slate-900">{summary.totalCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Received</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">+{summary.unitsIn.toFixed(1)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Dispatched</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">-{summary.unitsDispatched.toFixed(1)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Restocked Returns</p>
          <p className="text-2xl font-bold mt-1 text-indigo-600">+{summary.unitsReturned.toFixed(1)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 md:col-span-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Wastage / Written Off</p>
          <p className="text-2xl font-bold mt-1 text-rose-600">{summary.unitsWasted.toFixed(1)}</p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search product, supplier, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <Filter className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Movement Types</option>
              <option value="purchase">Purchases / Goods In</option>
              <option value="dispatch">Dispatches / Deliveries</option>
              <option value="return_from_customer">Customer Returns</option>
              <option value="wastage">Wastage / Write-offs</option>
              <option value="adjustment">Adjustments</option>
              <option value="physical_count">Physical Counts</option>
              <option value="opening_stock">Opening Stock</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="all">All Products</option>
              {uniqueProducts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              title="From date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              title="To date"
            />
          </div>
        </div>

        {(search || typeFilter !== "all" || productFilter !== "all" || startDate || endDate) && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>
              Showing {filteredEntries.length} of {initialEntries.length} entries
            </span>
            <button
              onClick={() => {
                setSearch("")
                setTypeFilter("all")
                setProductFilter("all")
                setStartDate("")
                setEndDate("")
              }}
              className="text-blue-600 hover:underline font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Layers className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium text-slate-700">No stock ledger entries found.</p>
            <p className="text-xs text-slate-400 mt-1">
              Movements will appear here automatically when deliveries are completed or stock is received.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Date</th>
                  <th className="px-5 py-3.5 font-medium">Product</th>
                  <th className="px-5 py-3.5 font-medium">Movement Type</th>
                  <th className="px-5 py-3.5 font-medium text-right">Quantity Change</th>
                  <th className="px-5 py-3.5 font-medium text-center">Balance Transition</th>
                  <th className="px-5 py-3.5 font-medium">Details / Supplier</th>
                  <th className="px-5 py-3.5 font-medium">Notes & Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredEntries.map((entry) => {
                  const cfg = ENTRY_TYPE_CONFIG[entry.entry_type] || {
                    label: entry.entry_type,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                    icon: Package,
                  }
                  const Icon = cfg.icon
                  const isPositive = Number(entry.quantity_change) > 0
                  const isZero = Number(entry.quantity_change) === 0
                  const unitLabel = entry.product_unit || entry.unit || "units"

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600 font-medium">
                        {entry.entry_date}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{entry.product_name}</div>
                        {entry.hsn_code && (
                          <div className="text-xs text-slate-400">HSN: {entry.hsn_code}</div>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${cfg.color}`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {cfg.label}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <span
                          className={`font-bold text-sm ${
                            isPositive
                              ? "text-emerald-600"
                              : isZero
                              ? "text-slate-500"
                              : "text-rose-600"
                          }`}
                        >
                          {isPositive ? `+${entry.quantity_change}` : entry.quantity_change}{" "}
                          <span className="text-xs font-normal text-slate-500">{unitLabel}</span>
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-center text-xs text-slate-600">
                        {entry.quantity_before != null && entry.quantity_after != null ? (
                          <div className="inline-flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            <span className="text-slate-500">{entry.quantity_before}</span>
                            <span className="text-slate-300">→</span>
                            <span className="font-semibold text-slate-900">{entry.quantity_after}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600 max-w-xs">
                        {entry.supplier && (
                          <div className="font-medium text-slate-800 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                            {entry.supplier}
                          </div>
                        )}
                        {entry.supplier_gstin && (
                          <div className="text-slate-400 text-[11px]">GSTIN: {entry.supplier_gstin}</div>
                        )}
                        {entry.unit_cost != null && (
                          <div className="text-emerald-700 font-medium mt-0.5">
                            ₹{Number(entry.unit_cost).toFixed(2)} / unit
                          </div>
                        )}
                        {(entry.batch_number || entry.expiry_date) && (
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {entry.batch_number && <span>Batch: {entry.batch_number}</span>}
                            {entry.expiry_date && <span> • Exp: {entry.expiry_date}</span>}
                          </div>
                        )}
                        {!entry.supplier && !entry.unit_cost && !entry.batch_number && !entry.expiry_date && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600 max-w-sm">
                        {entry.notes ? (
                          <span className="line-clamp-2" title={entry.notes}>
                            {entry.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No notes</span>
                        )}
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
