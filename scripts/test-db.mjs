// Applies the full migration chain to a throwaway postgres:16 container and runs
// the behavioural regression suite against it. Nothing touches any real database.
//
//   npm run test:db
//
// Requires Docker. Skips cleanly with exit 0 when Docker is unavailable, so this
// is safe to wire into `npm run verify` on a machine without it.

import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTAINER = 'vasudha-pg-test'
const IMAGE = 'postgres:16-alpine'

function dockerAvailable() {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function docker(args, { quiet = false } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })

  if (result.status !== 0) {
    if (!quiet) {
      process.stderr.write(result.stderr || '')
    }
    throw new Error(`docker ${args.join(' ')} failed with status ${result.status}`)
  }

  return result.stdout || ''
}

/** Pipes a SQL file into psql inside the container. Returns combined output. */
function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )

  if (result.status !== 0) {
    // Always surface the SQL error, even for the migrations where only successful
    // output is suppressed.
    process.stderr.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    throw new Error('psql failed — see the SQL error above')
  }

  // psql writes NOTICE to stderr, so both streams are needed to read the
  // assertions the regression suite emits.
  return `${result.stdout || ''}${result.stderr || ''}`
}

function psqlFile(path) {
  return psql(readFileSync(path, 'utf8'))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  if (!dockerAvailable()) {
    console.log('• Docker not available — skipping database tests.')
    return
  }

  console.log('• Starting throwaway postgres...')
  docker(['rm', '-f', CONTAINER], { quiet: true })
  docker(['run', '-d', '--name', CONTAINER,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-e', 'POSTGRES_DB=postgres',
    IMAGE], { quiet: true })

  // Wait for readiness. Two consecutive successes are required: on a fresh volume
  // the postgres entrypoint runs initdb, which starts a temporary server that
  // pg_isready reports as ready before shutting it down again to finish
  // initialising. Proceeding on the first success races that shutdown.
  let consecutive = 0
  for (let attempt = 0; attempt < 60; attempt++) {
    let ok = false
    try {
      docker(['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { quiet: true })
      ok = true
    } catch {
      ok = false
    }

    consecutive = ok ? consecutive + 1 : 0

    if (consecutive >= 2) break
    await sleep(1000)
  }

  if (consecutive < 2) throw new Error('postgres did not become ready in time')

  try {
    // Supabase provides the `auth` schema; vanilla postgres does not.
    console.log('• Bootstrapping the auth stub...')
    psqlFile('scripts/test-harness-auth-schema.sql')
    console.log('  auth schema ready')

    const migrationsDir = 'supabase/migrations'
    const migrations = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    console.log(`• Applying ${migrations.length} migrations...`)
    for (const name of migrations) {
      try {
        psqlFile(join(migrationsDir, name))
      } catch {
        console.error(`\n  Migration failed: ${name}`)
        process.exit(1)
      }
    }
    console.log(`  all ${migrations.length} migrations applied cleanly`)

    console.log('• Running behavioural checks...')
    const output = psqlFile('scripts/db-regression.sql')

    const passed = (output.match(/ok {2}/g) || []).length
    console.log(`  ${passed} checks passed`)

    console.log('\nDatabase tests passed.')
  } finally {
    docker(['rm', '-f', CONTAINER], { quiet: true })
  }
}

try {
  await main()
} catch (err) {
  console.error(`\nDatabase tests failed: ${err.message}`)
  process.exit(1)
}