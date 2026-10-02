"use client"

import { useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { FileText, Building2, CheckSquare, Square, CheckCircle2, Loader2 } from "lucide-react"

export type BulkCollection = {
  id: string
  restaurant_id: string
  collection_date: string
  total_amount: number
  status: string
  restaurants: {
    id: string
    name: string
  }
}

type IssuedInvoice = {
  restaurant_id: string
  restaurant_name: string
  invoice_id: string
  invoice_number: string
  total_amount: number
}

export default function BulkInvoicingClient({
  initialCollections,
  initialError,
}: {
  initialCollections: BulkCollection[]
  initialError: string | null
}) {
  const router = useRouter()
  const collections = initialCollections

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(initialError)
  const [isGenerating, setIsGenerating] = useState(false)
  const [issued, setIssued] = useState<IssuedInvoice[] | null>(null)

  const groupedCollections = useMemo(() => {
    const groups = new Map<string, { restaurant: BulkCollection['restaurants'], collections: BulkCollection[] }>()
    collections.forEach(c => {
      if (!groups.has(c.restaurant_id)) {
        groups.set(c.restaurant_id, { restaurant: c.restaurants, collections: [] })
      }
      groups.get(c.restaurant_id)!.collections.push(c)
    })
    return Array.from(groups.values())
  }, [collections])

  // Cross-restaurant selection is now allowed: the batch RPC groups by
  // restaurant and issues one invoice each. The previous version cleared the
  // selection whenever a different restaurant was ticked, which forced a billing
  // run to be one manual cycle per restaurant -- the opposite of what bulk
  // invoicing is for.
  const toggleSelection = (collectionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(collectionId)) {
        next.delete(collectionId)
      } else {
        next.add(collectionId)
      }
      return next
    })
  }

  const toggleRestaurant = (restaurantId: string) => {
    setSelectedIds(prev => {
      const group = groupedCollections.find(g => g.restaurant.id === restaurantId)
      if (!group) return prev

      const allSelected = group.collections.every(c => prev.has(c.id))
      const next = new Set(prev)
      group.collections.forEach(c => {
        if (allSelected) next.delete(c.id)
        else next.add(c.id)
      })
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(collections.map(c => c.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const handleGenerateInvoices = async () => {
    if (selectedIds.size === 0) return

    setIsGenerating(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('generate_bulk_invoices_batch', {
        p_collection_ids: Array.from(selectedIds)
      })

      if (rpcError) throw rpcError

      const rows = (data ?? []) as IssuedInvoice[]

      if (rows.length === 0) {
        setError(
          "No invoices were issued. The selected collections may already be invoiced, or the restaurant may have been removed."
        )
        setIsGenerating(false)
        return
      }

      // Show what was created rather than navigating away. With 200 invoices
      // raised at once, "done" is not a useful confirmation -- the user needs
      // the list to hand over or check.
      setIssued(rows)
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : ""
      setError(message || "Failed to generate invoices.")
      setIsGenerating(false)
    }
  }

  const selectedRestaurants = useMemo(
    () => groupedCollections.filter(g => g.collections.some(c => selectedIds.has(c.id))),
    [groupedCollections, selectedIds]
  )

  const totalSelectedAmount = collections
    .filter(c => selectedIds.has(c.id))
    .reduce((sum, c) => sum + c.total_amount, 0)

  if (issued) {
    const issuedTotal = issued.reduce((sum, i) => sum + Number(i.total_amount), 0)
    const single = issued.length === 1

    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 mb-6">
          <div className="flex items-start gap-3 mb-6">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {issued.length} invoice{issued.length === 1 ? '' : 's'} issued
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                One per restaurant, totalling ₹{issuedTotal.toFixed(2)}.
                {issued.length > 1 && ' Each restaurant received a separate bill.'}
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Restaurant</th>
                  <th className="px-4 py-3 font-medium">Invoice No.</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issued.map((inv) => (
                  <tr key={inv.invoice_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.restaurant_name}</td>
                    <td className="px-4 py-3">
                      <Linkish invoiceId={inv.invoice_id} label={inv.invoice_number} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      ₹{Number(inv.total_amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            {single && (
              <button
                onClick={() => router.push(`/invoices/${issued[0].invoice_id}`)}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700"
              >
                Review Invoice
              </button>
            )}
            <button
              onClick={() => router.push('/billing')}
              className="flex-1 py-2.5 px-4 border border-slate-300 rounded-md text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
            >
              Go to Billing
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Invoicing</h1>
          <p className="text-sm text-slate-500">
            Select verified collections across any number of restaurants. One invoice is issued
            per restaurant, in a single run.
          </p>
        </div>

        <button
          onClick={handleGenerateInvoices}
          disabled={selectedIds.size === 0 || isGenerating}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {isGenerating
            ? "Generating..."
            : `Generate ${selectedRestaurants.length || ''} Invoice${selectedRestaurants.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-md font-medium">
          {error}
        </div>
      )}

      {collections.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={selectAll}
            className="text-blue-600 font-medium hover:text-blue-800 hover:underline"
          >
            Select all {collections.length}
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
            className="text-slate-500 font-medium hover:text-slate-700 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="text-sm text-blue-800 font-medium">
            {selectedIds.size} docket(s) across {selectedRestaurants.length} restaurant(s)
            {selectedRestaurants.length > 1 && ' — one invoice each'}
          </div>
          <div className="text-lg font-bold text-blue-900">
            Selected Subtotal: ₹{totalSelectedAmount.toFixed(2)}
          </div>
        </div>
      )}

      {groupedCollections.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
          <p>No verified, uninvoiced collections found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedCollections.map((group) => {
            const groupSelected = group.collections.filter(c => selectedIds.has(c.id)).length
            const allSelected = groupSelected === group.collections.length

            return (
              <div key={group.restaurant.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleRestaurant(group.restaurant.id)}
                    aria-label={`${allSelected ? 'Deselect' : 'Select'} all collections for ${group.restaurant.name}`}
                    className="text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    {allSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5" />}
                  </button>
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <h2 className="text-lg font-bold text-slate-900">{group.restaurant.name}</h2>
                  <span className="ml-auto text-xs font-medium bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                    {groupSelected > 0 ? `${groupSelected}/${group.collections.length}` : group.collections.length} Uninvoiced
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {group.collections.map(collection => {
                    const isSelected = selectedIds.has(collection.id)

                    return (
                      <div
                        key={collection.id}
                        onClick={() => toggleSelection(collection.id)}
                        className={`px-6 py-4 flex items-center gap-4 transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={isSelected ? `Deselect collection ${collection.id}` : `Select collection ${collection.id}`}
                          className={`text-slate-400 flex-shrink-0 transition-colors ${isSelected ? 'text-blue-600' : 'hover:text-blue-600'}`}
                        >
                          {isSelected ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6" />}
                        </button>

                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              Collection from {new Date(collection.collection_date).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              ID: {collection.id.substring(0, 8)}...
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-900">₹{collection.total_amount}</div>
                            <div className="text-xs text-emerald-600 font-medium">Verified</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Kept as a tiny component so the summary table can carry a link without
// importing Link into the click-handling section above.
function Linkish({ invoiceId, label }: { invoiceId: string; label: string }) {
  return (
    <a href={`/invoices/${invoiceId}`} className="text-blue-600 font-medium hover:text-blue-800 hover:underline">
      {label}
    </a>
  )
}