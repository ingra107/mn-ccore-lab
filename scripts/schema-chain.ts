// scripts/schema-chain.ts — the Hub's schema replay chain, as data.
//
// Which files a FRESH database applies, in what order, with which files
// skipped and which statements stripped. Two consumers read it:
//   - scripts/local-db-bootstrap.ts applies the chain to local D1 via wrangler;
//   - api/test-support/prod-schema-db.ts replays it into better-sqlite3 so the
//     API tests run on the migrated schema (#8842).
// No side effects on import: this module only reads files when called. It was
// split out of local-db-bootstrap.ts (#8842) so that script calls run()
// unconditionally; an "am I the entry file?" path comparison misfired
// through the C:\Users\ingra107 -> C:\Users\ingra junction.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SCHEMA_DIR = join(REPO_ROOT, 'api')
export const BOOTSTRAP_SCHEMA_PATH = join(SCHEMA_DIR, 'bootstrap-schema.sql')

export type MigrationFile = { path: string; file: string; version: number; suffixRank: number }

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
export const FRESH_BOOTSTRAP_SKIP: ReadonlySet<string> = new Set([
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
export const FRESH_BOOTSTRAP_STRIP_STATEMENTS: ReadonlyMap<string, RegExp[]> = new Map([
  [
    'schema-v46.sql',
    [/^CREATE INDEX IF NOT EXISTS idx_comments_project ON comments\(project_id, created_at DESC\);\s*$/m],
  ],
])

/**
 * The SQL a fresh bootstrap applies for this migration: the file's content,
 * minus any FRESH_BOOTSTRAP_STRIP_STATEMENTS patterns. Pure (no file writes),
 * so the API tests' prod-schema fixture (api/test-support/prod-schema-db.ts)
 * replays the SAME chain this script applies.
 */
export function freshBootstrapSql(m: MigrationFile): string {
  const original = readFileSync(m.path, 'utf8')
  const patterns = FRESH_BOOTSTRAP_STRIP_STATEMENTS.get(m.file)
  if (!patterns) return original
  let filtered = original
  for (const pattern of patterns) {
    if (!pattern.test(filtered)) {
      throw new Error(
        `[local-db-bootstrap] FRESH_BOOTSTRAP_STRIP_STATEMENTS pattern for ${m.file} matched nothing — ` +
        `the migration content changed since this rule was written; re-check scripts/schema-chain.ts.`
      )
    }
    filtered = filtered.replace(
      pattern,
      '-- [fresh-bootstrap] statement stripped — see FRESH_BOOTSTRAP_STRIP_STATEMENTS in scripts/schema-chain.ts'
    )
  }
  return filtered
}

export function parseMigrationFile(file: string): MigrationFile | null {
  // Matches "schema-v22.sql" and "schema-v22-rename-columns.sql".
  const m = file.match(/^schema-v(\d+)(?:-([^.]+))?\.sql$/)
  if (!m) return null
  const version = parseInt(m[1]!, 10)
  // Base file (no suffix) runs before any variant at the same version.
  const suffixRank = m[2] ? 1 : 0
  return { path: join(SCHEMA_DIR, file), file, version, suffixRank }
}

export function listMigrations(): MigrationFile[] {
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
