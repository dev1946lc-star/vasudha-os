import * as z from "zod"

export const restaurantSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long"),
  address: z.string().min(5, "Address must be at least 5 characters long"),
  contact_person: z.string().min(2, "Contact person is required"),
  phone: z.string().regex(/^[0-9+\-\s()]{10,15}$/, "Invalid phone number format"),
  credit_limit: z.coerce.number().min(0, "Credit limit must be a positive number").default(0),
  payment_terms_days: z.coerce.number().min(0, "Days must be positive").default(15),
  is_active: z.boolean().default(true),
})

export type RestaurantFormValues = z.infer<typeof restaurantSchema>

export interface Restaurant extends RestaurantFormValues {
  id: string
  company_id: string
  created_at: string
}
