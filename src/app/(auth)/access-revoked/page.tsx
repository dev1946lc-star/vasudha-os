import { SignOutButton } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { ShieldOff } from "lucide-react"

export const metadata = {
  title: "Access revoked — VASUDHA OS",
}

export default async function AccessRevokedPage() {
  // This route is exempt from the proxy guard so a revoked user can reach it, so
  // the page has to enforce authentication itself.
  const { userId } = await auth()

  if (!userId) {
    redirect("/login")
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 p-4 w-14 h-14 flex items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldOff className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Your access has been revoked</h1>

        <p className="mt-3 text-sm text-slate-600">
          An owner of your company has removed your access. Your previous work is
          intact — reactivate your account from Settings → Users to continue.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <SignOutButton>
            <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
              Sign in with another account
            </button>
          </SignOutButton>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          If you believe this is a mistake, contact your company owner.
        </p>
      </div>
    </main>
  )
}