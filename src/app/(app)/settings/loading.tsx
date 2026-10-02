import { ListPageSkeleton } from "@/components/ui/skeletons"

// Settings index: a list of settings sections. `ListPageSkeleton` already
// renders the shared page wrapper, so it is returned as the root.
export default function SettingsLoading() {
  return <ListPageSkeleton columns={4} />
}