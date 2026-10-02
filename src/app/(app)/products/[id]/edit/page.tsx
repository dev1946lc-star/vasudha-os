import { createClient } from "@/lib/supabase/server"
import EditProductClient from "./EditProductClient"

export const revalidate = 0

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Fetch server-side so the Clerk JWT is attached and RLS can scope the row.
  const supabase = await createClient()

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single()

  return <EditProductClient id={id} product={product} loadError={error?.message ?? null} />
}