"use client"

import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { Sidebar } from "./Sidebar"
import { 
  Search, 
  Calendar, 
  ChevronRight,
  ShieldCheck,
  Command
} from "lucide-react"

const ROUTE_META: Record<string, { section: string; title: string; subtitle: string }> = {
  "/dashboard": { section: "Operations", title: "Executive Cockpit", subtitle: "Real-time metrics, routes & KPI telemetry" },
  "/restaurants": { section: "Accounts", title: "Restaurant Directory", subtitle: "Active client establishments, credit limits & KYC" },
  "/products": { section: "Catalog", title: "Product Catalog & Pricing", subtitle: "SKUs, HSN codes, unit pricing & GST tax slabs" },
  "/inventory": { section: "Warehouse", title: "Inventory & Stock Levels", subtitle: "Real-time stock balance, low-stock alerts & batch tracking" },
  "/collections": { section: "Dispatch", title: "Daily Delivery & Collections", subtitle: "Route dispatches, returns, driver cash & settlements" },
  "/billing": { section: "Finance", title: "Invoices & Billing", subtitle: "B2B GST compliant invoice generation & record keeping" },
  "/payments": { section: "Finance", title: "Payment Ledger & Settlements", subtitle: "FIFO invoice clearing, cash receipts & UPI tracking" },
  "/outstanding": { section: "Risk & Credit", title: "Aging & Receivables", subtitle: "Credit risk analysis across 15, 30, 60+ day aging buckets" },
  "/reports": { section: "Analytics", title: "Compliance & Audit Reports", subtitle: "Automated GSTR-1, GSTR-3B & stock wastage calculations" },
  "/settings": { section: "Configuration", title: "System Settings", subtitle: "Company metadata, team permissions & system integrations" },
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Match the deepest route prefix
  const currentMeta = useMemo(() => {
    const matchingKey = Object.keys(ROUTE_META).find(key => 
      pathname === key || pathname.startsWith(key + "/")
    )
    return matchingKey 
      ? ROUTE_META[matchingKey] 
      : { section: "Operations", title: "Operations Console", subtitle: "Enterprise Distribution System" }
  }, [pathname])

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date())
  }, [])

  return (
    <div className="flex h-screen bg-slate-950/5 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* Top Header Cockpit */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-xs">
          {/* Breadcrumb & Context */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>{currentMeta.section}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-900 font-bold">{currentMeta.title}</span>
            </div>
          </div>

          {/* Quick Actions & Live Telemetry Badge */}
          <div className="flex items-center gap-3">
            {/* Quick search badge */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 border border-slate-200 text-xs text-slate-500 hover:border-slate-300 transition-colors cursor-pointer">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Search accounts, invoices, SKUs...</span>
              <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-500 bg-white rounded border border-slate-200 shadow-2xs">
                <Command className="h-2.5 w-2.5" /> K
              </kbd>
            </div>

            {/* Date Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200/60">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>{formattedDate}</span>
            </div>

            {/* Operational Engine Live Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs font-semibold shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">Engine Live</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 hidden sm:inline" />
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

