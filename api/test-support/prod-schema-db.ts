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
  const buf = db.serialize()
  db.close()
  return buf
}

/** A fresh in-memory database carrying the full migrated Hub schema. */
export function prodSchemaDb(): InstanceType<typeof Database> {
  if (!image) image = buildImage()
  return new Database(image)
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
} = {}) {
  function d1Error(e: unknown): Error {
    const err = e as { message?: string; code?: string }
    const code = err.code ?? 'SQLITE_ERROR'
    const base = code.startsWith('SQLITE_CONSTRAINT') ? 'SQLITE_CONSTRAINT' : 'SQLITE_ERROR'
    return new Error(`D1_ERROR: ${err.message}: ${base}${code !== base ? ` (extended: ${code})` : ''}`)
  }
  function exec(sql: string, vals: unknown[], mode: 'all' | 'run') {
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
      bind: (...more: unknown[]) => makeStmt(sql, [...vals, ...more]),
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
