"use client"

import { ReceiptPDF, type ReceiptData } from './ReceiptPDF'
import { Download, Share2 } from 'lucide-react'
import { useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { useIsClient } from '@/components/use-is-client'

export default function DownloadReceiptButton({ data }: { data: ReceiptData }) {
  const isClient = useIsClient()
  const [isGenerating, setIsGenerating] = useState(false)

  // Resolved at click time rather than in an effect: navigator only exists in
  // the browser, and by then the handler is guaranteed to run client-side.
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'

  const handleShare = async () => {
    try {
      setIsGenerating(true)
      
      // Generate Blob
      const blob = await pdf(<ReceiptPDF data={data} />).toBlob()
      const file = new File([blob], `receipt_${data.invoice.invoice_number}.pdf`, { type: 'application/pdf' })

      if (canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Payment Receipt',
          text: `Payment Receipt for Invoice ${data.invoice.invoice_number}`
        })
      } else {
        // Fallback to direct download
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error sharing receipt:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  if (!isClient) {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-400 rounded-lg text-sm font-medium">
        <Download className="h-4 w-4" /> Loading Engine...
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      disabled={isGenerating}
      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
    >
      {canShare ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {isGenerating ? 'Preparing...' : (canShare ? 'Share Receipt' : 'Download Receipt')}
    </button>
  )
}
