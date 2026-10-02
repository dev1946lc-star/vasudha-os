import { createClient } from "@/lib/supabase/server"
import { Building, Calculator, FileSpreadsheet } from "lucide-react"
import DownloadCSVButton from "@/components/reports/DownloadCSVButton"

export const revalidate = 0

export default async function GSTReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const resolvedSearchParams = await searchParams;

  // Default to current month (YYYY-MM format)
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const targetMonth = resolvedSearchParams.month || defaultMonth

  // Calculate start and end dates based on YYYY-MM
  const [yearStr, monthStr] = targetMonth.split('-')
  const startDate = `${targetMonth}-01`
  const endDate = new Date(Number(yearStr), Number(monthStr), 0).toISOString().split('T')[0]

  // Query the GSTR-1 View
  const { data: records } = await supabase
    .from('gstr1_report')
    .select('*')
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate)
    .order('invoice_date', { ascending: true })

  const gstr1 = records || []

  // Metrics
  const totalInvoices = gstr1.length
  const totalTaxable = gstr1.reduce((sum: number, r) => sum + Number(r.taxable_value), 0)
  const totalTax = gstr1.reduce((sum: number, r) => sum + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0)
  const totalValue = gstr1.reduce((sum: number, r) => sum + Number(r.invoice_value), 0)

  // Format CSV Data strictly for accountant
  const csvData = gstr1.map((r) => ({
    "GSTIN/UIN of Recipient": r.recipient_gstin,
    "Receiver Name": r.receiver_name,
    "Invoice Number": r.invoice_number,
    "Invoice Date": new Date(r.invoice_date).toLocaleDateString('en-GB'),
    "Invoice Value": Number(r.invoice_value).toFixed(2),
    "Place Of Supply": "State Code", // Placeholder for actual state logic
    "Reverse Charge": "N",
    "Invoice Type": r.recipient_gstin === 'URP' ? 'B2C' : 'Regular',
    "Rate": "5.00", // Standard Oil Rate
    "Taxable Value": Number(r.taxable_value).toFixed(2),
    "Integrated Tax Amount": Number(r.igst).toFixed(2),
    "Central Tax Amount": Number(r.cgst).toFixed(2),
    "State/UT Tax Amount": Number(r.sgst).toFixed(2),
  }))

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      
      {/* Header and Controls */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-purple-600" />
            GSTR-1 Outward Supplies
          </h1>
          <p className="text-sm text-slate-500 mt-1">Tax-compliant export ready for accountant filing.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <form className="flex items-center gap-2">
            <input 
              type="month" 
              name="month"
              defaultValue={targetMonth}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500"
            />
            <button type="submit" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
              Filter
            </button>
          </form>
          
          <DownloadCSVButton data={csvData} filename={`GSTR1_${targetMonth}`} />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total B2B / B2C Invoices</p>
          <p className="text-3xl font-bold mt-2 text-slate-900">{totalInvoices}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Taxable Value</p>
          <p className="text-3xl font-bold mt-2 text-slate-900">₹{totalTaxable.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Tax Collected</p>
          <p className="text-3xl font-bold mt-2 text-purple-600">₹{totalTax.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Invoice Value</p>
          <p className="text-3xl font-bold mt-2 text-slate-900">₹{totalValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-slate-400" />
          <h2 className="font-bold text-slate-900">GSTR-1 Record Preview</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-3 font-medium">GSTIN/UIN</th>
                <th className="px-6 py-3 font-medium">Receiver Name</th>
                <th className="px-6 py-3 font-medium">Invoice No.</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Taxable Val</th>
                <th className="px-6 py-3 font-medium text-right">CGST</th>
                <th className="px-6 py-3 font-medium text-right">SGST</th>
                <th className="px-6 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gstr1.map((r) => {
                const isURP = r.recipient_gstin === 'URP';
                return (
                  <tr key={r.id} className="hover:bg-slate-50 text-sm">
                    <td className="px-6 py-3">
                      {isURP ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">URP</span>
                      ) : (
                        <span className="font-medium text-slate-900">{r.recipient_gstin}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-700">{r.receiver_name}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{r.invoice_number}</td>
                    <td className="px-6 py-3 text-slate-500">{new Date(r.invoice_date).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right text-slate-700">₹{Number(r.taxable_value).toFixed(2)}</td>
                    <td className="px-6 py-3 text-right text-slate-600">{Number(r.cgst) > 0 ? `₹${Number(r.cgst).toFixed(2)}` : '-'}</td>
                    <td className="px-6 py-3 text-right text-slate-600">{Number(r.sgst) > 0 ? `₹${Number(r.sgst).toFixed(2)}` : '-'}</td>
                    <td className="px-6 py-3 text-right font-medium text-purple-600">₹{Number(r.invoice_value).toFixed(2)}</td>
                  </tr>
                )
              })}
              {gstr1.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <Building className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    No outward supplies recorded for {targetMonth}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
