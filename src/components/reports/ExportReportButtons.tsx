"use client"

import { Download, Printer } from "lucide-react"
import { rowsToCsv, type CsvRow } from "./csv"

interface ExportReportButtonsProps {
  data: CsvRow[]
  filename: string
}

export default function ExportReportButtons({ data, filename }: ExportReportButtonsProps) {
  
  const handlePrint = () => {
    window.print()
  }

  const downloadCSV = () => {
    if (data.length === 0) return

    const csvContent = rowsToCsv(data)

    // Create a Blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${filename}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button 
        onClick={handlePrint}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium shadow-sm transition-colors"
      >
        <Printer className="h-4 w-4" /> Print PDF
      </button>
      <button
        onClick={downloadCSV}
        disabled={data.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
      >
        <Download className="h-4 w-4" /> Export CSV
      </button>
    </div>
  )
}
