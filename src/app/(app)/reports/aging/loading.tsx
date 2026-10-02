import { ListPageSkeleton } from "@/components/ui/skeletons"

// Aging report is table-led; `ListPageSkeleton` already renders the shared page
// wrapper, so it is returned as the root.
export default function AgingReportLoading() {
  return <ListPageSkeleton columns={6} />
}