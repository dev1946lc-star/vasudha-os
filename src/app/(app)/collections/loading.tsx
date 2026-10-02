export default function CollectionsLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-slate-200 rounded-lg" />
          <div className="h-4 w-52 bg-slate-200 rounded" />
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5" />
      </div>

      {/* Stop cards */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex justify-between items-center gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-72 bg-slate-200 rounded" />
              <div className="h-4 w-40 bg-slate-200 rounded" />
            </div>
            <div className="h-10 w-40 bg-slate-200 rounded-lg flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
