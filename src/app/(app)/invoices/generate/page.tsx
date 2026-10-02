import { createClient } from "@/lib/supabase/server"
import BulkInvoicingClient, { type BulkCollection } from "./BulkInvoicingClient"

export const revalidate = 0

export default async function BulkInvoicingPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('collections')
    .select('id, restaurant_id, collection_date, total_amount, status, restaurants(id, name)')
    .eq('status', 'verified')
    .is('invoice_id', null)
    .order('collection_date', { ascending: true })

  const collections = (data ?? []) as unknown as BulkCollection[]

  return (
    <BulkInvoicingClient
      initialCollections={collections}
      initialError={error?.message ?? null}
    />
  )
}