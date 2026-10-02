"use client"

import { PDFDownloadLink } from '@react-pdf/renderer'
import { InvoicePDF, type InvoiceData } from './InvoicePDF'
import { Download } from 'lucide-react'
import { useIsClient } from '@/components/use-is-client'

export default function DownloadPDFButton({ data }: { data: InvoiceData }) {
  const isClient = useIsClient()

  if (!isClient) {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-400 rounded-lg text-sm font-medium">
        <Download className="h-4 w-4" /> Loading PDF Engine...
      </button>
    )
  }

  return (
    <PDFDownloadLink
      document={<InvoicePDF data={data} />}
      fileName={`${data.invoice_number}.pdf`}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors"
    >
      {({ loading }) => (
        <>
          <Download className="h-4 w-4" />
          {loading ? 'Preparing Document...' : 'Download PDF'}
        </>
      )}
    </PDFDownloadLink>
  )
}
