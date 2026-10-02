"use client"

import { ProductForm } from "@/components/products/ProductForm"
import type { ProductFormValues } from "@/lib/validations/product"
import type { Database } from "@/types/supabase"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type ProductRow = Database["public"]["Tables"]["products"]["Row"]

export default function EditProductClient({
  id,
  product,
  loadError,
}: {
  id: string
  product: ProductRow | null
  loadError: string | null
}) {
  const router = useRouter()

  const handleSubmit = async (data: ProductFormValues) => {
    const { error } = await supabase.from("products").update(data).eq("id", id)
    if (error) throw error

    router.push("/products")
    router.refresh()
  }

  if (!product) {
    return (
      <div className="p-8 text-red-500">
        {loadError
          ? `Product not found: ${loadError}`
          : "Product not found or you don't have permission to edit it."}
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
        <p className="text-sm text-slate-500">Update {product.name}&apos;s details.</p>
      </div>

      {/* `description` / `hsn_code` are nullable in the schema but the form's
          `initialData` contract is non-nullable, so the row is handed over as-is. */}
      <ProductForm
        initialData={product as unknown as ProductFormValues}
        onSubmit={handleSubmit}
      />
    </div>
  )
}