import * as z from "zod"

export const RETURN_REASONS = [
  'damaged',
  'expired',
  'wrong_item',
  'excess',
  'quality',
  'not_ordered',
  'other',
] as const

export type ReturnReason = (typeof RETURN_REASONS)[number]

export const collectionItemSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative").default(0),
  return_quantity: z.coerce.number().min(0, "Return quantity cannot be negative").default(0),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
  return_reason: z.enum(RETURN_REASONS).optional(),
  return_restockable: z.boolean().default(true),
}).refine(
  (data) => data.return_quantity === 0 || data.return_reason != null,
  { message: "A return reason is required when items are returned", path: ["return_reason"] }
)

export const collectionSchema = z.object({
  restaurant_id: z.string().min(1, "Restaurant is required"),
  notes: z.string().optional(),
  items: z.array(collectionItemSchema).min(1, "At least one item is required"),
})

export type CollectionFormValues = z.infer<typeof collectionSchema>
export type CollectionItemFormValues = z.infer<typeof collectionItemSchema>
