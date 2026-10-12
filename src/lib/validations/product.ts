import * as z from "zod"

export const PRODUCT_UNITS = [
  "unit",
  "can",
  "kg",
  "g",
  "l",
  "litre",
  "ml",
  "pouch",
  "crate",
  "bottle",
  "piece",
  "bag",
  "box",
  "roll",
] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]

export const productSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long"),
  description: z.string().optional(),
  hsn_code: z.string().min(4, "HSN code must be at least 4 characters").max(8, "HSN code max 8 characters"),
  price: z.coerce.number().min(0.01, "Price must be strictly positive").default(0),
  gst_rate: z.coerce.number().min(0, "GST rate cannot be negative").max(100, "GST rate cannot exceed 100").default(5.0),
  min_stock_level: z.coerce.number().min(0, "Minimum stock cannot be negative").default(0),
  unit: z.enum(PRODUCT_UNITS).default("unit"),
  quantity_scale: z.coerce.number().min(0.001, "Scale must be positive").default(1),
  is_active: z.boolean().default(true),
})

export type ProductFormValues = z.infer<typeof productSchema>

export interface Product extends ProductFormValues {
  id: string
  company_id: string
  created_at: string
}
