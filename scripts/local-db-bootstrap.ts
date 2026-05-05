#!/usr/bin/env tsx
/**
 * Local D1 bootstrap — applies api/bootstrap-schema.sql + every api/schema-v*.sql
 * migration, in numeric version order, to the local Miniflare D1 instance.
 *
 * Usage:
 *   tsx scripts/local-db-bootstrap.ts
 *
 * Invokes wrangler with `--local --config=wrangler.local.toml` so nothing
 * ever hits prod D1.  Mirrors the env-stripping pattern from
 * scripts/seed/phase0-direct-sql.ts so wrangler falls back to OAuth for
 * d1:write scope on machines where CLOUDFLARE_API_TOKEN is pinned to Pages.
 *
 * Ordering rules:
 *   1. api/bootstrap-schema.sql runs first (base table definitions, IF NOT EXISTS).
 *   2. Migration files run in ascending numeric version order.
 *   3. When two migration files share the same version (e.g. schema-v22.sql
 *      and schema-v22-rename-columns.sql), the plain "schema-vN.sql" file
 *      always runs BEFORE any "schema-vN-*.sql" variant — the rename file
 *      depends on the base v22 file creating the table first.
 *
 * If any file fails to apply, bootstrap logs the error and exits non-zero.
 * D1 migration SQL is idempotent-ish (CREATE IF NOT EXISTS, ALTER guarded)
 * so re-running is safe.
 */

import { readdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const SCHEMA_DIR = join(REPO_ROOT, 'api')
const WRANGLER_CONFIG = join(REPO_ROOT, 'wrangler.local.toml')
const DB_NAME = 'mnccore-lab'
const LOCAL_D1_STATE = join(REPO_ROOT, '.wrangler/state/v3/d1')

type MigrationFile = { path: string; file: string; version: number; suffixRank: number }

/**
 * Migrations that are incompatible with fresh-schema bootstrap and must be
 * skipped when applying to a blank local D1.
 *
 * `schema-v22-rename-columns.sql` SELECTs legacy columns (`title`, `body`,
 * `author_slug`) from `lab_questions` and `lab_answers` that only ever
 * existed in prod-historical state.  `schema-v16.sql` creates those tables
 * with the FINAL post-rename schema (`question`, `context`, `asked_by`), so
 * a fresh bootstrap hits "no such column: title" on the SELECT step.  The
 * final prod schema is already correct after v16 runs — v22-rename is a
 * no-op for us.
 */
const FRESH_BOOTSTRAP_SKIP: ReadonlySet<string> = new Set([
  'schema-v22-rename-columns.sql',
  // bootstrap-schema.sql (base) already declares team_members.email; v43 ALTER
  // trips "duplicate column name: email" on a fresh bootstrap.  Prod
  // applied v43 as an ADD COLUMN because its schema predated the email
  // field — the base schema has since caught up.
  'schema-v43.sql',
  // v48 creates indexes on columns that are ADDED by v49 (action_items
  // .category, .parent_task_id).  Bootstrap order v48→v49 fails because
  // the columns don't exist yet.  v49 re-creates the same indexes (IF
  // NOT EXISTS) so skipping v48 for fresh bootstrap is safe.  Prod ran
  // v48 AFTER the columns were already present via a different path.
  'schema-v48-index-reconcile.sql',
])

function parseMigrationFile(file: string): MigrationFile | null {
  // Matches "schema-v22.sql" and "schema-v22-rename-columns.sql".
  const m = file.match(/^schema-v(\d+)(?:-([^.]+))?\.sql$/)
  if (!m) return null
  const version = parseInt(m[1]!, 10)
  // Base file (no suffix) runs before any variant at the same version.
  const suffixRank = m[2] ? 1 : 0
  return { path: join(SCHEMA_DIR, file), file, version, suffixRank }
}

function listMigrations(): MigrationFile[] {
  const entries = readdirSync(SCHEMA_DIR)
  const migrations: MigrationFile[] = []
  for (const f of entries) {
    const parsed = parseMigrationFile(f)
    if (parsed) migrations.push(parsed)
  }
  migrations.sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version
    return a.suffixRank - b.suffixRank
  })
  return migrations
}

function wranglerEnv(): NodeJS.ProcessEnv {
  // Strip the scoped API token + account id so wrangler falls through to its
  // OAuth credentials file (which has the broader d1 scope).  Same mitigation
  // used in scripts/seed/phase0-direct-sql.ts.
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  return env
}

function applySqlFile(absPath: string, label: string) {
  if (!existsSync(absPath)) {
    throw new Error(`${label}: file missing at ${absPath}`)
  }
  const forwardPath = absPath.replace(/\\/g, '/')
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --config="${WRANGLER_CONFIG.replace(/\\/g, '/')}" --file="${forwardPath}"`
  process.stdout.write(`  [apply] ${label} ... `)
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: wranglerEnv() })
    process.stdout.write('ok\n')
  } catch (e: any) {
    process.stdout.write('FAIL\n')
    const stderr = e?.stderr?.toString() ?? ''
    const stdout = e?.stdout?.toString() ?? ''
    console.error(`[local-db-bootstrap] ${label} failed.\ncmd: ${cmd}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
    throw e
  }
}

function run() {
  console.log('[local-db-bootstrap] applying schema + migrations to local D1')

  // 0. Wipe any existing local D1 state so migrations apply to a clean DB.
  //    D1 migrations are NOT idempotent — many use `ALTER TABLE ... ADD COLUMN`
  //    without `IF NOT EXISTS`, so re-running against a partially-migrated DB
  //    trips "duplicate column" errors.  Always start from scratch.
  if (existsSync(LOCAL_D1_STATE)) {
    console.log(`  [reset] wiping ${LOCAL_D1_STATE}`)
    rmSync(LOCAL_D1_STATE, { recursive: true, force: true })
  }

  // 1. Base bootstrap-schema.sql
  applySqlFile(join(SCHEMA_DIR, 'bootstrap-schema.sql'), 'bootstrap-schema.sql (base)')

  // 2. Migration files in version order
  const migrations = listMigrations()
  console.log(`[local-db-bootstrap] ${migrations.length} migration files discovered`)
  for (const m of migrations) {
    if (FRESH_BOOTSTRAP_SKIP.has(m.file)) {
      console.log(`  [skip]  ${m.file} — incompatible with fresh-schema bootstrap (see TESTING.md)`)
      continue
    }
    applySqlFile(m.path, `${m.file} (v${m.version}${m.suffixRank ? ' variant' : ''})`)
  }

  console.log('[local-db-bootstrap] done')
}

run()
