import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons"

// Summary cards + wide breakdown table. `CardGridSkeleton` carries its own
// `mb-8`, so no extra spacing wrapper is added around it.
export default function OutstandingLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={2} className="sm:grid-cols-2" />
      <TableSkeleton columns={7} />
    </div>
  )
}