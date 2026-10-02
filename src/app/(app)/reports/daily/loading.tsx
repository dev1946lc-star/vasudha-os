import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons"

// KPI row + per-stop table. `CardGridSkeleton` carries its own `mb-8`, so no
// extra spacing wrapper is added around it.
export default function DailyReportLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
      <TableSkeleton columns={5} />
    </div>
  )
}