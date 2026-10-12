import { api } from "@/lib/api"
import { TodayRouteResponse } from "@/lib/api"
import { auth } from "@clerk/nextjs/server"
import { resolveAccess } from "@/lib/session-claims"
import { createClient } from "@/lib/supabase/server"
import CollectionsClient, { Collection } from "./CollectionsClient"

export const revalidate = 0 // Always fresh — this is a live daily route

export default async function DailyCollectionsPage() {
  const { userId } = await auth()
  const access = await resolveAccess(userId ?? "")
  const role = access?.role ?? "agent"

  let routeData: TodayRouteResponse

  try {
    routeData = await api.collectionsToday()
  } catch (e) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load route: {(e as Error).message}
        </div>
      </div>
    )
  }

  // Transform Rust API stops into the format CollectionsClient expects
  const restaurantsData = routeData.stops.map((stop) => ({
    id: stop.restaurant_id,
    name: stop.name,
    address: stop.address || null,
    contact_person: stop.contact_person || null,
    phone: stop.phone || null,
  }))

  // Enrich today's collections with fields from Supabase (not_available_reason, verified_at, agent_id)
  const supabase = await createClient()
  const today = new Date().toISOString().split("T")[0]
  const { data: dbCollections } = await supabase
    .from("collections")
    .select("id, restaurant_id, status, total_amount, not_available_reason, verified_at, agent_id")
    .eq("collection_date", today)

  const collectionsData: Collection[] = (dbCollections || []).length > 0
    ? (dbCollections as Collection[])
    : routeData.stops
        .filter((stop) => stop.collection_id !== null)
        .map((stop) => ({
          id: stop.collection_id!,
          restaurant_id: stop.restaurant_id,
          status: stop.status,
          total_amount: stop.total_amount,
        }))

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today&apos;s Route</h1>
          <p className="text-sm text-slate-500">Live tracker for daily collections.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{routeData.completed}</span>
          of <span className="font-medium text-slate-900">{routeData.total}</span> stops
          <span className="font-medium text-blue-600">{routeData.progress_percent}%</span>
        </div>
      </div>

      <CollectionsClient
        initialRestaurants={restaurantsData}
        initialCollections={collectionsData}
        initialCredit={[]}
        currentUserId={userId ?? undefined}
        currentUserRole={role}
      />
    </div>
  )
}
