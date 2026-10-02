/**
 * Rust API Client
 *
 * Calls the Vasudha Rust/Axum backend for ALL data fetching.
 * No Supabase fallback — the Rust API is the single source of truth.
 *
 * Set in .env:
 *   RUST_API_URL=http://localhost:3001
 *   RUST_API_SECRET=<same value as backend/.env's API_SECRET>
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { resolveAccess } from '@/lib/session-claims'

const RUST_API_URL = process.env.RUST_API_URL || 'http://localhost:3001'
const RUST_API_SECRET = process.env.RUST_API_SECRET || ''

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export type DashboardKpis = {
  today_revenue: number
  total_stops: number
  completed_stops: number
  market_debt: number
  low_stock_count: number
}

export type TrendPoint = {
  payment_date: string
  total_revenue: number
}

export type DashboardData = {
  kpis: DashboardKpis
  trend_7: TrendPoint[]
  trend_30: TrendPoint[]
}

export type Restaurant = {
  id: string
  name: string
  address?: string
  contact_person?: string
  phone?: string
  is_active: boolean
  credit_limit: number
  payment_terms_days: number
}

export type RestaurantsResponse = {
  data: Restaurant[]
  total: number
  page: number
  page_size: number
}

export type RouteStop = {
  restaurant_id: string
  name: string
  address?: string
  contact_person?: string
  phone?: string
  collection_id?: string
  status: string
  total_amount: number
}

export type TodayRouteResponse = {
  stops: RouteStop[]
  total: number
  completed: number
  progress_percent: number
}

export type InventoryItem = {
  id: string
  product_id: string
  product_name: string
  hsn_code?: string
  quantity: number
  min_stock_level: number
  is_low_stock: boolean
  last_updated: string
}

export type Payment = {
  id: string
  restaurant_name: string
  payment_mode?: string
  payment_date: string
  reference_number?: string
  amount: number
}

export type PaymentsResponse = {
  data: Payment[]
  total: number
  page: number
  page_size: number
}

export type Invoice = {
  id: string
  invoice_number: string
  restaurant_name: string
  invoice_date: string
  status: string
  total_amount: number
}

export type InvoicesResponse = {
  data: Invoice[]
  total: number
  page: number
  page_size: number
}

export type OutstandingRow = {
  restaurant_id: string
  restaurant_name: string
  phone?: string
  unpaid_invoice_count: number
  /** Invoiced but not yet due. Distinct from the overdue buckets below. */
  bucket_current: number
  bucket_0_15: number
  bucket_15_30: number
  bucket_30_60: number
  bucket_60_plus: number
  total_outstanding: number
}

export type OutstandingResponse = {
  rows: OutstandingRow[]
  total_outstanding: number
  restaurants_with_debt: number
}

// ──────────────────────────────────────────
// Internal fetch helper
// ──────────────────────────────────────────

/**
 * Resolve the caller's company for the X-Company-Id header.
 *
 * The backend connects as `postgres`, which bypasses Row Level Security, so it
 * cannot infer the tenant itself. Every request must carry X-Company-Id or the
 * API rejects it with a 401 rather than returning cross-tenant data.
 *
 * This reads the authoritative profile rather than the session's Clerk claims.
 * Reading the claims is subtly wrong: the claims are baked into the JWT at sign-in,
 * so they lag behind a role change or a freshly created profile by one request —
 * the layout would already know the company while this threw, and every data page
 * would hit the error boundary. `resolveAccess` is `cache()`d, so this costs one
 * profile read per request regardless of how many endpoints a page calls.
 */
async function resolveCompanyId(): Promise<string> {
  const { userId } = await auth()

  if (!userId) {
    throw new Error('You must be signed in to load data.')
  }

  const access = await resolveAccess(userId)

  if (!access) {
    // No profile yet. The layout normally redirects to /onboarding first; this is
    // the backstop for a route rendered outside that layout.
    redirect('/onboarding')
  }

  return access.company_id
}

async function rustFetch<T>(path: string): Promise<T> {
  if (!RUST_API_SECRET) {
    throw new Error(
      'RUST_API_SECRET is not set. It must match API_SECRET in backend/.env.',
    )
  }

  const companyId = await resolveCompanyId()

  const res = await fetch(`${RUST_API_URL}${path}`, {
    headers: {
      'x-api-key': RUST_API_SECRET,
      'x-company-id': companyId,
    },
    // Next.js: opt out of caching so data is always fresh
    cache: 'no-store',
  })

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        `Rust API rejected the request on ${path} (401). Check that ` +
          `RUST_API_SECRET matches backend/.env's API_SECRET and that this ` +
          `account has a company_id in its Clerk session claims.`,
      )
    }
    throw new Error(`Rust API error ${res.status} on ${path}`)
  }

  return res.json() as Promise<T>
}

// ──────────────────────────────────────────
// API Methods
// ──────────────────────────────────────────

export type Product = {
  id: string
  name: string
  description?: string
  hsn_code: string
  gst_rate: number
  price: number
  is_active: boolean
  min_stock_level: number
}

export type ProductsResponse = {
  data: Product[]
  total: number
  page: number
  page_size: number
}

export const api = {
  async dashboard(): Promise<DashboardData> {
    return rustFetch<DashboardData>('/api/dashboard')
  },

  async restaurants(page = 1, search = '', status = 'all'): Promise<RestaurantsResponse> {
    const params = new URLSearchParams({
      page: String(page),
      ...(search && { search }),
      ...(status !== 'all' && { status }),
    })
    return rustFetch<RestaurantsResponse>(`/api/restaurants?${params}`)
  },

  async products(page = 1, search = '', status = 'all'): Promise<ProductsResponse> {
    const params = new URLSearchParams({
      page: String(page),
      ...(search && { search }),
      ...(status !== 'all' && { status }),
    })
    return rustFetch<ProductsResponse>(`/api/products?${params}`)
  },

  async collectionsToday(): Promise<TodayRouteResponse> {
    return rustFetch<TodayRouteResponse>('/api/collections/today')
  },

  async inventory(): Promise<InventoryItem[]> {
    return rustFetch<InventoryItem[]>('/api/inventory')
  },

  async payments(page = 1): Promise<PaymentsResponse> {
    return rustFetch<PaymentsResponse>(`/api/payments?page=${page}`)
  },

  async billing(page = 1): Promise<InvoicesResponse> {
    return rustFetch<InvoicesResponse>(`/api/billing?page=${page}`)
  },

  async outstanding(): Promise<OutstandingResponse> {
    return rustFetch<OutstandingResponse>('/api/outstanding')
  },
}
