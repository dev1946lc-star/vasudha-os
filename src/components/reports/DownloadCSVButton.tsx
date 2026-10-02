"use client"

import { Download } from "lucide-react"
import { rowsToCsv, type CsvRow } from "./csv"

export default function DownloadCSVButton({ data, filename }: { data: CsvRow[], filename: string }) {
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
    // Release the object URL, otherwise the blob stays pinned for the page's life.
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={downloadCSV}
      disabled={data.length === 0}
      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
    >
      <Download className="h-4 w-4" /> Download CSV
    </button>
  )
}
