"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  Truck, 
  Receipt, 
  CreditCard,
  BarChart3,
  Settings,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store"
import { canAccessRoute, Role } from "@/lib/auth-guards"
import { UserButton } from "@clerk/nextjs"

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Restaurants", href: "/restaurants", icon: Store },
  { title: "Catalog", href: "/products", icon: Package },
  { title: "Inventory", href: "/inventory", icon: Package },
  { title: "Collections", href: "/collections", icon: Truck },
  { title: "Billing", href: "/billing", icon: Receipt },
  { title: "Payments", href: "/payments", icon: CreditCard },
  { title: "Outstanding", href: "/outstanding", icon: AlertCircle },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const user = useAppStore((state) => state.user)

  // Memoize so we don't recompute on every pathname change
  const visibleNavItems = useMemo(() =>
    navItems.filter(item =>
      user ? canAccessRoute(user.role as Role, item.href) : false
    ),
    [user]
  )

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen border-r border-slate-800">
      <div className="h-16 flex items-center px-6 font-bold text-xl tracking-tight border-b border-slate-800">
        VASUDHA OS
      </div>
      
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {visibleNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-blue-600 text-white" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.title}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-800 flex items-center justify-between px-6">
        <div className="text-xs text-slate-500">
          {user?.name} ({user?.role})
        </div>
        <UserButton />
      </div>
    </aside>
  )
}
