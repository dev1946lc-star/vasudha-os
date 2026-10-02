import Link from "next/link"
import { BarChart3, FileSpreadsheet, FileText, CalendarDays } from "lucide-react"

export default function ReportsPage() {
  const reports = [
    {
      title: "Aging Analysis",
      description: "View outstanding balances grouped by 0-15, 16-30, 31-60, and 60+ days.",
      href: "/reports/aging",
      icon: <BarChart3 className="h-6 w-6 text-red-500" />,
      color: "bg-red-50 border-red-100",
    },
    {
      title: "Daily Route Report",
      description: "Track collections and operations for any given date.",
      href: "/reports/daily",
      icon: <CalendarDays className="h-6 w-6 text-blue-500" />,
      color: "bg-blue-50 border-blue-100",
    },
    {
      title: "GST Export",
      description: "Generate GSTR-1 ready reports and view tax liability summaries.",
      href: "/reports/gst",
      icon: <FileText className="h-6 w-6 text-emerald-500" />,
      color: "bg-emerald-50 border-emerald-100",
    },
    {
      title: "Sales & Revenue",
      description: "Analyze daily, weekly, and monthly sales trends.",
      href: "/reports/sales",
      icon: <FileSpreadsheet className="h-6 w-6 text-violet-500" />,
      color: "bg-violet-50 border-violet-100",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports Hub</h1>
        <p className="text-slate-500 mt-1">Select a report to view analytics and export data.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <Link 
            key={report.href} 
            href={report.href}
            className={`group block p-6 rounded-2xl border bg-white hover:shadow-md transition-all duration-200 border-slate-200`}
          >
            <div className={`p-3 rounded-xl w-fit ${report.color} mb-4`}>
              {report.icon}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
              {report.title}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              {report.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
