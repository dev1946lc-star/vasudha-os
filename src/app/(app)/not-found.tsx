import Link from "next/link"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto p-4 w-fit bg-slate-100 rounded-2xl text-slate-400">
          <FileQuestion className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Page not found</h2>
        <p className="mt-2 text-sm text-slate-600">
          That record does not exist, or it belongs to a different company.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}