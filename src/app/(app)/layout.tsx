import { AppGuard } from "@/components/layout/AppGuard"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { resolveAccess } from "@/lib/session-claims"

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect("/login")
  }

  // Postgres is authoritative for company and role; this also pushes those claims
  // onto the Clerk user so the next request's JWT carries them for RLS.
  const access = await resolveAccess(userId)

  // Signed in but no profile yet: send them through onboarding. This used to
  // redirect to /login?error=missing_company, which bounced back to the same dead
  // end because no code path ever created a company.
  if (!access) {
    redirect("/onboarding")
  }

  // Access was revoked from Settings → Users. Show that plainly rather than
  // letting the user browse pages whose queries RLS will reject.
  if (!access.is_active) {
    redirect("/access-revoked")
  }

  return (
    <AppGuard
      user={{
        id: userId,
        role: access.role,
        company_id: access.company_id,
        name: access.name,
      }}
    >
      {children}
    </AppGuard>
  )
}