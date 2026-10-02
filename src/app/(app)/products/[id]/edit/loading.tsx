import { PageHeaderSkeleton } from "@/components/ui/skeletons"

// Edit form. Built inline to match the two-column `ProductForm` card it
// resolves into rather than reusing the table-shaped `ListPageSkeleton`.
export default function ProductEditLoading() {
  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 animate-pulse">
      <PageHeaderSkeleton />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
          <div className="col-span-2 md:col-span-1 space-y-1.5">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-10 w-full bg-slate-200 rounded" />
          </div>
        </div>

        <div className="flex gap-4 pt-4 mt-6 border-t border-slate-100">
          <div className="flex-1 h-10 bg-slate-200 rounded-md" />
          <div className="flex-1 h-10 bg-slate-200 rounded-md" />
        </div>
      </div>
    </div>
  )
}