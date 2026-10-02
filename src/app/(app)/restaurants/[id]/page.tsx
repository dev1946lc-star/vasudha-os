import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import RestaurantProfile from "./RestaurantProfile"

export const revalidate = 0

export default async function RestaurantProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Server Component: fetching here attaches the Clerk JWT, so RLS scopes the
  // query to the caller's company. Doing this from the browser sent an anonymous
  // token and returned nothing.
  const supabase = await createClient()

  const [{ data: restaurant, error }, { data: collections }, { data: payments }] =
    await Promise.all([
      supabase.from("restaurants").select("*").eq("id", id).single(),
      supabase
        .from("collections")
        .select("id, collection_date, total_amount, status")
        .eq("restaurant_id", id),
      supabase
        .from("payments")
        .select("id, payment_date, amount, payment_mode, reference_number")
        .eq("restaurant_id", id),
    ])

  if (error || !restaurant) notFound()

  // Merge both ledgers into one reverse-chronological timeline.
  const transactions = [
    ...(collections ?? []).map((col) => ({
      id: col.id,
      type: "collection" as const,
      date: col.collection_date,
      amount: col.total_amount,
      status: col.status,
    })),
    ...(payments ?? []).map((pay) => ({
      id: pay.id,
      type: "payment" as const,
      date: pay.payment_date,
      amount: pay.amount,
      reference: `${pay.payment_mode}${pay.reference_number ? ` (${pay.reference_number})` : ""}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return <RestaurantProfile restaurant={restaurant} transactions={transactions} />
}