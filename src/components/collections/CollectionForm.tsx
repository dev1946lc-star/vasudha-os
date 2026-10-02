"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { formResolver } from "@/components/form-resolvers"
import { collectionSchema, CollectionFormValues } from "@/lib/validations/collection"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { errorMessage } from "@/components/error-message"

type ProductDropdown = {
  id: string
  name: string
  price: number
}

type RestaurantDropdown = {
  id: string
  name: string
}

interface CollectionFormProps {
  restaurants: RestaurantDropdown[]
  products: ProductDropdown[]
  defaultRestaurantId?: string
  onSubmit: (data: CollectionFormValues) => Promise<void>
}

export function CollectionForm({ restaurants, products, defaultRestaurantId, onSubmit }: CollectionFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CollectionFormValues>({
    resolver: formResolver(collectionSchema),
    defaultValues: {
      restaurant_id: defaultRestaurantId || "",
      notes: "",
      items: [
        { product_id: products.length > 0 ? products[0].id : "", quantity: 0, return_quantity: 0, unit_price: products.length > 0 ? products[0].price : 0 }
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    name: "items",
    control,
  })

  // Watch items to calculate real-time math
  const watchItems = watch("items")
  const totalAmount = watchItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0)
  const totalQuantity = watchItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const totalReturns = watchItems.reduce((sum, item) => sum + (item.return_quantity || 0), 0)

  // Auto-update price when product changes
  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      setValue(`items.${index}.unit_price`, product.price)
    }
  }

  const handleFormSubmit = async (data: CollectionFormValues) => {
    // Validate that at least one quantity or return is logged
    if (data.items.every(item => item.quantity === 0 && item.return_quantity === 0)) {
      setError("Please record at least one collection quantity or return quantity.")
      return
    }

    try {
      setError(null)
      await onSubmit(data)
    } catch (err) {
      setError(errorMessage(err, "An error occurred while saving."))
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-4xl mx-auto">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Select Restaurant</label>
          <select
            {...register("restaurant_id")}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            <option value="" disabled>Select a restaurant...</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {errors.restaurant_id && <p className="mt-1 text-sm text-red-600">{errors.restaurant_id.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Notes (Optional)</label>
          <input
            {...register("notes")}
            placeholder="Any special remarks..."
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-slate-900">Line Items</h3>
          <button
            type="button"
            onClick={() => append({ product_id: products[0]?.id || "", quantity: 0, return_quantity: 0, unit_price: products[0]?.price || 0 })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>

        {errors.items?.root && <p className="text-sm text-red-600">{errors.items.root.message}</p>}

        {fields.map((field, index) => {
          const itemAmount = ((watchItems[index]?.quantity || 0) * (watchItems[index]?.unit_price || 0)).toFixed(2)
          
          return (
            <div key={field.id} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto">
              <div className="w-full min-w-[150px] sm:flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Product</label>
                <select
                  {...register(`items.${index}.product_id` as const)}
                  onChange={(e) => {
                    register(`items.${index}.product_id`).onChange(e)
                    handleProductChange(index, e.target.value)
                  }}
                  className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors.items?.[index]?.product_id && <p className="mt-1 text-xs text-red-600">{errors.items[index]?.product_id?.message}</p>}
              </div>

              <div className="w-full sm:w-24">
                <label className="block text-xs font-medium text-slate-500 mb-1">Collected Qty</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.quantity` as const)}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                />
                {errors.items?.[index]?.quantity && <p className="mt-1 text-xs text-red-600">{errors.items[index]?.quantity?.message}</p>}
              </div>

              <div className="w-full sm:w-24">
                <label className="block text-xs font-medium text-slate-500 mb-1">Returned Qty</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.return_quantity` as const)}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                />
                {errors.items?.[index]?.return_quantity && <p className="mt-1 text-xs text-red-600">{errors.items[index]?.return_quantity?.message}</p>}
              </div>

              <div className="w-full sm:w-24">
                <label className="block text-xs font-medium text-slate-500 mb-1">Unit Rate (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.unit_price` as const)}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                />
                {errors.items?.[index]?.unit_price && <p className="mt-1 text-xs text-red-600">{errors.items[index]?.unit_price?.message}</p>}
              </div>

              <div className="w-full sm:w-24 pt-1 sm:pt-5 text-right">
                <div className="text-xs font-medium text-slate-500 mb-1 sm:hidden">Amount</div>
                <div className="font-bold text-slate-900">₹{itemAmount}</div>
              </div>

              <div className="w-full sm:w-auto pt-1 sm:pt-5 text-right sm:text-left">
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                  title="Remove Item"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex gap-6 text-sm text-slate-600">
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">Total Collected</span>
            <span className="font-bold text-slate-900">{totalQuantity.toFixed(2)} Units</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">Total Returned</span>
            <span className="font-bold text-slate-900">{totalReturns.toFixed(2)} Units</span>
          </div>
        </div>

        <div className="text-xl font-bold text-slate-900">
          Total Amount: <span className="text-green-600">₹{totalAmount.toFixed(2)}</span>
        </div>
        
        <div className="flex gap-4 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 sm:flex-none py-2 px-6 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 sm:flex-none py-2 px-8 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? "Recording..." : "Record Collection"}
          </button>
        </div>
      </div>
    </form>
  )
}
