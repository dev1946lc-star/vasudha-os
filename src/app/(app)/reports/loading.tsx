import { ListPageSkeleton } from "@/components/ui/skeletons"

// Reports index: a short list of report links. `ListPageSkeleton` already
// renders the shared page wrapper, so it is returned as the root.
export default function ReportsLoading() {
  return <ListPageSkeleton columns={4} />
}