import { ListPageSkeleton } from "@/components/ui/skeletons"

// Renders UserListClient, which is a staff table rather than a form.
export default function UserSettingsLoading() {
  return <ListPageSkeleton rows={8} columns={4} />
}