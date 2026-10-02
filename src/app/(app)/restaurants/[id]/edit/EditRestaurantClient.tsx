"use client"

import { RestaurantForm } from "@/components/restaurants/RestaurantForm"
import type { RestaurantFormValues } from "@/lib/validations/restaurant"
import type { Database } from "@/types/supabase"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"]

export default function EditRestaurantClient({
  id,
  restaurant,
  loadError,
}: {
  id: string
  restaurant: RestaurantRow | null
  loadError: string | null
}) {
  const router = useRouter()

  const handleSubmit = async (data: RestaurantFormValues) => {
    const { error } = await supabase.from("restaurants").update(data).eq("id", id)
    if (error) throw error

    router.push("/restaurants")
    router.refresh()
  }

  if (!restaurant) {
    return (
      <div className="p-8 text-red-500">
        {loadError
          ? `Restaurant not found: ${loadError}`
          : "Restaurant not found or you don’t have permission to edit it."}
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Restaurant</h1>
        <p className="text-sm text-slate-500">
          Update {restaurant.name}&apos;s details.
        </p>
      </div>

      {/* `address` / `contact_person` / `phone` are nullable in the schema but the
          form's `initialData` contract is non-nullable, so the row is handed over as-is. */}
      <RestaurantForm
        initialData={restaurant as unknown as RestaurantFormValues}
        onSubmit={handleSubmit}
      />
    </div>
  )
}