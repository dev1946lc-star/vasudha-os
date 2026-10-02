import * as z from "zod"

export const paymentSchema = z.object({
  restaurant_id: z.string().min(1, "Restaurant is required"),
  // Optional since migration 31. An empty string means "no specific invoice",
  // which is how an advance payment is recorded: the server applies it to the
  // oldest open bills and carries any surplus as credit. Previously this was
  // required, so paying round figures against several bills was impossible.
  invoice_id: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  amount: z.coerce.number().min(0.01, "Amount must be greater than zero"),
  payment_mode: z.enum(['cash', 'bank_transfer', 'upi', 'cheque']),
  payment_date: z.string().min(1, "Date is required"),
  reference_number: z.string().optional(),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>
