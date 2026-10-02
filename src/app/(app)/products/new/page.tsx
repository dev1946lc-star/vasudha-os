import { createClient } from "@/lib/supabase/server"
import NewProductClient from "./NewProductClient"

export const revalidate = 0

export default async function NewProductPage() {
  // Read the company's default GST slab server-side. Doing this client-side in
  // an effect left `loading` stuck at true whenever the store had not hydrated
  // a company_id yet, so the page hung on "Loading configuration..." forever.
  const supabase = await createClient()

  const { data: company, error } = await supabase
    .from("companies")
    .select("default_gst_rate")
    .limit(1)
    .single()

  return (
    <NewProductClient
      defaultGstRate={Number(company?.default_gst_rate ?? 5.0)}
      loadError={error?.message ?? null}
    />
  )
}