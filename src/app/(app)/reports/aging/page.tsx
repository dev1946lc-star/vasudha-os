import { createClient } from "@/lib/supabase/server"
import { AlertCircle, FileText } from "lucide-react"
import ExportReportButtons from "@/components/reports/ExportReportButtons"

export const revalidate = 0

// Group data by restaurant for rendering.
// Column names come from public.invoice_aging (migration 29). Note `bucket`, not
// `aging_bucket`, and that days_overdue is signed: negative means not yet due.
type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  outstanding_amount: number;
  days_overdue: number;
  bucket: string;
}

type GroupedData = {
  restaurant_id: string;
  restaurant_name: string;
  total_outstanding: number;
  invoices: InvoiceRow[];
}

export default async function AgingReportPage() {
  const supabase = await createClient()

  // Read the invoice-level view, not detailed_aging_report. The latter is a
  // per-restaurant rollup, so it has no invoice_id, invoice_number, days_overdue
  // or bucket column -- every one of which this page renders. Selecting it here
  // produced undefined fields rather than an error, so the report silently
  // showed blank dates, blank buckets and "NaN days".
  const { data: rawData } = await supabase
    .from('invoice_aging')
    .select('*')
    .order('restaurant_name', { ascending: true })

  const rows = rawData || []

  // Group by restaurant
  const grouped: Record<string, GroupedData> = {}

  let totalMarketDebt = 0;
  let severeDebt = 0; // genuinely 60+ days past due
  let notYetDue = 0; // invoiced, still inside the payment term

  rows.forEach((row) => {
    if (!grouped[row.restaurant_id]) {
      grouped[row.restaurant_id] = {
        restaurant_id: row.restaurant_id,
        restaurant_name: row.restaurant_name,
        total_outstanding: 0,
        invoices: []
      }
    }
const amount = Number(row.outstanding_amount)

    grouped[row.restaurant_id].total_outstanding += amount
    grouped[row.restaurant_id].invoices.push({
      id: row.id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      outstanding_amount: amount,
      days_overdue: Number(row.days_overdue),
      bucket: row.bucket
    })


    totalMarketDebt += amount;
    // Severe means genuinely late, not merely old. A bill inside its payment
    // term is not a collections problem, so it must not inflate this figure.
    if (row.bucket === '60+') {
      severeDebt += amount;
    }
    if (row.bucket === 'current') {
      notYetDue += amount;
    }
  })
  const restaurants = Object.values(grouped).sort((a, b) => b.total_outstanding - a.total_outstanding)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" />
            Detailed Aging Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Invoice-level breakdown of outstanding market debt, measured from each bill&apos;s due
            date. Money still inside the payment term is reported as not yet due, not as overdue.
          </p>
        </div>
        
        <ExportReportButtons 
          data={rows.map((r) => ({
            "Restaurant": r.restaurant_name,
            "Invoice No": r.invoice_number,
            "Date": new Date(r.invoice_date).toLocaleDateString(),
            "Due Date": new Date(r.due_date).toLocaleDateString(),
            // Blank rather than a negative number: an invoice that is not yet due
            // has no days-overdue, and exporting "-15" invites misreading.
            "Days Overdue": Number(r.days_overdue) < 0 ? "" : r.days_overdue,
            "Bucket": r.bucket === "current" ? "Not Yet Due" : `${r.bucket} Days Overdue`,
            "Outstanding (Rs)": r.outstanding_amount
          }))}
          filename="Detailed_Aging_Report"
        />
      </div>

      {/* Summary Banner */}
      <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-sm mb-8 flex flex-col md:flex-row gap-6 md:gap-12 items-center">
        <div>
          <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider mb-1">Total Outstanding</p>
          <p className="text-4xl font-bold">₹{totalMarketDebt.toFixed(2)}</p>
        </div>
        <div className="h-12 w-px bg-indigo-500 hidden md:block"></div>
        <div>
          <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-red-300" /> Severe Debt (60+ Days Overdue)
          </p>
          <p className="text-4xl font-bold text-red-200">₹{severeDebt.toFixed(2)}</p>
        </div>
        <div className="h-12 w-px bg-indigo-500 hidden md:block"></div>
        <div>
          <p className="text-indigo-200 text-sm font-medium uppercase tracking-wider mb-1">
            Not Yet Due
          </p>
          <p className="text-4xl font-bold text-indigo-100">₹{notYetDue.toFixed(2)}</p>
        </div>
      </div>

      {/* Grouped Tables */}
      <div className="space-y-8">
        {restaurants.map((restaurant) => (
          <div key={restaurant.restaurant_id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">{restaurant.restaurant_name}</h2>
              <span className="font-bold text-slate-900 bg-white px-3 py-1 rounded-md border border-slate-200 shadow-sm">
                Total: ₹{restaurant.total_outstanding.toFixed(2)}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                    <th className="px-6 py-3 font-medium">Invoice No.</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Due Date</th>
                    <th className="px-6 py-3 font-medium text-center">Days Overdue</th>
                    <th className="px-6 py-3 font-medium text-center">Aging Bucket</th>
                    <th className="px-6 py-3 font-medium text-right">Outstanding Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {restaurant.invoices.map((inv) => {
                    // Colour ramps with how late it is. 'current' is deliberately
                    // the calmest badge: not-yet-due is normal, not delinquent.
                    let rowColor = "text-slate-900"
                    let badgeColor = "bg-slate-100 text-slate-700"
                    let badgeText = `${inv.bucket} Days Overdue`

                    if (inv.bucket === 'current') {
                      badgeColor = "bg-blue-50 text-blue-700"
                      badgeText = "Not Yet Due"
                    }
                    if (inv.bucket === '0-15') { badgeColor = "bg-slate-100 text-slate-700" }
                    if (inv.bucket === '16-30') { badgeColor = "bg-amber-100 text-amber-800" }
                    if (inv.bucket === '31-60') { badgeColor = "bg-orange-100 text-orange-800"; rowColor = "text-orange-900" }
                    if (inv.bucket === '60+') { badgeColor = "bg-red-100 text-red-800"; rowColor = "text-red-700 font-medium" }

                    const notYetDue = inv.bucket === 'current'

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-700">
                          {inv.invoice_number}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500">
                          {new Date(inv.invoice_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500">
                          {new Date(inv.due_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {notYetDue ? (
                            <span className="text-sm text-slate-400">-</span>
                          ) : (
                            <span className={`text-sm ${inv.days_overdue > 30 ? 'font-bold text-red-600' : 'text-slate-600'}`}>
                              {inv.days_overdue} days
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
                            {badgeText}
                          </span>
                        </td>
                        <td className={`px-6 py-3 text-right ${rowColor}`}>
                          ₹{inv.outstanding_amount.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {restaurants.length === 0 && (
          <div className="text-center py-12 bg-white border border-slate-200 rounded-xl shadow-sm">
            <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No Outstanding Invoices</h3>
            <p className="text-slate-500 mt-1">All accounts are fully paid and up to date.</p>
          </div>
        )}
      </div>

    </div>
  )
}
