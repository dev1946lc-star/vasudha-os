import { createClient } from "@/lib/supabase/server"
import { Users } from "lucide-react"
import UserListClient from "@/components/settings/UserListClient"

export const revalidate = 0

export default async function UserManagementPage() {
  // Must be the SSR client: this is a Server Component, and RLS resolves the
  // tenant from the Clerk JWT that only the server client attaches.
  const supabase = await createClient()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <p className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Could not load staff directory: {error.message}
        </p>
      </div>
    )
  }

  const users = profiles ?? []

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-indigo-600" />
          Staff Directory & Access Control
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage your team members, assign roles, and revoke access instantly.</p>
      </div>

      <UserListClient initialUsers={users} />
    </div>
  )
}
