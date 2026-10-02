"use client"

import { AppLayout } from "@/components/layout/AppLayout"
import { useAppStore, type User } from "@/store"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { canAccessRoute, Role } from "@/lib/auth-guards"

export function AppGuard({ children, user }: { children: React.ReactNode, user: User | null }) {
  const setUser = useAppStore((state) => state.setUser)
  const setInitialized = useAppStore((state) => state.setInitialized)
  const router = useRouter()
  const pathname = usePathname()

  // Hydrate store on first render (or when user changes)
  useEffect(() => {
    setUser(user)
    setInitialized(true)
  }, [user, setUser, setInitialized])

  // Route protection
  useEffect(() => {
    if (user && !canAccessRoute(user.role as Role, pathname)) {
      router.push("/dashboard")
    }
  }, [pathname, user, router])

  if (user && !canAccessRoute(user.role as Role, pathname)) {
    return null
  }

  return <AppLayout>{children}</AppLayout>
}
