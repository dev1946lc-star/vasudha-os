"use client"

import { useForm } from "react-hook-form"
import { formResolver } from "@/components/form-resolvers"
import { errorMessage } from "@/components/error-message"
import { productSchema, ProductFormValues } from "@/lib/validations/product"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface ProductFormProps {
  initialData?: ProductFormValues & { id?: string }
  onSubmit: (data: ProductFormValues) => Promise<void>
}

export function ProductForm({ initialData, onSubmit }: ProductFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: formResolver(productSchema),
    defaultValues: initialData || {
      name: "",
      description: "",
      hsn_code: "",
      price: 0,
      gst_rate: 5.0,
      min_stock_level: 0,
      is_active: true,
    },
  })

  const handleFormSubmit = async (data: ProductFormValues) => {
    try {
      setError(null)
      await onSubmit(data)
    } catch (err) {
      setError(errorMessage(err, "An error occurred while saving."))
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Product Name</label>
          <input
            {...register("name")}
            placeholder="Used Cooking Oil (UCO)"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            {...register("description")}
            rows={2}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">HSN Code</label>
          <input
            {...register("hsn_code")}
            placeholder="1518"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.hsn_code && <p className="mt-1 text-sm text-red-600">{errors.hsn_code.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">GST Rate (%)</label>
          <input
            type="number"
            step="0.01"
            {...register("gst_rate")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.gst_rate && <p className="mt-1 text-sm text-red-600">{errors.gst_rate.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Default Price (₹ / unit)</label>
          <input
            type="number"
            step="0.01"
            {...register("price")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Minimum Stock Threshold</label>
          <input
            type="number"
            step="0.01"
            {...register("min_stock_level")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.min_stock_level && <p className="mt-1 text-sm text-red-600">{errors.min_stock_level.message}</p>}
        </div>

        <div className="col-span-2 flex items-center mt-2">
          <input
            type="checkbox"
            {...register("is_active")}
            id="is_active"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
            Active Catalog Item
          </label>
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
          disabled={isSubmitting}
          className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : "Save Product"}
        </button>
      </div>
    </form>
  )
}
