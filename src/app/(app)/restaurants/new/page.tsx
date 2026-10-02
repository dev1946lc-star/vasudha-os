"use client"

import { RestaurantForm } from "@/components/restaurants/RestaurantForm"
import type { RestaurantFormValues } from "@/lib/validations/restaurant"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useAppStore } from "@/store"

export default function NewRestaurantPage() {
  const router = useRouter()
  // Hydrated by AppGuard's mount effect, so it is briefly null on first render.
  const companyId = useAppStore((state) => state.user?.company_id)

  const handleSubmit = async (data: RestaurantFormValues) => {
    if (!companyId) {
      throw new Error("Missing company profile — sign out and back in.")
    }

    const { error: insertError } = await supabase
      .from('restaurants')
      .insert({ ...data, company_id: companyId })

    if (insertError) throw insertError

    router.push("/restaurants")
    router.refresh()
  }

  if (!companyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <p className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          No company is associated with your account, so a restaurant cannot be
          filed against a tenant. Ask an owner to set your company, then sign in
          again.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Add New Restaurant</h1>
        <p className="text-sm text-slate-500">Register a new restaurant for oil collection.</p>
      </div>

      <RestaurantForm onSubmit={handleSubmit} />
    </div>
  )
}