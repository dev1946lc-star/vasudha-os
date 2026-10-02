"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaces in the browser console and any client error reporter.
    console.error("Route error:", error)
  }, [error])

  const isApiDown =
    error.message.includes("Rust API error") ||
    error.message.includes("fetch failed") ||
    error.message.includes("ECONNREFUSED")

  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="p-3 w-fit bg-red-50 rounded-lg text-red-600 mb-4">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-bold text-slate-900">
          {isApiDown ? "Can’t reach the VASUDHA API" : "Something went wrong"}
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          {isApiDown
            ? "The Rust backend is not responding. Start it with npm run api and confirm RUST_API_URL points at the right host."
            : "This page failed to render. Retrying often clears it."}
        </p>

        <details className="mt-4">
          <summary className="text-xs font-medium text-slate-500 cursor-pointer select-none">
            Technical detail
          </summary>
          <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        </details>

        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <Home className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}