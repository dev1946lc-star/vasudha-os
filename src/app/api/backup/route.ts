import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { resolveAccess } from '@/lib/session-claims'

// Order matters for export readability and restore foreign-key dependency order.
const TABLES = [
  'companies',
  'profiles',
  'restaurants',
  'products',
  'inventory',
  'collections',
  'collection_items',
  'invoices',
  'payments',
  'stock_entries',
] as const

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = await createClient()

  const backupData: Record<string, unknown> = {}
  const failures: string[] = []

  const results = await Promise.all(
    TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select('*')
      return { table, data, error }
    }),
  )

  for (const { table, data, error } of results) {
    if (error) {
      console.error(`Error backing up table ${table}:`, error)
      failures.push(`${table}: ${error.message}`)
      backupData[table] = { error: error.message }
    } else {
      backupData[table] = data
    }
  }

  if (failures.length > 0) {
    console.error(`Backup incomplete for ${failures.length}/${TABLES.length} tables`)
  }

  const stamp = new Date().toISOString().split('T')[0]

  return new NextResponse(JSON.stringify(backupData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="vasudha_os_backup_${stamp}.json"`,
      'X-Backup-Incomplete-Tables': String(failures.length),
    },
  })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await resolveAccess(userId)
  if (!access || (access.role !== 'owner' && access.role !== 'manager')) {
    return NextResponse.json(
      { error: 'Forbidden: Only owners and managers can restore backups.' },
      { status: 403 }
    )
  }

  const companyId = access.company_id
  const supabase = await createClient()

  let backupPayload: Record<string, unknown>
  try {
    backupPayload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  // Restore order respecting foreign-key hierarchy
  const RESTORE_ORDER = [
    'restaurants',
    'products',
    'inventory',
    'collections',
    'collection_items',
    'invoices',
    'payments',
    'stock_entries',
  ] as const

  const restoredSummary: Record<string, number> = {}
  const errors: string[] = []

  for (const table of RESTORE_ORDER) {
    const rawData = backupPayload[table]
    if (!Array.isArray(rawData) || rawData.length === 0) {
      continue
    }

    // Tenant isolation: ensure company_id is forced to caller's company
    const sanitizedRows = rawData
      .filter((row): row is Record<string, unknown> => row && typeof row === 'object' && !('error' in row))
      .map((row) => {
        const sanitized = { ...row }
        if (table !== 'collection_items') {
          sanitized.company_id = companyId
        }
        return sanitized
      })

    if (sanitizedRows.length === 0) continue

    const { error, data } = await supabase
      .from(table)
      .upsert(sanitizedRows as never, { onConflict: 'id', ignoreDuplicates: false })
      .select('id')

    if (error) {
      console.error(`Error restoring table ${table}:`, error)
      errors.push(`${table}: ${error.message}`)
    } else {
      restoredSummary[table] = data?.length ?? sanitizedRows.length
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    restored: restoredSummary,
    errors,
  })
}