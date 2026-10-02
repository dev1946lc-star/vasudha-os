import { api } from "@/lib/api"
import Link from "next/link"
import { Plus } from "lucide-react"
import RestaurantsClient from "./RestaurantsClient"

export const revalidate = 30

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const params = await searchParams
  const search = params.search || ""
  const status = params.status || "all"
  const page = Math.max(1, parseInt(params.page || "1") || 1)

  let restaurants: Awaited<ReturnType<typeof api.restaurants>> | null = null
  let error: string | null = null

  try {
    restaurants = await api.restaurants(page, search, status)
  } catch (e) {
    error = (e as Error).message
  }

  // The Rust API owns the page size — read it back instead of assuming.
  const pageSize = restaurants?.page_size ?? 25

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Restaurants</h1>
          <p className="text-sm text-slate-500">Manage all registered collection points.</p>
        </div>
        <Link
          href="/restaurants/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Restaurant
        </Link>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load restaurants: {error}
        </div>
      ) : (
        <RestaurantsClient
          restaurants={restaurants?.data ?? []}
          totalCount={restaurants?.total ?? 0}
          currentPage={page}
          pageSize={pageSize}
        />
      )}
    </div>
  )
}