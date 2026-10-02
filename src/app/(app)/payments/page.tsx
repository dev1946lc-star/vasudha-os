import { api } from "@/lib/api"
import Link from "next/link"
import { Plus, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"

export const revalidate = 30 // ISR: revalidate every 30 seconds
const PAGE_SIZE = 25

function modeColor(mode?: string) {
  switch (mode) {
    case "cash": return "bg-emerald-100 text-emerald-800"
    case "upi": return "bg-violet-100 text-violet-800"
    case "bank_transfer": return "bg-blue-100 text-blue-800"
    case "cheque": return "bg-amber-100 text-amber-800"
    default: return "bg-slate-100 text-slate-700"
  }
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1") || 1)

  const res = await api.payments(page)
  const payments = res.data
  const total = res.total
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">View and manage received payments.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/payments/new" />}>
          <Plus className="mr-2 size-4" />Record Payment
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardDescription>{total} payments total</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No payments found.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(pay.payment_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{pay.restaurant_name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${modeColor(pay.payment_mode)}`}>
                        {pay.payment_mode || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pay.reference_number || "-"}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">
                      ₹{pay.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/payments/${pay.id}`} />}>
                        Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  // The rendered element is a link, not a <button>, so Base UI
                  // must be told not to expect native button semantics.
                  nativeButton={false}
                  // `disabled` is not a valid <a> attribute and does not stop
                  // navigation, so an unreachable page is made inert instead.
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                  render={<Link href={`/payments?page=${page - 1}`} />}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  nativeButton={false}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
                  render={<Link href={`/payments?page=${page + 1}`} />}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
