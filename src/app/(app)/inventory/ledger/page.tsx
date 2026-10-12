import { createClient } from "@/lib/supabase/server"
import { auth } from "@clerk/nextjs/server"
import { canAccessRoute } from "@/lib/auth-guards"
import { resolveAccess } from "@/lib/session-claims"
import StockLedgerClient, { StockEntryItem } from "./StockLedgerClient"

export const revalidate = 0

type DbStockEntry = {
  id: string
  entry_date: string
  quantity_change: number
  quantity_before: number | null
  quantity_after: number | null
  entry_type: string
  reference_type: string | null
  reference_id: string | null
  unit_cost: number | null
  unit_cost_total: number | null
  unit: string | null
  supplier: string | null
  supplier_gstin: string | null
  batch_number: string | null
  expiry_date: string | null
  notes: string | null
  created_at: string
  products: {
    id: string
    name: string
    unit: string | null
    hsn_code: string | null
  } | null
}

export default async function StockLedgerPage() {
  const { userId } = await auth()
  const role = (await resolveAccess(userId ?? ""))?.role ?? "agent"
  const canAddStock = canAccessRoute(role, "/inventory/add")

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("stock_entries")
    .select(`
      id,
      entry_date,
      quantity_change,
      quantity_before,
      quantity_after,
      entry_type,
      reference_type,
      reference_id,
      unit_cost,
      unit_cost_total,
      unit,
      supplier,
      supplier_gstin,
      batch_number,
      expiry_date,
      notes,
      created_at,
      products (
        id,
        name,
        unit,
        hsn_code
      )
    `)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="p-4 bg-red-50 text-red-600 rounded-md font-medium">
          Failed to load stock ledger: {error.message}
        </div>
      </div>
    )
  }

  const entries: StockEntryItem[] = ((data as unknown as DbStockEntry[]) || []).map((row) => ({
    id: row.id,
    entry_date: row.entry_date,
    quantity_change: Number(row.quantity_change),
    quantity_before: row.quantity_before != null ? Number(row.quantity_before) : null,
    quantity_after: row.quantity_after != null ? Number(row.quantity_after) : null,
    entry_type: row.entry_type,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    unit_cost: row.unit_cost != null ? Number(row.unit_cost) : null,
    unit_cost_total: row.unit_cost_total != null ? Number(row.unit_cost_total) : null,
    unit: row.unit,
    supplier: row.supplier,
    supplier_gstin: row.supplier_gstin,
    batch_number: row.batch_number,
    expiry_date: row.expiry_date,
    notes: row.notes,
    created_at: row.created_at,
    product_name: row.products?.name ?? "Unknown Product",
    product_unit: row.products?.unit ?? row.unit ?? "unit",
    hsn_code: row.products?.hsn_code ?? null,
  }))

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <StockLedgerClient initialEntries={entries} canAddStock={canAddStock} />
    </div>
  )
}
