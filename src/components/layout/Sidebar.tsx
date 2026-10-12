"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { 
  LayoutDashboard, 
  Store, 
  Tag, 
  Boxes, 
  Truck, 
  Receipt, 
  CreditCard,
  BarChart3,
  Settings,
  AlertCircle,
  Droplets
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store"
import { canAccessRoute, Role } from "@/lib/auth-guards"
import { UserButton } from "@clerk/nextjs"

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Restaurants", href: "/restaurants", icon: Store },
  { title: "Catalog", href: "/products", icon: Tag },
  { title: "Inventory", href: "/inventory", icon: Boxes },
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
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen border-r border-slate-800/90 shadow-xl shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
            <Droplets className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-[15px] tracking-wider bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              VASUDHA OS
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight">Distribution & ERP</span>
          </div>
        </Link>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
          v1.0
        </span>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Operations
        </div>
        <ul className="space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                    isActive 
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-white/10" 
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white hover:translate-x-0.5"
                  )}
                >
                  <item.icon className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                  )} />
                  <span className="truncate">{item.title}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User Footer Card */}
      <div className="p-3 m-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3 shadow-inner">
        <div className="shrink-0 flex items-center justify-center">
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-8 w-8 ring-2 ring-blue-500/30 rounded-full",
              },
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate leading-tight">
            {user?.name || "Operations User"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {user?.role || "Staff"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
