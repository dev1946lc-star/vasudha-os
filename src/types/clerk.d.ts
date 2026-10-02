import type { Role } from "@/lib/auth-guards"

/**
 * Clerk metadata shapes.
 *
 * `role` and `company_id` are read from the session claims by the API client and
 * the Rust API tenant header, and are written onto the Clerk user by
 * `resolveAccess` in src/lib/session-claims.ts.
 *
 * These live on **private** metadata, not public: private metadata is only
 * settable from the Backend API, whereas public metadata can be modified from the
 * frontend and must not be trusted for authorisation.
 */
declare module "@clerk/backend" {
  interface UserPrivateMetadata {
    role?: Role
    company_id?: string
  }
}

declare module "@clerk/types" {
  interface UserPrivateMetadata {
    role?: Role
    company_id?: string
  }
}