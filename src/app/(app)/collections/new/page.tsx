"use client"

import { useEffect, useState, Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { CollectionForm } from "@/components/collections/CollectionForm"
import { CollectionFormValues } from "@/lib/validations/collection"
import { useRouter, useSearchParams } from "next/navigation"

type RestaurantOption = {
  id: string
  name: string
}

type ProductOption = {
  id: string
  name: string
  price: number
}

function CollectionFormWrapper() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultRestaurantId = searchParams.get('restaurant_id') || undefined

  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      
      const [restRes, prodRes] = await Promise.all([
        supabase.from('restaurants').select('id, name').eq('is_active', true).order('name'),
        supabase.from('products').select('id, name, price').eq('is_active', true).order('name')
      ])

      if (restRes.error || prodRes.error) {
        setError("Failed to load prerequisite data.")
      } else {
        setRestaurants(restRes.data || [])
        setProducts(prodRes.data || [])
      }
      
      setLoading(false)
    }

    fetchData()
  }, [])

  const handleSubmit = async (data: CollectionFormValues) => {
    // We pass the JSON array of items securely to the Postgres RPC
    const { error: rpcError } = await supabase.rpc('record_collection', {
      p_restaurant_id: data.restaurant_id,
      p_notes: data.notes || "",
      p_items: data.items
    })

    if (rpcError) {
      throw rpcError
    }

    router.push("/collections")
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading form...</div>
  }

  if (error || restaurants.length === 0 || products.length === 0) {
    return (
      <div className="p-8 text-center text-red-500">
        {error || "Please ensure you have at least one active restaurant and one active product in the catalog before recording collections."}
      </div>
    )
  }

  return (
    <CollectionForm 
      restaurants={restaurants} 
      products={products} 
      defaultRestaurantId={defaultRestaurantId}
      onSubmit={handleSubmit} 
    />
  )
}

export default function NewCollectionPage() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900">Record Collection</h1>
        <p className="text-sm text-slate-500">Log waste materials collected from a restaurant.</p>
      </div>

      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading components...</div>}>
        <CollectionFormWrapper />
      </Suspense>
    </div>
  )
}
