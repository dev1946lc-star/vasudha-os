import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons"

// GST totals + the wide GSTR-1 preview table. `CardGridSkeleton` carries its own
// `mb-8`, so no extra spacing wrapper is added around it.
export default function GstReportLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
      <TableSkeleton columns={8} />
    </div>
  )
}