"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, PackagePlus, AlertCircle } from "lucide-react"

type ProductDropdown = {
  id: string
  name: string
  hsn_code: string | null
  unit: string | null
  price: number
}

type EntryTypeOption = "purchase" | "adjustment" | "physical_count"

export default function AddInventoryPage() {
  const router = useRouter()
  const [products, setProducts] = useState<ProductDropdown[]>([])
  const [productId, setProductId] = useState("")
  const [entryType, setEntryType] = useState<EntryTypeOption>("purchase")
  const [adjustmentDirection, setAdjustmentDirection] = useState<"add" | "deduct">("add")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [supplier, setSupplier] = useState("")
  const [supplierGstin, setSupplierGstin] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [notes, setNotes] = useState("")

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, hsn_code, unit, price")
        .eq("is_active", true)
        .order("name", { ascending: true })

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

  const selectedProduct = products.find((p) => p.id === productId)
  const productUnit = selectedProduct?.unit || "units"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const rawQty = parseFloat(quantity)
    if (isNaN(rawQty) || rawQty <= 0) {
      setError("Please enter a valid positive quantity.")
      setSubmitting(false)
      return
    }

    // If adjustment is deducting, negate quantity
    let finalQty = rawQty
    if (entryType === "adjustment" && adjustmentDirection === "deduct") {
      finalQty = -rawQty
    }

    const parsedCost = unitCost ? parseFloat(unitCost) : null
    if (unitCost && (isNaN(parsedCost!) || parsedCost! < 0)) {
      setError("Unit cost must be a non-negative number.")
      setSubmitting(false)
      return
    }

    try {
      const { error: rpcError } = await supabase.rpc("add_stock", {
        p_product_id: productId,
        p_quantity: finalQty,
        p_entry_type: entryType,
        p_unit_cost: parsedCost ?? undefined,
        p_supplier: supplier.trim() || undefined,
        p_supplier_gstin: supplierGstin.trim().toUpperCase() || undefined,
        p_batch_number: batchNumber.trim() || undefined,
        p_expiry_date: expiryDate || undefined,
        p_notes: notes.trim() || undefined,
      })

      if (rpcError) throw rpcError

      router.push("/inventory/ledger")
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : ""
      setError(message || "Failed to record stock entry.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading catalog...</div>
  }

  return (
    <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Inventory
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-blue-600" />
          Record Stock Entry
        </h1>
        <p className="text-sm text-slate-500">
          Appends an auditable row to the stock ledger and updates the running inventory balance.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Product Selection */}
        <div>
          <label htmlFor="product" className="block text-sm font-medium text-slate-700">
            Select Product *
          </label>
          <select
            id="product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2.5 text-sm border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-white"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.unit ? `(${p.unit})` : ""} {p.hsn_code ? `— HSN: ${p.hsn_code}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Movement Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Movement Type *</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label
              className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${
                entryType === "purchase"
                  ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-blue-900"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="entryType"
                value="purchase"
                checked={entryType === "purchase"}
                onChange={() => setEntryType("purchase")}
                className="sr-only"
              />
              <span className="font-semibold text-sm">Purchase</span>
              <span className="text-xs text-slate-500 mt-1">Goods received from supplier</span>
            </label>

            <label
              className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${
                entryType === "adjustment"
                  ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-blue-900"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="entryType"
                value="adjustment"
                checked={entryType === "adjustment"}
                onChange={() => setEntryType("adjustment")}
                className="sr-only"
              />
              <span className="font-semibold text-sm">Adjustment</span>
              <span className="text-xs text-slate-500 mt-1">Manual stock correction</span>
            </label>

            <label
              className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${
                entryType === "physical_count"
                  ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-blue-900"
                  : "border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="entryType"
                value="physical_count"
                checked={entryType === "physical_count"}
                onChange={() => setEntryType("physical_count")}
                className="sr-only"
              />
              <span className="font-semibold text-sm">Physical Count</span>
              <span className="text-xs text-slate-500 mt-1">Warehouse reconciliation</span>
            </label>
          </div>
        </div>

        {/* Quantity Field */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="quantity" className="block text-sm font-medium text-slate-700">
              Quantity ({productUnit}) *
            </label>
            {entryType === "adjustment" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection("add")}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    adjustmentDirection === "add"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentDirection("deduct")}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    adjustmentDirection === "deduct"
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  - Deduct / Shrinkage
                </button>
              </div>
            )}
          </div>
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
          <p className="mt-1 text-xs text-slate-500">
            {entryType === "adjustment" && adjustmentDirection === "deduct"
              ? `Will decrease inventory by ${quantity || "0"} ${productUnit}.`
              : `Will increase inventory by ${quantity || "0"} ${productUnit}.`}
          </p>
        </div>

        {/* Supplier & Cost Section (Primary for purchases) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div>
            <label htmlFor="unitCost" className="block text-sm font-medium text-slate-700">
              Unit Cost (₹)
            </label>
            <input
              type="number"
              id="unitCost"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder={`Default: ₹${selectedProduct?.price || 0}`}
            />
            <p className="mt-1 text-xs text-slate-400">Used for inventory valuation and GSTR-3B ITC.</p>
          </div>

          <div>
            <label htmlFor="supplier" className="block text-sm font-medium text-slate-700">
              Supplier Name
            </label>
            <input
              type="text"
              id="supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g. Metro Supplies Ltd."
            />
          </div>

          <div>
            <label htmlFor="supplierGstin" className="block text-sm font-medium text-slate-700">
              Supplier GSTIN
            </label>
            <input
              type="text"
              id="supplierGstin"
              maxLength={15}
              value={supplierGstin}
              onChange={(e) => setSupplierGstin(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono uppercase"
              placeholder="e.g. 29AAAAA0000A1Z5"
            />
            <p className="mt-1 text-xs text-slate-400">Determines CGST+SGST vs IGST for input tax.</p>
          </div>

          <div>
            <label htmlFor="batchNumber" className="block text-sm font-medium text-slate-700">
              Batch / Lot Number
            </label>
            <input
              type="text"
              id="batchNumber"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
              placeholder="e.g. BATCH-2026-04"
            />
          </div>

          <div>
            <label htmlFor="expiryDate" className="block text-sm font-medium text-slate-700">
              Expiry Date
            </label>
            <input
              type="date"
              id="expiryDate"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
              Notes / Reference
            </label>
            <input
              type="text"
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g. PO #10842 / Recount reconciliation"
            />
          </div>
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
            className="flex-1 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {submitting ? "Saving to Ledger..." : "Record Stock Entry"}
          </button>
        </div>
      </form>
    </div>
  )
}
