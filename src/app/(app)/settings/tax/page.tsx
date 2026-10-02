import { createClient } from "@/lib/supabase/server"
import TaxSettingsForm from "@/components/settings/TaxSettingsForm"
import { Calculator } from "lucide-react"

export const revalidate = 0

export default async function TaxSettingsPage() {
  // Must be the SSR client: this is a Server Component, and RLS resolves the
  // tenant from the Clerk JWT that only the server client attaches.
  const supabase = await createClient()

  const { data: companies, error } = await supabase.from('companies').select('*').limit(1)
  const company = companies?.[0]

  if (error || !company) {
    return (
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <p className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          {error ? `Could not load tax settings: ${error.message}` : "No company profile found."}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="h-6 w-6 text-purple-600" />
          Tax Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage standard GST slabs for your catalog. This ensures compliance when raising new invoices.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <TaxSettingsForm initialRate={Number(company.default_gst_rate || 5.0)} />
      </div>
    </div>
  )
}
