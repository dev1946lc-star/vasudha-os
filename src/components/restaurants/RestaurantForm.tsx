"use client"

import { useForm } from "react-hook-form"
import { formResolver } from "@/components/form-resolvers"
import { errorMessage } from "@/components/error-message"
import { restaurantSchema, RestaurantFormValues } from "@/lib/validations/restaurant"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface RestaurantFormProps {
  initialData?: RestaurantFormValues & { id?: string }
  onSubmit: (data: RestaurantFormValues) => Promise<void>
}

export function RestaurantForm({ initialData, onSubmit }: RestaurantFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RestaurantFormValues>({
    resolver: formResolver(restaurantSchema),
    defaultValues: initialData || {
      name: "",
      address: "",
      contact_person: "",
      phone: "",
      credit_limit: 0,
      payment_terms_days: 15,
      is_active: true,
    },
  })

  const handleFormSubmit = async (data: RestaurantFormValues) => {
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
        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Restaurant Name</label>
          <input
            {...register("name")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Contact Person</label>
          <input
            {...register("contact_person")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.contact_person && <p className="mt-1 text-sm text-red-600">{errors.contact_person.message}</p>}
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Phone</label>
          <input
            {...register("phone")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Address</label>
          <textarea
            {...register("address")}
            rows={3}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Credit Limit (₹)</label>
          <input
            type="number"
            {...register("credit_limit")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.credit_limit && <p className="mt-1 text-sm text-red-600">{errors.credit_limit.message}</p>}
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700">Payment Terms (Days)</label>
          <input
            type="number"
            {...register("payment_terms_days")}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {errors.payment_terms_days && <p className="mt-1 text-sm text-red-600">{errors.payment_terms_days.message}</p>}
        </div>

        <div className="col-span-2 flex items-center mt-2">
          <input
            type="checkbox"
            {...register("is_active")}
            id="is_active"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
            Active Account
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
          {isSubmitting ? "Saving..." : "Save Restaurant"}
        </button>
      </div>
    </form>
  )
}
