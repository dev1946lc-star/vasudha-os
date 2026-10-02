"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type ProductDropdown = {
  id: string
  name: string
  hsn_code: string | null
}

export default function AddInventoryPage() {
  const router = useRouter()
  const [products, setProducts] = useState<ProductDropdown[]>([])
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, hsn_code')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) {
        setError("Failed to load products.")
      } else {
        setProducts(data || [])
        if (data && data.length > 0) {
          setProductId(data[0].id)
        }
      }
      setLoading(false)
    }

    fetchProducts()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const parsedQuantity = parseFloat(quantity)
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError("Please enter a valid positive quantity.")
      setSubmitting(false)
      return
    }

    try {
      const { error: rpcError } = await supabase.rpc('add_stock', {
        p_product_id: productId,
        p_quantity: parsedQuantity
      })

      if (rpcError) throw rpcError

      router.push("/inventory")
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : ""
      setError(message || "Failed to add stock.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading form...</div>
  }

  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Add Inventory Stock</h1>
        <p className="text-sm text-slate-500">Accurately increment stock for a specific product.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="product" className="block text-sm font-medium text-slate-700">
            Select Product
          </label>
          <select
            id="product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (HSN: {p.hsn_code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-slate-700">
            Quantity to Add
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              id="quantity"
              step="0.01"
              required
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g. 50.00"
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            This will be added to the existing stock count.
          </p>
        </div>

        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || products.length === 0}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {submitting ? "Adding Stock..." : "Add Stock"}
          </button>
        </div>
      </form>
    </div>
  )
}
