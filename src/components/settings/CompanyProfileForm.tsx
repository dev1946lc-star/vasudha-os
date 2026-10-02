"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Save } from "lucide-react"

type Company = {
  name: string
  address: string
  gst_number: string
  logo_url: string
}

export default function CompanyProfileForm({ initialData }: { initialData: Company }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    const formData = new FormData(e.currentTarget)

    // Signature per supabase/migrations/19_company_metadata.sql:
    //   update_company_profile(p_name, p_address, p_gst_number, p_logo_url)
    const { error: rpcError } = await supabase.rpc('update_company_profile', {
      p_name: (formData.get('name') as string) ?? '',
      p_address: (formData.get('address') as string) ?? '',
      p_gst_number: (formData.get('gst_number') as string) ?? '',
      p_logo_url: (formData.get('logo_url') as string) ?? '',
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setSuccess(true)
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
          Company profile updated successfully. The new details will appear on all future PDFs.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
          <input 
            type="text" 
            name="name" 
            defaultValue={initialData?.name}
            required
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN Number</label>
          <input 
            type="text" 
            name="gst_number" 
            defaultValue={initialData?.gst_number || ''}
            placeholder="e.g. 29ABCDE1234F1Z5"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Registered Address</label>
          <textarea 
            name="address" 
            defaultValue={initialData?.address || ''}
            rows={3}
            required
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL (Optional)</label>
          <input 
            type="url" 
            name="logo_url" 
            defaultValue={initialData?.logo_url || ''}
            placeholder="https://example.com/logo.png"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">Provide a direct link to an image. This will be embedded in invoices and receipts.</p>
        </div>
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
          Save Profile
        </button>
      </div>
    </form>
  )
}
