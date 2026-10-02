import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

// Order matters only for readability of the output file; the backup is a plain
// dump, not a replay script.
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
] as const

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Must use the shared server client. The previous version built its own client
  // here without attaching the Clerk JWT, so every read was anonymous, RLS
  // denied all nine tables, and the download silently contained nine error
  // objects instead of data.
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

  // RLS scopes every row to the caller's company, so no explicit company_id
  // filter is needed here.
  if (failures.length > 0) {
    // Still return the partial dump so the user can see which tables came back,
    // but make the failure loud rather than shipping a file that looks valid.
    console.error(`Backup incomplete for ${failures.length}/${TABLES.length} tables`)
  }

  const stamp = new Date().toISOString().split('T')[0]

  return new NextResponse(JSON.stringify(backupData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="vasudha_os_backup_${stamp}.json"`,
      // The UI reads this to warn when the download is incomplete.
      'X-Backup-Incomplete-Tables': String(failures.length),
    },
  })
}