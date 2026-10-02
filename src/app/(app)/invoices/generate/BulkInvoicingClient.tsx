"use client"

import { useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { FileText, Building2, CheckSquare, Square } from "lucide-react"

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

  // Group collections by restaurant
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

  const toggleSelection = (restaurantId: string, collectionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)

      // Enforce selection from only one restaurant at a time: selecting an item
      // belonging to a different restaurant than the current selection clears
      // the previous selection first.
      if (next.size > 0 && !next.has(collectionId)) {
        const firstSelectedId = Array.from(next)[0]
        const firstSelectedCollection = collections.find(c => c.id === firstSelectedId)
        if (firstSelectedCollection && firstSelectedCollection.restaurant_id !== restaurantId) {
          next.clear()
        }
      }

      if (next.has(collectionId)) {
        next.delete(collectionId)
      } else {
        next.add(collectionId)
      }
      return next
    })
  }

  const handleGenerateInvoice = async () => {
    if (selectedIds.size === 0) return

    setIsGenerating(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('generate_bulk_invoice', {
        p_collection_ids: Array.from(selectedIds)
      })

      if (rpcError) throw rpcError

      // The RPC returns the id of the invoice it just raised. Send the user
      // straight to it so they can review and download the PDF; fall back to
      // the invoice list if the id is somehow missing.
      if (data) {
        router.push(`/invoices/${data}`)
      } else {
        router.push('/billing')
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : ""
      setError(message || "Failed to generate invoice.")
      setIsGenerating(false)
    }
  }

  const totalSelectedAmount = collections
    .filter(c => selectedIds.has(c.id))
    .reduce((sum, c) => sum + c.total_amount, 0)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Invoicing</h1>
          <p className="text-sm text-slate-500">Select verified collections to merge into a single invoice.</p>
        </div>

        <button
          onClick={handleGenerateInvoice}
          disabled={selectedIds.size === 0 || isGenerating}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText className="h-4 w-4" />
          {isGenerating ? "Generating..." : `Generate Invoice (${selectedIds.size})`}
        </button>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-md font-medium">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex justify-between items-center">
          <div className="text-sm text-blue-800 font-medium">
            {selectedIds.size} docket(s) selected
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
          {groupedCollections.map((group) => (
            <div key={group.restaurant.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-slate-400" />
                <h2 className="text-lg font-bold text-slate-900">{group.restaurant.name}</h2>
                <span className="ml-auto text-xs font-medium bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                  {group.collections.length} Uninvoiced
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {group.collections.map(collection => {
                  const isSelected = selectedIds.has(collection.id)
                  const isSelectable = selectedIds.size === 0 || collections.find(c => c.id === Array.from(selectedIds)[0])?.restaurant_id === group.restaurant.id

                  return (
                    <div
                      key={collection.id}
                      onClick={() => isSelectable && toggleSelection(group.restaurant.id, collection.id)}
                      className={`px-6 py-4 flex items-center gap-4 transition-colors ${
                        !isSelectable ? 'opacity-50 cursor-not-allowed bg-slate-50' :
                        isSelected ? 'bg-blue-50/50 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!isSelectable}
                        aria-label={isSelected ? `Deselect collection ${collection.id}` : `Select collection ${collection.id}`}
                        className={`text-slate-400 flex-shrink-0 transition-colors ${isSelected ? 'text-blue-600' : (isSelectable ? 'hover:text-blue-600' : '')}`}
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
          ))}
        </div>
      )}
    </div>
  )
}