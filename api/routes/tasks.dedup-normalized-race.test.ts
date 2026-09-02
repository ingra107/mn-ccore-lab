// The #530b cutover bridge: the race-loser catch is normalized ONE DEPLOY
// BEFORE the serial arm, and this is the test that says why.
//
// The dangerous window is not "before the index exists" — it is the window
// where idx_tasks_title_norm_project_active is LIVE and the serial dedup arm
// still matches the raw title:
//
//   1. a case / edge-space variant misses the serial (raw) SELECT;
//   2. its INSERT trips the normalized index;
//   3. the catch re-queries — and if the catch is ALSO raw, it cannot find the
//      differently-spelled winner, so applyInsert re-throws;
//   4. processOne records the mutation as an `error`, and processed_mutations
//      replays that error verbatim for the same mutation_id. The create is
//      permanently dead-lettered until a fresh mutation_id is minted.
//
// Moving the catch first closes it. Broadening the catch cannot reopen the race
// it guards, because every raw exact conflict is also a normalized match — the
// catch is a strict superset of what it was.
//
// Reconciled Dual-Plan (builder + mechanic + codex), Nick's GO 2026-09-02. Both
// codex and mechanic argued this superset property; neither ran it. This runs it.

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import {
  TASK_TITLE_KEY_SQL,
  TASK_TITLE_DEDUP_SELECT_RAW,
  classifyTaskDedupSelect,
} from '../lib/task-dedup-sql'

const fakeUser = { email: 'ingra107@umn.edu', role: 'admin' } as AuthUser
const TEST_API_KEY = 'test-dedup-normalized-race-api-key'

const WINNER_ID = 'task_01KQQ1SRTWBWREJY0SHPTE5RPJ'
const LOSER_ID = 'task_01KQQ1SRTWBWREJY0SHPTE5RXX'
const WINNER_TITLE = 'Approve: MECHANIC: I18'
const LOSER_TITLE = 'approve: mechanic: i18 '   // case + trailing space: raw-distinct, normalized-equal

function insertColumns(sql: string): string[] {
  const m = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i)
  return m ? m[1].split(',').map(s => s.trim()) : []
}

/**
 * A D1 stub in the exact cutover state: the NORMALIZED index is live, the
 * serial arm is still RAW, the catch is NORMALIZED.
 */
function makeCutoverStubDB() {
  const store = new Map<string, Record<string, unknown>>([
    [WINNER_ID, {
      id: WINNER_ID, title: WINNER_TITLE, project_id: null,
      status: 'todo', deleted_at: null, source: null, seq: 1,
    }],
  ])
  const seen: Array<'raw' | 'normalized'> = []

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (classifyTaskDedupSelect(sql) === 'title') {
          // Which arm is asking? The raw one compares the stored title byte for
          // byte; the normalized one folds both sides, exactly as SQLite would.
          const normalized = sql.includes(TASK_TITLE_KEY_SQL)
          seen.push(normalized ? 'normalized' : 'raw')
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const fold = (s: string) => s.toLowerCase().replace(/^ +| +$/g, '')
          for (const row of store.values()) {
            const rowTitle = row.title as string
            const hit = normalized
              ? fold(rowTitle) === fold(title)
              : rowTitle === title
            if (hit && (row.project_id ?? null) === projectId && !row.deleted_at && row.status !== 'done') {
              return { id: row.id } as T
            }
          }
          return null as T | null
        }
        if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
        return (store.get(boundVals[0] as string) ?? null) as T | null
      },

      all: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('FROM LAB_SETTINGS')) {
          return {
            results: [{ key: 'hub_dedup_adoptable', value: '1' }] as unknown as T[],
            success: true, meta: {},
          }
        }
        return { results: [] as T[], success: true, meta: {} }
      },

      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) return { meta: { changes: 1 } }
        if (upper.startsWith('INSERT INTO TASKS')) {
          const cols = insertColumns(sql)
          const row: Record<string, unknown> = { deleted_at: null, seq: 1 }
          cols.forEach((c, i) => { if (i < boundVals.length) row[c] = boundVals[i] })
          // The live normalized index: reject a row whose folded title collides
          // with an active non-done non-meeting row in the same project.
          const fold = (s: string) => String(s).toLowerCase().replace(/^ +| +$/g, '')
          for (const existing of store.values()) {
            if (
              fold(existing.title as string) === fold(row.title as string) &&
              (existing.project_id ?? null) === (row.project_id ?? null) &&
              !existing.deleted_at && existing.status !== 'done'
            ) {
              throw new Error(
                "D1_ERROR: UNIQUE constraint failed: index 'idx_tasks_title_norm_project_active'",
              )
            }
          }
          if (!('updated_at' in row)) row.updated_at = nowInstant()
          store.set(row.id as string, row)
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    _seen: () => seen,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => { for (const s of stmts) await s.run(); return [] },
  }
}

function loserMutation(): Mutation {
  return {
    mutation_id: 'mut_530b_bridge_0001',
    origin_machine: 'work',
    table: 'tasks',
    op: 'insert',
    record_id: LOSER_ID,
    base_seq: null,
    base_row_hash: null,
    payload: {
      title: LOSER_TITLE,
      project_id: null,
      status: 'todo',
      priority: 'medium',
      assignee: 'nick-ingraham',
      created_at: '2026-09-02T18:00:27.100Z',
    },
    client_ts: '2026-09-02T18:00:27.100Z',
    issued_at: '2026-09-02T18:00:27.100Z',
  } as Mutation
}

describe('#530b bridge — normalized catch adopts a raw-distinct race loser', () => {
  beforeEach(() => { _resetValidationFlagsCache() })

  it('serial RAW arm misses, the index fires, and the NORMALIZED catch adopts the winner', async () => {
    const db = makeCutoverStubDB()
    const { handleMutations } = await import('./mutations')
    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [loserMutation()] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })
    const resp = await handleMutations(req, fakeUser, env)
    const body = await resp.json() as {
      results: Array<{ status: string; reason?: string; canonical_id?: string }>
    }

    // Adopted, not dead-lettered. A regression to status='error' here IS the
    // permanently-lost create this bridge exists to prevent.
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason).toContain('race-loser')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)

    // No second row: the case variant did not become a separate task.
    expect(db._store.has(LOSER_ID)).toBe(false)
    expect(db._store.size).toBe(1)

    // The asymmetry is the point — assert BOTH arms ran and that they ran in
    // the cutover order (raw first, normalized second). If both were raw, the
    // second entry would say 'raw' and the adoption above could not happen.
    expect(db._seen()).toEqual(['raw', 'normalized'])
  })

  it('the raw arm alone would NOT have found the winner (the un-bridged failure)', async () => {
    // The counterfactual, stated as a fact about the SQL rather than as prose:
    // the pre-#530b catch compared titles byte for byte, so the loser's own
    // title is the only thing it could have matched, and no such row exists.
    const db = makeCutoverStubDB()
    const stmt = db.prepare(TASK_TITLE_DEDUP_SELECT_RAW).bind(LOSER_TITLE, null)
    expect(await stmt.first()).toBeNull()
    // ...while the winner IS present under the folded key.
    expect(db._store.get(WINNER_ID)!.title).toBe(WINNER_TITLE)
  })

  it('an exact-title race still adopts — the normalized catch is a superset', async () => {
    // The property the reconciliation leaned on: broadening the catch cannot
    // lose a case the narrow catch handled.
    const db = makeCutoverStubDB()
    const { handleMutations } = await import('./mutations')
    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env

    const mut = loserMutation()
    ;(mut.payload as Record<string, unknown>).title = WINNER_TITLE
    mut.mutation_id = 'mut_530b_bridge_exact_0001'

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })
    const body = await (await handleMutations(req, fakeUser, env)).json() as {
      results: Array<{ status: string; canonical_id?: string }>
    }
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)
    // Exact match: the SERIAL arm catches it, so the INSERT never runs.
    expect(db._seen()).toEqual(['raw'])
  })
})
