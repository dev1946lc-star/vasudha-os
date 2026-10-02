import * as z from "zod"

export const paymentSchema = z.object({
  restaurant_id: z.string().min(1, "Restaurant is required"),
  invoice_id: z.string().min(1, "Invoice is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
  payment_mode: z.enum(['cash', 'bank_transfer', 'upi', 'cheque']),
  payment_date: z.string().min(1, "Date is required"),
  reference_number: z.string().optional(),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>
