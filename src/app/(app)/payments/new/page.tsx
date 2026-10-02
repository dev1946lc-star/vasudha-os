import { PaymentForm } from "@/components/payments/PaymentForm"
import { createClient } from "@/lib/supabase/server"
import { CreditCard } from "lucide-react"

// Reads ?restaurant_id= from /outstanding's "Record Payment" links. That link
// existed but this page never read the param, so it always opened on an empty
// form and the user had to re-pick the restaurant.
type SearchParams = Promise<{ restaurant_id?: string }>

export default async function NewPaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { restaurant_id } = await searchParams

  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('is_active', true)
    // Soft-deleted restaurants must not be selectable for new payments. is_active
    // is a separate, deliberate flag: a restaurant can be temporarily paused and
    // still keep its history.
    .is('deleted_at', null)
    .order('name', { ascending: true })

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-blue-600" />
          Record Payment
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Record a payment received from a restaurant. Leave the invoice on auto to settle the
          oldest open bills first; anything left over is held as credit on their account.
        </p>
      </div>

      <PaymentForm
        restaurants={restaurants || []}
        defaultRestaurantId={restaurant_id}
      />
    </div>
  )
}