import { createClient } from "@/lib/supabase/server"
import { Calculator, FileSpreadsheet, Layers, Receipt } from "lucide-react"
import Link from "next/link"
import DownloadCSVButton from "@/components/reports/DownloadCSVButton"

export const revalidate = 0

type Gstr1Row = {
  hsn_code: string | null
  gst_rate: number
  supply_type: string
  invoice_count: number
  recipient_count: number
  taxable_value: number
  cgst: number
  sgst: number
  igst: number
  total_tax: number
}

type Gstr3bRow = {
  period: string
  inward_supplies: number
  input_cgst: number
  input_sgst: number
  input_igst: number
  input_tax_credit: number
  outward_supplies: number
  output_cgst: number
  output_sgst: number
  output_igst: number
  output_tax: number
  net_tax_payable: number
}

type GstInvoiceRow = {
  invoice_id: string
  recipient_gstin: string
  receiver_name: string
  invoice_number: string
  invoice_date: string
  due_date: string
  invoice_value: number
  taxable_value: number
  cgst: number
  sgst: number
  igst: number
  status: string
}

export default async function GSTReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>
}) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  const targetMonth = resolvedSearchParams.month || defaultMonth
  const activeTab = resolvedSearchParams.tab || "gstr1"

  // Date bounds for invoice-level detail
  const [yearStr, monthStr] = targetMonth.split("-")
  const startDate = `${targetMonth}-01`
  const endDate = new Date(Number(yearStr), Number(monthStr), 0).toISOString().split("T")[0]

  // Query views in parallel
  const [gstr1Res, gstr3bRes, invoiceDetailRes] = await Promise.all([
    supabase.from("gstr1_report").select("*"),
    supabase.from("gstr3b_report").select("*").eq("period", targetMonth),
    supabase
      .from("gst_invoice_detail")
      .select("*")
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .order("invoice_date", { ascending: true }),
  ])

  const gstr1Rows = (gstr1Res.data as Gstr1Row[]) || []
  const gstr3b = (gstr3bRes.data as Gstr3bRow[])?.[0] || null
  const invoiceRows = (invoiceDetailRes.data as GstInvoiceRow[]) || []

  // GSTR-1 metrics
  const totalTaxable = gstr1Rows.reduce((sum, r) => sum + Number(r.taxable_value || 0), 0)
  const totalCgst = gstr1Rows.reduce((sum, r) => sum + Number(r.cgst || 0), 0)
  const totalSgst = gstr1Rows.reduce((sum, r) => sum + Number(r.sgst || 0), 0)
  const totalIgst = gstr1Rows.reduce((sum, r) => sum + Number(r.igst || 0), 0)
  const totalTax = gstr1Rows.reduce((sum, r) => sum + Number(r.total_tax || 0), 0)

  // CSV data for GSTR-1 (HSN summary)
  const gstr1CsvData = gstr1Rows.map((r) => ({
    "HSN Code": r.hsn_code || "N/A",
    "GST Rate (%)": Number(r.gst_rate).toFixed(2),
    "Supply Type": r.supply_type,
    "Invoice Count": r.invoice_count,
    "Recipient Count": r.recipient_count,
    "Taxable Value (INR)": Number(r.taxable_value).toFixed(2),
    "Central Tax (CGST)": Number(r.cgst).toFixed(2),
    "State Tax (SGST)": Number(r.sgst).toFixed(2),
    "Integrated Tax (IGST)": Number(r.igst).toFixed(2),
    "Total Tax": Number(r.total_tax).toFixed(2),
  }))

  // CSV data for GSTR-3B
  const gstr3bCsvData = gstr3b
    ? [
        {
          "Return Period": gstr3b.period,
          "Inward Supplies (Purchases)": Number(gstr3b.inward_supplies).toFixed(2),
          "Input CGST": Number(gstr3b.input_cgst).toFixed(2),
          "Input SGST": Number(gstr3b.input_sgst).toFixed(2),
          "Input IGST": Number(gstr3b.input_igst).toFixed(2),
          "Total ITC Available": Number(gstr3b.input_tax_credit).toFixed(2),
          "Outward Supplies (Sales)": Number(gstr3b.outward_supplies).toFixed(2),
          "Output CGST": Number(gstr3b.output_cgst).toFixed(2),
          "Output SGST": Number(gstr3b.output_sgst).toFixed(2),
          "Output IGST": Number(gstr3b.output_igst).toFixed(2),
          "Total Output Tax": Number(gstr3b.output_tax).toFixed(2),
          "Net Tax Payable (Cash)": Number(gstr3b.net_tax_payable).toFixed(2),
        },
      ]
    : []

  // CSV data for invoice breakdown
  const invoiceCsvData = invoiceRows.map((r) => ({
    "Recipient GSTIN": r.recipient_gstin,
    "Receiver Name": r.receiver_name,
    "Invoice Number": r.invoice_number,
    "Invoice Date": r.invoice_date,
    "Due Date": r.due_date,
    "Taxable Value (INR)": Number(r.taxable_value).toFixed(2),
    "CGST": Number(r.cgst).toFixed(2),
    "SGST": Number(r.sgst).toFixed(2),
    "IGST": Number(r.igst).toFixed(2),
    "Total Invoice Value": Number(r.invoice_value).toFixed(2),
    "Status": r.status,
  }))

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-purple-600" />
            GST Compliance &amp; Returns Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            HSN-grouped GSTR-1, monthly GSTR-3B tax summary, and invoice audit details.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value={activeTab} />
            <input
              type="month"
              name="month"
              defaultValue={targetMonth}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              Filter
            </button>
          </form>

          {activeTab === "gstr1" && (
            <DownloadCSVButton data={gstr1CsvData} filename={`GSTR1_HSN_${targetMonth}`} />
          )}
          {activeTab === "gstr3b" && (
            <DownloadCSVButton data={gstr3bCsvData} filename={`GSTR3B_Monthly_${targetMonth}`} />
          )}
          {activeTab === "invoices" && (
            <DownloadCSVButton data={invoiceCsvData} filename={`GST_Invoices_${targetMonth}`} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <Link
          href={`/reports/gst?month=${targetMonth}&tab=gstr1`}
          className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors ${
            activeTab === "gstr1"
              ? "border-b-2 border-purple-600 text-purple-600 font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers className="h-4 w-4" />
          GSTR-1 (HSN Summary)
        </Link>
        <Link
          href={`/reports/gst?month=${targetMonth}&tab=gstr3b`}
          className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors ${
            activeTab === "gstr3b"
              ? "border-b-2 border-purple-600 text-purple-600 font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calculator className="h-4 w-4" />
          GSTR-3B (Monthly Return)
        </Link>
        <Link
          href={`/reports/gst?month=${targetMonth}&tab=invoices`}
          className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors ${
            activeTab === "invoices"
              ? "border-b-2 border-purple-600 text-purple-600 font-semibold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="h-4 w-4" />
          Invoice Breakdown ({invoiceRows.length})
        </Link>
      </div>

      {/* TAB 1: GSTR-1 HSN SUMMARY */}
      {activeTab === "gstr1" && (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Taxable Value
              </p>
              <p className="text-2xl font-bold mt-1 text-slate-900">₹{totalTaxable.toFixed(2)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                CGST + SGST (Intra-state)
              </p>
              <p className="text-2xl font-bold mt-1 text-slate-900">
                ₹{(totalCgst + totalSgst).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                IGST (Inter-state)
              </p>
              <p className="text-2xl font-bold mt-1 text-slate-900">₹{totalIgst.toFixed(2)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Output Tax
              </p>
              <p className="text-2xl font-bold mt-1 text-purple-600">₹{totalTax.toFixed(2)}</p>
            </div>
          </div>

          {/* HSN Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                <h2 className="font-bold text-slate-900">
                  GSTR-1 Outward Supplies (Grouped by HSN Code &amp; Rate)
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Excludes drafts &amp; cancelled invoices
              </span>
            </div>

            {gstr1Rows.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Layers className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p>No collectible invoices found for GSTR-1.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 font-medium">HSN Code</th>
                      <th className="px-5 py-3 font-medium">Rate</th>
                      <th className="px-5 py-3 font-medium">Supply Type</th>
                      <th className="px-5 py-3 font-medium text-center">Invoices</th>
                      <th className="px-5 py-3 font-medium text-center">Recipients</th>
                      <th className="px-5 py-3 font-medium text-right">Taxable Value</th>
                      <th className="px-5 py-3 font-medium text-right">CGST</th>
                      <th className="px-5 py-3 font-medium text-right">SGST</th>
                      <th className="px-5 py-3 font-medium text-right">IGST</th>
                      <th className="px-5 py-3 font-medium text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {gstr1Rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-5 py-3.5 font-mono font-medium text-slate-900">
                          {r.hsn_code || "UNCLASSIFIED"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{r.gst_rate}%</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              r.supply_type === "B2B"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {r.supply_type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-slate-700">{r.invoice_count}</td>
                        <td className="px-5 py-3.5 text-center text-slate-700">{r.recipient_count}</td>
                        <td className="px-5 py-3.5 text-right font-medium text-slate-900">
                          ₹{Number(r.taxable_value).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600">
                          ₹{Number(r.cgst).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600">
                          ₹{Number(r.sgst).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600">
                          ₹{Number(r.igst).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-purple-700">
                          ₹{Number(r.total_tax).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GSTR-3B MONTHLY RETURN */}
      {activeTab === "gstr3b" && (
        <div className="space-y-6">
          {!gstr3b ? (
            <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
              <Calculator className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No GST transactions found for period {targetMonth}.</p>
              <p className="text-xs text-slate-400 mt-1">
                Inward supplies from stock ledger purchases and outward sales will report here.
              </p>
            </div>
          ) : (
            <>
              {/* Summary net payable card */}
              <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-6 rounded-2xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-purple-200 font-semibold">
                      GSTR-3B Return for Period {gstr3b.period}
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-extrabold mt-1">
                      Net Tax Payable: ₹{Number(gstr3b.net_tax_payable).toFixed(2)}
                    </h2>
                    <p className="text-xs text-purple-200 mt-1">
                      Output Tax (₹{Number(gstr3b.output_tax).toFixed(2)}) minus Eligible ITC (₹
                      {Number(gstr3b.input_tax_credit).toFixed(2)})
                    </p>
                  </div>
                  <div className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl border border-white/20 text-right">
                    <div className="text-xs text-purple-200">Payment Status</div>
                    <div className="text-sm font-bold text-white">
                      {Number(gstr3b.net_tax_payable) <= 0 ? "Credit Carried Forward" : "Cash Liability"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-side comparison: Inward vs Outward */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Outward Supplies (3.1 Outward supplies and inward supplies liable to reverse charge) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-900">3.1 Outward Taxable Supplies</h3>
                      <p className="text-xs text-slate-500">Sales &amp; dispatches invoiced</p>
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      ₹{Number(gstr3b.outward_supplies).toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Central Tax (CGST)</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.output_cgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">State/UT Tax (SGST)</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.output_sgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Integrated Tax (IGST)</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.output_igst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 pt-3 font-bold text-purple-700">
                      <span>Total Output Liability</span>
                      <span>₹{Number(gstr3b.output_tax).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Inward Supplies / ITC (4. Eligible Input Tax Credit) */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-900">4. Eligible ITC (Purchases)</h3>
                      <p className="text-xs text-slate-500">Input tax from stock ledger entries</p>
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      ₹{Number(gstr3b.inward_supplies).toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Input CGST</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.input_cgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Input SGST</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.input_sgst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Input IGST</span>
                      <span className="font-semibold text-slate-900">
                        ₹{Number(gstr3b.input_igst).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 pt-3 font-bold text-emerald-700">
                      <span>Total ITC Claimable</span>
                      <span>₹{Number(gstr3b.input_tax_credit).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: INVOICE BREAKDOWN */}
      {activeTab === "invoices" && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">GST Invoice Reconciliation</h2>
            <span className="text-xs text-slate-500">
              {invoiceRows.length} invoice{invoiceRows.length === 1 ? "" : "s"} in {targetMonth}
            </span>
          </div>

          {invoiceRows.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p>No invoices found for {targetMonth}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 font-medium">Invoice #</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Receiver Name</th>
                    <th className="px-5 py-3 font-medium">GSTIN</th>
                    <th className="px-5 py-3 font-medium text-right">Taxable</th>
                    <th className="px-5 py-3 font-medium text-right">CGST</th>
                    <th className="px-5 py-3 font-medium text-right">SGST</th>
                    <th className="px-5 py-3 font-medium text-right">IGST</th>
                    <th className="px-5 py-3 font-medium text-right">Total Value</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invoiceRows.map((inv) => (
                    <tr key={inv.invoice_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-medium text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">{inv.invoice_date}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{inv.receiver_name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">
                        {inv.recipient_gstin}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-900">
                        ₹{Number(inv.taxable_value).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">
                        ₹{Number(inv.cgst).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">
                        ₹{Number(inv.sgst).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">
                        ₹{Number(inv.igst).toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">
                        ₹{Number(inv.invoice_value).toFixed(2)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 capitalize">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
