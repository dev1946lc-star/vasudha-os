import { Suspense } from "react"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { api } from "@/lib/api"
import { canAccessRoute } from "@/lib/auth-guards"
import { resolveAccess } from "@/lib/session-claims"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { OutstandingSummary } from "@/components/dashboard/OutstandingSummary"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Truck, IndianRupee, AlertTriangle } from "lucide-react"

export const revalidate = 30

// ─── KPI cards via Rust API only ──────────────────────────────────
async function KPICards({ canSeeDebt }: { canSeeDebt: boolean }) {
  let dashboard: Awaited<ReturnType<typeof api.dashboard>>
  try {
    dashboard = await api.dashboard()
  } catch (e) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700">
        <p className="font-semibold">Could not reach the VASUDHA API.</p>
        <p className="text-sm mt-1">
          {(e as Error).message} — start the backend with{" "}
          <code className="font-mono">cargo run --manifest-path backend/Cargo.toml</code> and
          confirm <code className="font-mono">RUST_API_URL</code> is reachable.
        </p>
      </div>
    )
  }

  const data = dashboard

  const outstanding = canSeeDebt ? await api.outstanding().catch(() => null) : null

  // Sum the per-restaurant aging buckets into four totals for the donut.
  const buckets = (outstanding?.rows ?? []).reduce(
    (acc, row) => ({
      bucket15: acc.bucket15 + row.bucket_0_15,
      bucket30: acc.bucket30 + row.bucket_15_30,
      bucket60: acc.bucket60 + row.bucket_30_60,
      bucket60Plus: acc.bucket60Plus + row.bucket_60_plus,
    }),
    { bucket15: 0, bucket30: 0, bucket60: 0, bucket60Plus: 0 }
  )

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Revenue</CardTitle>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">₹{data.kpis.today_revenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Collected today so far.</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Route</CardTitle>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Truck className="h-5 w-5" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.kpis.total_stops - data.kpis.completed_stops}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.kpis.completed_stops} / {data.kpis.total_stops} completed.</p>
          </CardContent>
        </Card>

        {canSeeDebt && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Market Debt</CardTitle>
              <div className="p-2 bg-red-50 rounded-lg text-red-600"><IndianRupee className="h-5 w-5" /></div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">₹{data.kpis.market_debt.toFixed(2)}</p>
              <Link href="/outstanding" className="text-xs font-bold text-red-600 hover:text-red-800 mt-1 block">
                View aging report →
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Stock Alerts</CardTitle>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><AlertTriangle className="h-5 w-5" /></div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{data.kpis.low_stock_count}</p>
            <Link href="/inventory" className="text-xs font-bold text-amber-600 hover:text-amber-800 mt-1 block">
              {data.kpis.low_stock_count > 0 ? "Review inventory immediately." : "Inventory levels healthy."}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[420px]">
        <RevenueChart data7={data.trend_7} data30={data.trend_30} />
        {canSeeDebt ? (
          <div className="col-span-1 h-full">
            <OutstandingSummary
              total={data.kpis.market_debt}
              bucket15={buckets.bucket15}
              bucket30={buckets.bucket30}
              bucket60={buckets.bucket60}
              bucket60Plus={buckets.bucket60Plus}
            />
          </div>
        ) : (
          // Field agents have no reason to see market debt, and /outstanding is
          // closed to them, so the card would link nowhere.
          <div className="col-span-1 h-full" />
        )}
      </div>
    </>
  )
}

export default async function DashboardPage() {
  const role = (await resolveAccess((await auth()).userId ?? ""))?.role ?? "agent"

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2 mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      <Suspense fallback={<KPISkeleton />}>
        <KPICards canSeeDebt={canAccessRoute(role, "/outstanding")} />
      </Suspense>
    </div>
  )
}

function KPISkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[420px]">
        <Skeleton className="col-span-3 h-full rounded-xl" />
        <Skeleton className="col-span-1 h-full rounded-xl" />
      </div>
    </div>
  )
}
