export function KPISkeleton() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-3 w-full">
          <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          <div className="h-8 bg-slate-200 rounded w-3/4"></div>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl w-12 h-12 flex-shrink-0"></div>
      </div>
      <div className="mt-4 h-4 bg-slate-200 rounded w-full"></div>
    </div>
  )
}
