"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Save } from "lucide-react"

export default function TaxSettingsForm({ initialRate }: { initialRate: number }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    const formData = new FormData(e.currentTarget)
    const rate = Number(formData.get('default_gst_rate'))
    
    const { error: rpcError } = await supabase.rpc('update_tax_settings', {
      p_default_gst_rate: rate
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setSuccess(true)
    }
    
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
          Tax settings updated successfully. This default rate will apply to all new products.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Default Global GST Rate (%)</label>
        <select 
          name="default_gst_rate" 
          defaultValue={initialRate}
          className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="0">0% - Exempted</option>
          <option value="5">5% - Standard Oil Rate</option>
          <option value="12">12% - Standard Rate</option>
          <option value="18">18% - Standard Rate</option>
          <option value="28">28% - Luxury Rate</option>
        </select>
        <p className="text-xs text-slate-500 mt-2">
          This slab will be automatically pre-filled when you create new products in your catalog. Changing this will not retroactively affect existing products or past invoices.
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : (
            <Save className="h-5 w-5" />
          )}
          Save Settings
        </button>
      </div>
    </form>
  )
}
