// src/lib/auth-guards.ts

// `revoked` is a real role in the database (migration 21) and must never be
// granted access to anything.
export type Role = 'owner' | 'manager' | 'agent' | 'accountant' | 'revoked'

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Owner can access everything
  if (role === 'owner') return true

  // A revoked account can access nothing, including the dashboard.
  if (role === 'revoked') return false

  // Money and receivables. A field agent has no reason to see market debt or
  // aging, and the RLS policies on invoices/payments already exclude them.
  const isBilling =
    pathname.startsWith('/billing') ||
    pathname.startsWith('/payments') ||
    pathname.startsWith('/outstanding')
  const isSettings = pathname.startsWith('/settings')
  
  if (role === 'manager') {
    // Managers cannot access billing endpoints or owner settings
    if (isBilling || isSettings) {
      return false
    }
    return true
  }

  if (role === 'accountant') {
    // Accountants cannot access operational collections/inventory edits or settings
    if (isSettings) {
      return false
    }
    // They can access billing, reports, dashboard
    return true
  }

  if (role === 'agent') {
    // Agents are field collectors: they record collections and view the route.
    // Adjusting stock is an owner/manager action (add_stock enforces the same in
    // the database), and invoicing, billing, reports and settings are closed to
    // them entirely.
    if (
      isBilling ||
      isSettings ||
      pathname.startsWith('/reports') ||
      pathname.startsWith('/inventory/add') ||
      pathname.startsWith('/invoices')
    ) {
      return false
    }
    return true
  }

  return false
}
