import { zodResolver } from "@hookform/resolvers/zod"
import type { FieldValues, Resolver } from "react-hook-form"
import type { ZodType } from "zod"

/**
 * Builds a react-hook-form resolver from a Zod schema, typed against the schema's
 * *output* type (which is what every `*FormValues` alias in `src/lib/validations`
 * is declared as, and therefore what `useForm<T>` is instantiated with).
 *
 * Why this wrapper exists instead of calling `zodResolver` directly:
 *
 * `@hookform/resolvers` types the Zod v4 overload as
 *   `zodResolver<T>(schema) => Resolver<z.input<T>, Context, z.output<T>>`
 * so the resolver's *field values* parameter is the schema's INPUT type. In Zod v4,
 * `z.coerce.number()` widens an input field to `unknown`, and `.default()` makes it
 * optional — e.g. `productSchema` has input `price?: unknown` but output
 * `price: number`. `Resolver` is contravariant in that parameter, so
 * `Resolver<{ price?: unknown }, ...>` is not assignable to the
 * `Resolver<{ price: number }, ...>` that `useForm<ProductFormValues>` demands
 * (TS2322: "Type 'unknown' is not assignable to type 'number'").
 *
 * Re-declaring `useForm` as `useForm<z.input<S>, unknown, z.output<S>>` would make
 * the types line up without a cast, but it then leaks `unknown` into every call
 * site — `watch("items")` would yield `quantity?: unknown` and the arithmetic in
 * CollectionForm would stop compiling — and it would force every `defaultValues` to
 * be written against the coerced input shape.
 *
 * So the mismatch is bridged here, once, with a single-purpose assertion that
 * re-anchors the resolver to the output type. At runtime this is exactly
 * `zodResolver(schema)`: validation, coercion, defaults and error paths are
 * untouched, and callers still get the parsed/coerced output values.
 */
export function formResolver<TValues extends FieldValues>(
  schema: ZodType<TValues, FieldValues>,
): Resolver<TValues> {
  return zodResolver(schema) as Resolver<TValues>
}