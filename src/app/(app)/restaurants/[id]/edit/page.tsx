import { createClient } from "@/lib/supabase/server"
import EditRestaurantClient from "./EditRestaurantClient"

export const revalidate = 0

export default async function EditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Fetch server-side so the Clerk JWT is attached and RLS can scope the row.
  const supabase = await createClient()

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single()

  return (
    <EditRestaurantClient
      id={id}
      restaurant={restaurant}
      loadError={error?.message ?? null}
    />
  )
}