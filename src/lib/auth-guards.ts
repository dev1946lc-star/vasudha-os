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
    // Managers run the business day to day, which includes raising and issuing
    // bills. They were previously locked out of billing entirely while
    // accountants -- who per the spec are read-only on operations -- could
    // verify collections. Both halves of that were backwards.
    //
    // Owner-only settings (users, tax, company profile) stay closed.
    if (isSettings) {
      return false
    }
    return true
  }

  if (role === 'accountant') {
    // Accountants own the books: billing, payments, outstanding and reports. They
    // are read-only on operations -- no stock adjustments, and no verifying
    // someone else's delivery, which is a manager's sign-off.
    if (isSettings) {
      return false
    }
    if (pathname.startsWith('/inventory/add')) {
      return false
    }
    if (pathname.startsWith('/collections/new')) {
      return false
    }
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
