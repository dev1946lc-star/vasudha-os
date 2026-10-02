"use client"

import { useRouter } from "next/navigation"
import { ProductForm } from "@/components/products/ProductForm"
import type { ProductFormValues } from "@/lib/validations/product"
import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/store"

export default function NewProductClient({
  defaultGstRate,
  loadError,
}: {
  defaultGstRate: number
  loadError: string | null
}) {
  const router = useRouter()
  const companyId = useAppStore((state) => state.user?.company_id)

  const handleSubmit = async (data: ProductFormValues) => {
    if (!companyId) {
      throw new Error("Missing company profile — sign out and back in.")
    }

    const { error: insertError } = await supabase
      .from("products")
      .insert({ ...data, company_id: companyId })

    if (insertError) throw insertError

    router.push("/products")
    router.refresh()
  }

  if (!companyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <p className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          No company is associated with your account, so a product cannot be filed
          against a tenant. Ask an owner to set your company, then sign in again.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Add New Product</h1>
        <p className="text-sm text-slate-500">Add a new item to your product catalog.</p>
      </div>

      {loadError && (
        <p className="mb-4 p-4 bg-amber-50 text-amber-800 rounded-md text-sm">
          Could not read your company&apos;s default GST rate, so {defaultGstRate}% was
          applied instead: {loadError}
        </p>
      )}

      <ProductForm
        onSubmit={handleSubmit}
        initialData={{
          name: "",
          description: "",
          hsn_code: "",
          price: 0,
          gst_rate: defaultGstRate,
          min_stock_level: 0,
          is_active: true,
        }}
      />
    </div>
  )
}