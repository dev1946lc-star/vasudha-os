import { ListPageSkeleton } from "@/components/ui/skeletons"

// `ListPageSkeleton` already renders the shared page wrapper
// (`max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse`), so it is returned
// as the root rather than nested in a second copy of that wrapper.
export default function ProductsLoading() {
  return <ListPageSkeleton columns={5} />
}