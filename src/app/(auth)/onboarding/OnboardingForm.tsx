"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { createCompanyAndProfile } from "@/app/actions/onboarding"

export default function OnboardingForm() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    const form = new FormData(e.currentTarget)

    try {
      const result = await createCompanyAndProfile({
        companyName: String(form.get("companyName") ?? ""),
        gstNumber: String(form.get("gstNumber") ?? ""),
        address: String(form.get("address") ?? ""),
        ownerName: String(form.get("ownerName") ?? ""),
      })

      if (!result.ok) {
        setError(result.error)
        setSubmitting(false)
        return
      }

      // The layout now finds a profile, so the app route resolves.
      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("Could not set up your company. Please try again.")
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">
          Company name <span className="text-red-500">*</span>
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          maxLength={120}
          placeholder="Karnataka Bio-Fuels Pvt Ltd"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="ownerName" className="block text-sm font-medium text-slate-700 mb-1">
          Your name <span className="text-red-500">*</span>
        </label>
        <input
          id="ownerName"
          name="ownerName"
          required
          maxLength={120}
          placeholder="Anish"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown on invoices and receipts as the point of contact.
        </p>
      </div>

      <div>
        <label htmlFor="gstNumber" className="block text-sm font-medium text-slate-700 mb-1">
          GSTIN <span className="text-slate-400">(optional)</span>
        </label>
        <input
          id="gstNumber"
          name="gstNumber"
          placeholder="29ABCDE1234F1Z5"
          className={`${inputClass} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-1">
          Registered address <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="address"
          name="address"
          rows={2}
          placeholder="14 Industrial Suburb, Yeshwanthpur, Bengaluru 560022"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {submitting ? "Setting up…" : "Create company"}
        {!submitting && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  )
}