import { PaymentForm } from "@/components/payments/PaymentForm"
import { createClient } from "@/lib/supabase/server"
import { CreditCard } from "lucide-react"

export default async function NewPaymentPage() {
  const supabase = await createClient()
  
  // Note: Your schema uses is_active boolean, but the original code filtered by status='active'
  // I will check for is_active = true based on the initial schema we saw.
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-blue-600" />
          Record Payment
        </h1>
        <p className="text-sm text-slate-500 mt-1">Record a payment received from a restaurant against a specific invoice.</p>
      </div>

      <PaymentForm 
        restaurants={restaurants || []}
      />
    </div>
  )
}
