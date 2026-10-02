"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { Restaurant } from "@/lib/api"
import Link from "next/link"
import { Edit2, Trash2, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react"
import { supabase } from "@/lib/supabase"

export default function RestaurantsClient({ 
  restaurants, 
  totalCount,
  currentPage,
  pageSize 
}: { 
  restaurants: Restaurant[]
  totalCount: number
  currentPage: number
  pageSize: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentSearch = searchParams.get("search") || ""
  const currentStatus = searchParams.get("status") || "all"

  const [searchQuery, setSearchQuery] = useState(currentSearch)

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value === null) {
        newSearchParams.delete(key)
      } else {
        newSearchParams.set(key, value)
      }
    }
    return newSearchParams.toString()
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ search: searchQuery || null, page: "1" })}`)
    })
  }

  const handleStatusChange = (status: string) => {
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ status: status === "all" ? null : status, page: "1" })}`)
    })
  }

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ page: newPage.toString() })}`)
    })
  }

  const handleDelete = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Remove ${name} from your active list?\n\n` +
          `Their invoices, collections and payments are kept for your records, ` +
          `but they will no longer appear in lists or be selectable for new ` +
          `deliveries. This can be undone.`,
      )
    ) {
      return
    }

    // delete_restaurant(), not DELETE. A hard delete destroys invoices and
    // payments that reference the row, and has no deleted_at to fall back on --
    // it just fails on the foreign key, which is what this used to do. The RPC
    // soft-deletes and refuses while a balance is still outstanding.
    const { error } = await supabase.rpc('delete_restaurant', {
      p_restaurant_id: id,
    })

    if (error) {
      // The RPC names the outstanding amount when that is the reason, so the
      // message is already actionable -- show it rather than a generic failure.
      alert(error.message)
    } else {
      router.refresh()
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <>
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <form onSubmit={handleSearch} className="relative flex-1 w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Search by name, contact, or phone... (Press Enter)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400 hidden sm:block" />
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden relative">
        {isPending && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        )}
        
        {restaurants.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No restaurants match your search filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name & Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {restaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">{restaurant.name}</div>
                      <div className="text-sm text-slate-500">
                        {[restaurant.contact_person, restaurant.phone].filter(Boolean).join(" • ") || "No contact on file"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900 max-w-xs truncate" title={restaurant.address ?? ""}>
                        {restaurant.address || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        restaurant.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {restaurant.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-3">
                        <Link href={`/restaurants/${restaurant.id}/edit`} className="text-blue-600 hover:text-blue-900">
                          <Edit2 className="h-4 w-4" />
                        </Link>
                        <button 
                          onClick={() => handleDelete(restaurant.id, restaurant.name)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-700">
                Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
                <span className="font-medium">{totalCount}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-slate-300">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
