import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { Building2 } from "lucide-react"
import OnboardingForm from "./OnboardingForm"

export const metadata = {
  title: "Set up your company — VASUDHA OS",
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { userId } = await auth()

  // Clerk guards this route; being signed out means starting at the login page.
  if (!userId) {
    redirect("/login")
  }

  const { error } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 p-3 w-14 h-14 flex items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set up your company</h1>
          <p className="mt-2 text-sm text-slate-600">
            This becomes the tenant boundary for everything you record. It appears
            on every invoice and report.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {decodeURIComponent(error)}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8">
          <OnboardingForm />
        </div>
      </div>
    </main>
  )
}