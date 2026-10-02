import { canAccessRoute } from "./auth-guards.ts"
import * as assert from "assert"

function runTests() {
  console.log("Running Route Guard Tests...\n")

  // Test Manager Constraints
  assert.strictEqual(canAccessRoute('manager', '/billing'), true, "Manager should access /billing")
  assert.strictEqual(canAccessRoute('manager', '/settings'), false, "Manager should NOT access /settings")
  assert.strictEqual(canAccessRoute('manager', '/dashboard'), true, "Manager should access /dashboard")
  assert.strictEqual(canAccessRoute('manager', '/collections'), true, "Manager should access /collections")
  console.log("✅ Manager constraints passed")

  // Test Owner Constraints
  assert.strictEqual(canAccessRoute('owner', '/billing'), true, "Owner should access /billing")
  assert.strictEqual(canAccessRoute('owner', '/settings'), true, "Owner should access /settings")
  console.log("✅ Owner constraints passed")

  // Test Accountant Constraints
  assert.strictEqual(canAccessRoute('accountant', '/billing'), true, "Accountant should access /billing")
  assert.strictEqual(canAccessRoute('accountant', '/reports'), true, "Accountant should access /reports")
  assert.strictEqual(canAccessRoute('accountant', '/settings'), false, "Accountant should NOT access /settings")
  console.log("✅ Accountant constraints passed")

  // Test Agent Constraints
  assert.strictEqual(canAccessRoute('agent', '/collections'), true, "Agent should access /collections")
  assert.strictEqual(canAccessRoute('agent', '/inventory'), true, "Agent should view /inventory")
  assert.strictEqual(canAccessRoute('agent', '/billing'), false, "Agent should NOT access /billing")
  assert.strictEqual(canAccessRoute('agent', '/settings'), false, "Agent should NOT access /settings")
  assert.strictEqual(canAccessRoute('agent', '/reports'), false, "Agent should NOT access /reports")
  // add_stock is owner/manager-only in the database, so the UI must agree.
  assert.strictEqual(canAccessRoute('agent', '/inventory/add'), false, "Agent should NOT access /inventory/add")
  assert.strictEqual(canAccessRoute('agent', '/invoices/generate'), false, "Agent should NOT access /invoices")
  assert.strictEqual(canAccessRoute('manager', '/inventory/add'), true, "Manager should access /inventory/add")
  assert.strictEqual(canAccessRoute('owner', '/inventory/add'), true, "Owner should access /inventory/add")
  console.log("✅ Agent constraints passed")

  // Test Revoked Constraints — a revoked account reaches nothing at all.
  assert.strictEqual(canAccessRoute('revoked', '/dashboard'), false, "Revoked should NOT access /dashboard")
  assert.strictEqual(canAccessRoute('revoked', '/collections'), false, "Revoked should NOT access /collections")
  assert.strictEqual(canAccessRoute('revoked', '/billing'), false, "Revoked should NOT access /billing")
  assert.strictEqual(canAccessRoute('revoked', '/settings'), false, "Revoked should NOT access /settings")
  console.log("✅ Revoked constraints passed")

  console.log("\nAll frontend route guard tests passed successfully!")
}

runTests()
