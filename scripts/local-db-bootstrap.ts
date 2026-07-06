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

import { readdirSync, existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const SCHEMA_DIR = join(REPO_ROOT, 'api')
const WRANGLER_CONFIG = join(REPO_ROOT, 'wrangler.local.toml')
const DB_NAME = 'mnccore-lab'
const LOCAL_D1_STATE = join(REPO_ROOT, '.wrangler/state/v3/d1')
const STRIP_TMP_DIR = join(REPO_ROOT, '.wrangler', '_bootstrap-strip-tmp')

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
  // schema-v48.sql is the superseded MONOLITH — never applied to prod as-is.
  // Prod split it into schema-v48-stage3-8tables.sql + schema-v49-pomodoro-
  // rename.sql (both still applied below).  The monolith's
  // `CREATE INDEX idx_pomodoro_machine ON pomodoro_sessions(machine_id)` is a
  // no-op-then-fail on a fresh bootstrap: v20 already created pomodoro_sessions
  // WITHOUT machine_id, so the CREATE TABLE IF NOT EXISTS is skipped and the
  // index throws "no such column: machine_id", aborting the whole chain (which
  // is why blocked_by from v49 never landed → GET /api/tasks 500). Skip it.
  'schema-v48.sql',
  // bootstrap-schema.sql (base) already declares launch_log.expires_at +
  // .consumed_at (mirrored in a915e9fa, 2026-07-06, to fix the claim WHERE
  // clause on a fresh bootstrap). v91's two ADD COLUMN statements are now
  // fully redundant with that mirror and trip "duplicate column name:
  // expires_at" on a fresh bootstrap. Prod applied v91 as an ALTER because
  // its schema predated both columns — the base schema has since caught up
  // (same class as schema-v43.sql above; found while fixing #492).
  'schema-v91.sql',
  // bootstrap-schema.sql (base) already declares launch_log.task_id (mirrored
  // in the SAME commit as this migration, d48290b5, 2026-07-06, #485). The
  // mirror + the ADD COLUMN both landed together but nobody registered the
  // now-redundant ALTER for fresh bootstrap, so it trips "duplicate column
  // name: task_id" — a fresh bootstrap never runs in CI, so this went
  // unnoticed same-day. Same class as v91/v43 above (found while fixing
  // #492; 3rd occurrence of this class in one session — see #492 report for
  // the systemic recommendation).
  'schema-v93-launch-log-task-id.sql',
])

/**
 * Unlike FRESH_BOOTSTRAP_SKIP (drops an entire file), these files have ONE
 * OR MORE statements that are individually incompatible with fresh-schema
 * bootstrap while the REST of the file remains valid and non-redundant —
 * skipping the whole file would silently lose real, unique-elsewhere index
 * coverage. Each pattern is stripped from a copy of the file (the checked-in
 * migration is never touched) before applying.
 *
 * schema-v46.sql: `idx_comments_project ON comments(...)`. The `comments`
 * table was physically dropped from prod D1 in schema-v78 (2026-06-10), then
 * its CREATE TABLE block was removed from api/bootstrap-schema.sql on
 * 2026-06-14 (commit d20d70e9, docs/2026-06-14-retire-legacy-d1-twins-and-
 * my-tasks-legacy.md) because it was dead weight with zero live handlers.
 * `comments` was the ONLY one of the four schema-v78-dropped tables that was
 * ever created by bootstrap-schema.sql directly rather than by a numbered
 * migration (task_comments/v8, task_updates/v36, project_updates/v2 all
 * still exist earlier in the fresh-bootstrap replay chain, so their v46
 * indexes apply fine) — so on a fresh bootstrap `comments` never exists at
 * all, and v46's index on it 404s with "no such table: main.comments". The
 * other 8 statements in v46 are real, non-redundant indexes on tables that
 * are still present at that point in the replay and must still apply.
 */
const FRESH_BOOTSTRAP_STRIP_STATEMENTS: ReadonlyMap<string, RegExp[]> = new Map([
  [
    'schema-v46.sql',
    [/^CREATE INDEX IF NOT EXISTS idx_comments_project ON comments\(project_id, created_at DESC\);\s*$/m],
  ],
])

/**
 * Returns the path wrangler should apply for this migration: the original
 * file, unless it has FRESH_BOOTSTRAP_STRIP_STATEMENTS patterns, in which
 * case a filtered copy is written under STRIP_TMP_DIR (gitignored, .wrangler-
 * local only) with the incompatible statement(s) replaced by a comment.
 * Raises if a pattern matches nothing — a silently-stale pattern is worse
 * than a loud failure (the checked-in migration content may have changed).
 */
function resolveApplyPath(m: MigrationFile): string {
  const patterns = FRESH_BOOTSTRAP_STRIP_STATEMENTS.get(m.file)
  if (!patterns) return m.path

  const original = readFileSync(m.path, 'utf8')
  let filtered = original
  for (const pattern of patterns) {
    if (!pattern.test(filtered)) {
      throw new Error(
        `[local-db-bootstrap] FRESH_BOOTSTRAP_STRIP_STATEMENTS pattern for ${m.file} matched nothing — ` +
        `the migration content changed since this rule was written; re-check scripts/local-db-bootstrap.ts.`
      )
    }
    filtered = filtered.replace(
      pattern,
      '-- [fresh-bootstrap] statement stripped — see FRESH_BOOTSTRAP_STRIP_STATEMENTS in scripts/local-db-bootstrap.ts'
    )
  }
  mkdirSync(STRIP_TMP_DIR, { recursive: true })
  const outPath = join(STRIP_TMP_DIR, m.file)
  writeFileSync(outPath, filtered, 'utf8')
  return outPath
}

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
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --config="${WRANGLER_CONFIG.replace(/\\/g, '/')}" --file="${forwardPath}"` // wrangler-d1-allowed: --local Miniflare, no cloud auth
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
  //
  //    Windows gotcha: if `wrangler dev --local` is running, it holds a SQLite
  //    lock on the .sqlite file inside this directory and rmSync will throw EBUSY.
  //    Stop all wrangler dev processes before running test:local:setup on Windows.
  if (existsSync(LOCAL_D1_STATE)) {
    console.log(`  [reset] wiping ${LOCAL_D1_STATE}`)
    try {
      rmSync(LOCAL_D1_STATE, { recursive: true, force: true })
    } catch (e: any) {
      if (e?.code === 'EBUSY') {
        console.error(
          `[local-db-bootstrap] ERROR: cannot wipe ${LOCAL_D1_STATE} — file is locked.\n` +
          `  Stop all running 'wrangler dev --local' processes first, then re-run.\n` +
          `  (On Windows, wrangler dev holds a SQLite lock that blocks directory removal.)`
        )
        process.exit(1)
      }
      throw e
    }
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
    const applyPath = resolveApplyPath(m)
    const strippedNote = applyPath !== m.path ? ', statement stripped' : ''
    applySqlFile(applyPath, `${m.file} (v${m.version}${m.suffixRank ? ' variant' : ''}${strippedNote})`)
  }

  console.log('[local-db-bootstrap] done')
}

run()
