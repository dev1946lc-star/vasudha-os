import { ListPageSkeleton } from "@/components/ui/skeletons"

// Sales report is table-led; `ListPageSkeleton` already renders the shared page
// wrapper, so it is returned as the root.
export default function SalesReportLoading() {
  return <ListPageSkeleton columns={5} />
}