// Shared loading skeletons. Every route that awaits data should render one of
// these so navigation never flashes an empty page.

export function PageHeaderSkeleton({
  titleWidth = "w-40",
  subtitleWidth = "w-52",
  action = true,
}: {
  titleWidth?: string
  subtitleWidth?: string
  action?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div className="space-y-2">
        <div className={`h-7 ${titleWidth} bg-slate-200 rounded-lg`} />
        <div className={`h-4 ${subtitleWidth} bg-slate-200 rounded`} />
      </div>
      {action && <div className="h-9 w-36 bg-slate-200 rounded-lg shrink-0" />}
    </div>
  )
}

export function CardGridSkeleton({
  count = 4,
  className = "lg:grid-cols-4",
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${className} gap-4 mb-8`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="mt-3 h-8 w-36 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({
  rows = 10,
  columns = 6,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 flex gap-8 border-b border-slate-200">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 bg-slate-200 rounded w-20" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-8 items-center">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="h-4 bg-slate-200 rounded w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Default wrapper: header + table, matching the shape of most list pages. */
export function ListPageSkeleton({
  rows = 10,
  columns = 6,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  )
}