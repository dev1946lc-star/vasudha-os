import { ListPageSkeleton } from "@/components/ui/skeletons"

// Wraps the invoice detail route (`/invoices/[id]`). `ListPageSkeleton` already
// renders the shared page wrapper, so it is returned as the root.
export default function InvoicesLoading() {
  return <ListPageSkeleton columns={5} rows={6} />
}