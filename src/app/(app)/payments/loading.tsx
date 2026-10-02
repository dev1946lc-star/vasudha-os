export default function PaymentsLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-7 w-28 bg-slate-200 rounded-lg" />
          <div className="h-4 w-56 bg-slate-200 rounded" />
        </div>
        <div className="h-9 w-36 bg-slate-200 rounded-lg" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-4 bg-slate-50 flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-20" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex gap-8 items-center">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-36 bg-slate-200 rounded" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="h-4 w-28 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded ml-auto" />
              <div className="h-4 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
