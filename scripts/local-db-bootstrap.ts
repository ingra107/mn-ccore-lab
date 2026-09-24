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
 * #511: all applicable files are concatenated into ONE combined SQL bundle
 * and applied via a single wrangler invocation (see applyBundle() below),
 * instead of one execSync spawn per file (~94-98 of them). The per-file loop hit a
 * Windows-only flake — fresh replay failed at random points with spurious
 * "no such table" on tables that verifiably existed a moment later — the
 * same rapid-fire-execSync libuv handle race that local-db-seed.ts already
 * batches around. A prior single-invocation ordered-bundle apply of the same
 * ~94 files proved clean (exit 0), which is why one bundle rather than
 * several smaller batches: bootstrap's migrations are pure DDL with no
 * cross-file id-mapping dependency (unlike seed.ts's INSERT batches, which
 * need intermediate flushes to capture minted ids), so there's no reason to
 * split further. If the bundle fails, the combined file is KEPT (not
 * deleted) so the `-- === <file> ===` marker nearest the reported error
 * identifies the source file.
 *
 * If applying the bundle fails, bootstrap logs the error and exits non-zero.
 * D1 migration SQL is idempotent-ish (CREATE IF NOT EXISTS, ALTER guarded)
 * so re-running is safe.
 */

import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

import {
  BOOTSTRAP_SCHEMA_PATH,
  FRESH_BOOTSTRAP_SKIP,
  FRESH_BOOTSTRAP_STRIP_STATEMENTS,
  freshBootstrapSql,
  listMigrations,
  type MigrationFile,
} from './schema-chain'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const WRANGLER_CONFIG = join(REPO_ROOT, 'wrangler.local.toml')
const DB_NAME = 'mnccore-lab'
const LOCAL_D1_STATE = join(REPO_ROOT, '.wrangler/state/v3/d1')
const STRIP_TMP_DIR = join(REPO_ROOT, '.wrangler', '_bootstrap-strip-tmp')

/**
 * Returns the path wrangler should apply for this migration: the original
 * file, unless it has FRESH_BOOTSTRAP_STRIP_STATEMENTS patterns, in which
 * case a filtered copy is written under STRIP_TMP_DIR (gitignored, .wrangler-
 * local only) with the incompatible statement(s) replaced by a comment.
 * Raises if a pattern matches nothing — a silently-stale pattern is worse
 * than a loud failure (the checked-in migration content may have changed).
 */
function resolveApplyPath(m: MigrationFile): string {
  if (!FRESH_BOOTSTRAP_STRIP_STATEMENTS.has(m.file)) return m.path
  const filtered = freshBootstrapSql(m)
  mkdirSync(STRIP_TMP_DIR, { recursive: true })
  const outPath = join(STRIP_TMP_DIR, m.file)
  writeFileSync(outPath, filtered, 'utf8')
  return outPath
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

// ---- Batched wrangler execution (#511) ----
// Mirrors local-db-seed.ts's batched-file pattern: queue every applicable
// file's SQL content, then apply the combined bundle in ONE wrangler
// invocation instead of one execSync spawn per file.
const BUNDLE_PATH = join(REPO_ROOT, '.wrangler', '_bootstrap-bundle.sql')
const bundleParts: string[] = []

function queueSqlFile(absPath: string, label: string) {
  if (!existsSync(absPath)) {
    throw new Error(`${label}: file missing at ${absPath}`)
  }
  const content = readFileSync(absPath, 'utf8')
  bundleParts.push(`-- === ${label} ===\n${content}`)
  console.log(`  [queue] ${label}`)
}

function applyBundle() {
  if (bundleParts.length === 0) return
  mkdirSync(dirname(BUNDLE_PATH), { recursive: true })
  writeFileSync(BUNDLE_PATH, bundleParts.join('\n\n'), 'utf8')
  const forwardPath = BUNDLE_PATH.replace(/\\/g, '/')
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --config="${WRANGLER_CONFIG.replace(/\\/g, '/')}" --file="${forwardPath}"` // wrangler-d1-allowed: --local Miniflare, no cloud auth
  process.stdout.write(`[local-db-bootstrap] applying bundle (${bundleParts.length} files, one invocation) ... `)
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: wranglerEnv() })
    process.stdout.write('ok\n')
  } catch (e: any) {
    process.stdout.write('FAIL\n')
    const stderr = e?.stderr?.toString() ?? ''
    const stdout = e?.stdout?.toString() ?? ''
    console.error(
      `[local-db-bootstrap] bundle apply failed.\ncmd: ${cmd}\nstdout:\n${stdout}\nstderr:\n${stderr}\n` +
      `Bundle kept at: ${BUNDLE_PATH} — find the last "-- === <file> ===" marker before the reported ` +
      `error/line to identify the source file.`
    )
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
  queueSqlFile(BOOTSTRAP_SCHEMA_PATH, 'bootstrap-schema.sql (base)')

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
    queueSqlFile(applyPath, `${m.file} (v${m.version}${m.suffixRank ? ' variant' : ''}${strippedNote})`)
  }

  // 3. Apply everything queued above in ONE wrangler invocation (#511).
  applyBundle()

  console.log('[local-db-bootstrap] done')
}

run()
