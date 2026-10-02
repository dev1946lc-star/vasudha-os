import { PageHeaderSkeleton } from "@/components/ui/skeletons"

// Edit form. Built inline to match the `RestaurantForm` card it resolves into
// rather than reusing the table-shaped `ListPageSkeleton`.
export default function RestaurantEditLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl space-y-5">
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-10 w-full bg-slate-200 rounded" />
        </div>

        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <div className="flex-1 h-10 bg-slate-200 rounded-md" />
          <div className="flex-1 h-10 bg-slate-200 rounded-md" />
        </div>
      </div>
    </div>
  )
}