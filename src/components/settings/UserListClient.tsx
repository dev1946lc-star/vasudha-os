"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAppStore } from "@/store"
import { errorMessage } from "@/components/error-message"
import { Ban, CheckCircle2, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react"
import { addStaffUser } from "@/app/actions/user"

type Profile = {
  id: string
  company_id: string
  role: string
  name: string
  is_active: boolean
  created_at: string
}

export default function UserListClient({ initialUsers }: { initialUsers: Profile[] }) {
  const router = useRouter()
  const [users, setUsers] = useState<Profile[]>(initialUsers)
  const [isAdding, setIsAdding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  
  const currentUser = useAppStore((state) => state.user)

  const handleRevokeAccess = async (userId: string, currentStatus: boolean, role: string) => {
    if (userId === currentUser?.id) {
      alert("You cannot revoke your own access.")
      return
    }

    const newStatus = !currentStatus
    const newRole = newStatus ? (role === 'revoked' ? 'agent' : role) : 'revoked'

    const { error } = await supabase.rpc('update_user_status', {
      p_user_id: userId,
      p_is_active: newStatus,
      p_role: newRole
    })

    if (!error) {
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: newStatus, role: newRole } : u))
    } else {
      alert("Failed to update user status: " + error.message)
    }
  }

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    const formData = new FormData(e.currentTarget)

    try {
      const result = await addStaffUser({
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        role: String(formData.get("role") ?? "agent") as "agent" | "accountant" | "manager",
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      // The action already revalidated, so pull the authoritative list rather than
      // guessing the created_at timestamp locally.
      setIsAdding(false)
      setSuccess(`${formData.get("name")} was added. They can sign in with ${formData.get("email")} and set a password when invited.`)
      router.refresh()
    } catch (err) {
      setError(errorMessage(err, "Failed to create user."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Header Actions */}
      <div className="flex justify-end">
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm transition-colors"
        >
          <UserPlus className="h-4 w-4" /> {isAdding ? "Cancel" : "Add New Staff"}
        </button>
      </div>

      {/* Add User Form */}
      {isAdding && (
        <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm mb-6">
          <h3 className="font-bold text-slate-900 mb-1">Register New Staff Member</h3>
          <p className="text-xs text-slate-500 mb-4">
            Creates a Clerk account for them. They receive an invitation to set
            their own password — VASUDHA never stores or handles it.
          </p>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input type="text" name="name" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ramesh Kumar" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input type="email" name="email" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="ramesh@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              <select name="role" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="agent">Agent (Field Worker)</option>
                <option value="accountant">Accountant</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div>
              <button type="submit" disabled={loading} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-sm font-medium">
          {success}
        </div>
      )}

      {/* Users List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isMe = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-50 bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        {u.name} {isMe && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">You</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="capitalize text-slate-700 font-medium">{u.role}</span>
                    </td>
                    <td className="px-6 py-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <Ban className="h-3.5 w-3.5" /> Access Revoked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isMe && (
                        <button
                          onClick={() => handleRevokeAccess(u.id, u.is_active, u.role)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            u.is_active 
                              ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                              : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {u.is_active ? (
                            <><ShieldAlert className="h-4 w-4" /> Revoke Access</>
                          ) : (
                            <><ShieldCheck className="h-4 w-4" /> Restore Access</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
