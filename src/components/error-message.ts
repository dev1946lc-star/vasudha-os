/**
 * Extracts a human-readable message from a caught `unknown`.
 *
 * Replaces the previous `catch (err: any) { err.message || fallback }` pattern.
 * Preserves the original intent — prefer the thrown error's `message`, otherwise
 * fall back to a default string — while being safe for thrown non-objects
 * (`throw null`, `throw "boom"`, etc.) and for `unknown` under `strict`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const { message } = err as { message?: unknown }
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }
  return fallback
}