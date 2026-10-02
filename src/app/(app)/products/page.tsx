import { api } from "@/lib/api"
import Link from "next/link"
import { Plus } from "lucide-react"
import ProductsClient from "./ProductsClient"

export const revalidate = 30 // ISR: revalidate every 30 seconds

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const params = await searchParams
  const search = params.search || ""
  const status = params.status || "all"
  const page = parseInt(params.page || "1") || 1

  const { data: products, total } = await api.products(page, search, status)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product Catalog</h1>
          <p className="text-sm text-slate-500">Manage items, GST rates, and prices.</p>
        </div>
        <Link
          href="/products/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Link>
      </div>

      <ProductsClient 
        products={products || []} 
        totalCount={total}
        currentPage={page}
        pageSize={15}
      />
    </div>
  )
}
