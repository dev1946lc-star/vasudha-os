export default function RestaurantsLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-slate-200 rounded-lg" />
          <div className="h-4 w-60 bg-slate-200 rounded" />
        </div>
        <div className="h-9 w-36 bg-slate-200 rounded-md" />
      </div>

      {/* Filter bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 flex gap-4">
        <div className="h-9 flex-1 max-w-md bg-slate-100 rounded-md" />
        <div className="h-9 w-36 bg-slate-100 rounded-md" />
      </div>

      {/* Table */}
      <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-3 bg-slate-50 flex gap-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-24" />
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex gap-8 items-center">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 bg-slate-200 rounded" />
                <div className="h-3 w-48 bg-slate-100 rounded" />
              </div>
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="flex gap-3 ml-auto">
                <div className="h-4 w-4 bg-slate-200 rounded" />
                <div className="h-4 w-4 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
