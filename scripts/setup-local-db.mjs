import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTAINER = 'vasudha-postgres'

function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    throw new Error('psql failed — see error above')
  }

  return `${result.stdout || ''}${result.stderr || ''}`
}

async function main() {
  console.log('1. Setting up auth schema and roles...')
  const authSql = readFileSync('scripts/test-harness-auth-schema.sql', 'utf8')
  const rolesSql = `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END
    $$;
  `
  psql(authSql + '\n' + rolesSql)
  console.log('   Auth schema and roles created.')

  console.log('2. Applying 27 migrations...')
  const migDir = 'supabase/migrations'
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8')
    psql(sql)
  }
  console.log('   All migrations applied.')

  console.log('3. Applying API fixture data...')
  const fixtureSql = readFileSync('scripts/api-fixture.sql', 'utf8')
  psql(fixtureSql)
  console.log('   Fixture data loaded.')

  console.log('4. Linking Clerk users as Owners...')
  const linkUsersSql = `
    INSERT INTO public.profiles (id, company_id, role, name)
    VALUES
      ('user_3K64lSqoBijqd4orpvoRvr433gX', '11111111-1111-1111-1111-111111111111', 'owner', 'Demo Owner'),
      ('user_3Hp4JvXRtyMajsEv5s7E8vS2y0N', '11111111-1111-1111-1111-111111111111', 'owner', 'Anish Kumar')
    ON CONFLICT (id) DO UPDATE
      SET company_id = EXCLUDED.company_id,
          role = EXCLUDED.role,
          name = EXCLUDED.name;

    INSERT INTO public.clerk_metadata (clerk_user_id, company_id, role, is_active)
    VALUES
      ('user_3K64lSqoBijqd4orpvoRvr433gX', '11111111-1111-1111-1111-111111111111', 'owner', TRUE),
      ('user_3Hp4JvXRtyMajsEv5s7E8vS2y0N', '11111111-1111-1111-1111-111111111111', 'owner', TRUE)
    ON CONFLICT (clerk_user_id) DO UPDATE
      SET company_id = EXCLUDED.company_id,
          role = EXCLUDED.role,
          is_active = EXCLUDED.is_active;

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  `
  psql(linkUsersSql)
  console.log('   Clerk users linked successfully.')
  console.log('Local Postgres initialized and ready!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
