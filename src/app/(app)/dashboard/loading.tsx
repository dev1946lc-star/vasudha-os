export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-slate-200 rounded-lg" />
          <div className="h-4 w-64 bg-slate-200 rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-36 bg-slate-200 rounded-lg" />
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-36 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div className="space-y-3 w-full">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-8 bg-slate-200 rounded w-3/4" />
              </div>
              <div className="p-3 bg-slate-100 rounded-xl w-12 h-12 flex-shrink-0" />
            </div>
            <div className="mt-4 h-4 bg-slate-200 rounded w-full" />
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[400px]">
        <div className="col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="h-6 w-36 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-48 bg-slate-200 rounded mb-6" />
          <div className="h-[280px] bg-slate-100 rounded-xl" />
        </div>
        <div className="col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="h-6 w-32 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-40 bg-slate-200 rounded mb-6" />
          <div className="h-[200px] bg-slate-100 rounded-full mx-auto aspect-square" />
        </div>
      </div>
    </div>
  )
}
