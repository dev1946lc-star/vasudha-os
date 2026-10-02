import * as z from "zod"

export const collectionItemSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative").default(0),
  return_quantity: z.coerce.number().min(0, "Return quantity cannot be negative").default(0),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
})

export const collectionSchema = z.object({
  restaurant_id: z.string().min(1, "Restaurant is required"),
  notes: z.string().optional(),
  items: z.array(collectionItemSchema).min(1, "At least one item is required"),
})

export type CollectionFormValues = z.infer<typeof collectionSchema>
export type CollectionItemFormValues = z.infer<typeof collectionItemSchema>
