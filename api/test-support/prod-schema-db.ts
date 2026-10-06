// Test support only: never imported by the Worker.
//
// #8842: a fresh better-sqlite3 database built by replaying the SAME schema
// chain `npm run test:local:setup` applies to local D1 (bootstrap-schema.sql
// + every api/schema-v*.sql in version order, with the fresh-bootstrap skip
// and strip rules imported from scripts/schema-chain.ts, which
// scripts/local-db-bootstrap.ts also reads; nothing is copied).
//
// Why it exists: the first cut of the #8842 commit door passed a hand-rolled
// fixture whose processed_mutations.original_response_json was nullable. Prod
// declares it TEXT NOT NULL (schema-v58), so every landing write would have
// rolled back in prod. A fixture derived from the migration chain cannot
// drift from the migrations; a column constraint, CHECK or trigger in the
// chain is in the test DB too. It does NOT prove prod applied every
// migration: the deploy plan's Step 0 reads prod sqlite_master for that.
//
// Built once per test worker and cloned per call (serialize/deserialize).
//
// Contract (#8862, pinned by api/test-support/prod-schema-db.test.ts):
//   - every clone enforces foreign keys, as D1 does on every query. The
//     connection setting is not stored in the image; prodSchemaDb() sets it
//     and throws if it does not read back as 1, so an FK-off clone cannot be
//     handed out. (Evidence D1 enforces: scripts/p2_hub_rekey_apply.py records
//     a prod delete refused by an FK a local SQLite dry run had let through.)
//   - the built image passes PRAGMA foreign_key_check (rows the chain seeds
//     are consistent);
//   - clones are independent of each other and of the image;
//   - d1Adapter's batch() is one transaction: a failing statement rolls back
//     every earlier statement of the same batch, as D1's does.
// Write-path tests use this fixture, not a hand-written schema or a stub that
// simulates SQL; scripts/check-api-test-fixtures.mjs refuses new ones.

import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import {
  BOOTSTRAP_SCHEMA_PATH,
  FRESH_BOOTSTRAP_SKIP,
  freshBootstrapSql,
  listMigrations,
} from '../../scripts/schema-chain'

let image: Buffer | null = null

function buildImage(): Buffer {
  const db = new Database(':memory:')
  db.exec(readFileSync(BOOTSTRAP_SCHEMA_PATH, 'utf8'))
  for (const m of listMigrations()) {
    if (FRESH_BOOTSTRAP_SKIP.has(m.file)) continue
    try {
      db.exec(freshBootstrapSql(m))
    } catch (e) {
      throw new Error(`prod-schema-db: ${m.file} failed to apply: ${(e as Error).message}`)
    }
  }
  const violations = db.pragma('foreign_key_check') as unknown[]
  if (violations.length > 0) {
    throw new Error(`prod-schema-db: the migrated image fails foreign_key_check: ${JSON.stringify(violations.slice(0, 5))}`)
  }
  const buf = db.serialize()
  db.close()
  return buf
}

/** A fresh in-memory database carrying the full migrated Hub schema, FKs enforced. */
export function prodSchemaDb(): InstanceType<typeof Database> {
  if (!image) image = buildImage()
  const db = new Database(image)
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('prod-schema-db: foreign_keys did not read back ON; D1 enforces foreign keys')
  }
  return db
}

/**
 * Insert one row with the named columns and return the stored row, so a test
 * sees what the schema's defaults and triggers made of it (seq included).
 */
export function insertRow(
  db: InstanceType<typeof Database>, table: string, row: Record<string, unknown>,
): Record<string, unknown> {
  const cols = Object.keys(row)
  const info = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  ).run(...cols.map((c) => row[c]))
  return db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`).get(info.lastInsertRowid) as Record<string, unknown>
}

/** The processed_mutations receipt for a mutation id, or undefined. */
export function receiptOf(db: InstanceType<typeof Database>, mutationId: string) {
  return db.prepare(
    'SELECT outcome, original_response_json, table_name, record_id FROM processed_mutations WHERE mutation_id = ?',
  ).get(mutationId) as
    | { outcome: string; original_response_json: string; table_name: string; record_id: string }
    | undefined
}

/**
 * A D1-shaped adapter over better-sqlite3: prepare/bind/first/all/run, and a
 * batch() that is ONE transaction, as D1's is. Errors carry D1's message
 * form, measured on workerd 2026-09-23:
 *   "D1_ERROR: <sqlite text>: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)"
 * so code that classifies D1 errors sees what prod sends.
 */
export function d1Adapter(db: InstanceType<typeof Database>, hooks: {
  failSql?: RegExp; failTimes?: number; beforeBatch?: () => void
  /** Called with every statement the engine executes, before it runs. */
  onExec?: (sql: string, vals: unknown[]) => void
} = {}) {
  function d1Error(e: unknown): Error {
    const err = e as { message?: string; code?: string }
    const code = err.code ?? 'SQLITE_ERROR'
    const base = code.startsWith('SQLITE_CONSTRAINT') ? 'SQLITE_CONSTRAINT' : 'SQLITE_ERROR'
    return new Error(`D1_ERROR: ${err.message}: ${base}${code !== base ? ` (extended: ${code})` : ''}`)
  }
  // D1 refuses an `undefined` bind value (workerd's bind() throws
  // "D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'"),
  // while better-sqlite3 silently stores it as NULL. Without this check a
  // route that forgets `?? null` passes every test on this fixture and fails
  // in prod (#8875 cold review). Checked at bind time, as D1 does, and again
  // at exec so no path into the engine (first/all/run/batch) skips it.
  function assertNoUndefined(vals: unknown[]) {
    const i = vals.findIndex((v) => v === undefined)
    if (i !== -1) {
      throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined' (bind position ${i + 1})`)
    }
  }
  function exec(sql: string, vals: unknown[], mode: 'all' | 'run') {
    assertNoUndefined(vals)
    hooks.onExec?.(sql, vals)
    if (hooks.failSql && hooks.failSql.test(sql) && (hooks.failTimes ?? 0) > 0) {
      hooks.failTimes = (hooks.failTimes ?? 0) - 1
      throw new Error('D1_ERROR: simulated D1 failure: SQLITE_ERROR')
    }
    try {
      const stmt = db.prepare(sql)
      if (mode === 'all' && stmt.reader) return { results: stmt.all(...vals), success: true, meta: {} }
      const info = stmt.run(...vals)
      return { results: [], success: true, meta: { changes: info.changes } }
    } catch (e) {
      if ((e as Error).message?.startsWith('D1_ERROR')) throw e
      throw d1Error(e)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeStmt(sql: string, vals: unknown[]): any {
    return {
      sql, vals,
      bind: (...more: unknown[]) => { assertNoUndefined(more); return makeStmt(sql, [...vals, ...more]) },
      first: async () => (exec(sql, vals, 'all').results[0] as unknown) ?? null,
      all: async () => exec(sql, vals, 'all'),
      run: async () => exec(sql, vals, 'run'),
    }
  }
  return {
    prepare: (sql: string) => makeStmt(sql, []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    batch: async (stmts: any[]) => {
      hooks.beforeBatch?.()
      return db.transaction(() => stmts.map((s) => exec(s.sql, s.vals, 'all')))()
    },
  }
}
