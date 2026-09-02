// The race-loser catch under the FOLDED key (#530b, 2026-09-02).
//
// The serial dedup SELECT runs before the winner's INSERT commits, so in a true
// race it finds nothing and both writers attempt an INSERT. The loser trips
// idx_tasks_title_norm_project_active and the catch re-queries. If that
// re-query used the raw title it could not find a differently-spelled winner,
// applyInsert would re-throw, processOne would record an `error`, and
// processed_mutations would replay that error for the same mutation_id -- a
// create lost for good. The catch was moved onto the folded key ONE DEPLOY
// AHEAD of the serial arm for exactly that reason; this file is what the bridge
// bought, kept after the cutover because the property it pins is permanent.
//
// Reconciled Dual-Plan (builder + mechanic + codex), Nick's GO 2026-09-02. Both
// codex and mechanic argued the superset property; neither ran it. This runs it.

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'

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
 * A D1 stub with the normalized index live and the race window open: the FIRST
 * name-identity SELECT (the serial arm) sees the pre-race state and misses, as
 * it does in production when the winner's INSERT has not committed yet. Every
 * later SELECT -- the catch -- reads the store honestly.
 */
function makeCutoverStubDB(raceWindow = true) {
  const store = new Map<string, Record<string, unknown>>([
    [WINNER_ID, {
      id: WINNER_ID, title: WINNER_TITLE, project_id: null,
      status: 'todo', deleted_at: null, source: null, seq: 1,
    }],
  ])
  const seen: Array<'serial' | 'catch'> = []

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (classifyTaskDedupSelect(sql) === 'title') {
          seen.push(seen.length === 0 ? 'serial' : 'catch')
          // The race window: the serial arm runs before the winner's INSERT is
          // visible, so it misses even though the winner exists.
          if (seen.length === 1 && raceWindow) return null as T | null
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const fold = (s: string) => s.toLowerCase().replace(/^ +| +$/g, '')
          for (const row of store.values()) {
            if (
              fold(row.title as string) === fold(title) &&
              (row.project_id ?? null) === projectId &&
              !row.deleted_at && row.status !== 'done'
            ) {
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

describe('#530b — the folded catch adopts a case-variant race loser', () => {
  beforeEach(() => { _resetValidationFlagsCache() })

  it('serial arm misses in the race window, the index fires, the catch adopts the winner', async () => {
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
    // permanently-lost create this whole change exists to prevent.
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason).toContain('race-loser')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)

    // No second row: the case variant did not become a separate task.
    expect(db._store.has(LOSER_ID)).toBe(false)
    expect(db._store.size).toBe(1)

    // Both arms ran, in order: the serial one saw the race window and missed,
    // the catch re-queried after the INSERT threw. A one-element list here
    // means the INSERT never fired and this is no longer a race test.
    expect(db._seen()).toEqual(['serial', 'catch'])
  })

  it('with no race, the serial arm adopts the case variant and never INSERTs', async () => {
    // The ordinary path: two sequential creates. The serial arm folds the
    // title, finds the winner, and returns the adoptable response without ever
    // reaching the INSERT -- so the index is a backstop here, not the actor.
    const db = makeCutoverStubDB(false)
    const { handleMutations } = await import('./mutations')
    const env = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env

    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [loserMutation()] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })
    const body = await (await handleMutations(req, fakeUser, env)).json() as {
      results: Array<{ status: string; reason?: string; canonical_id?: string }>
    }
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)
    expect(body.results[0].reason).not.toContain('race-loser')
    expect(db._seen()).toEqual(['serial'])
    expect(db._store.size).toBe(1)
  })

  it('an exact-title race still adopts — the folded key is a superset of the raw one', async () => {
    // The property the reconciliation leaned on: folding the key cannot lose a
    // case the byte-exact key handled.
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
    expect(body.results[0].reason).toContain('race-loser')
    expect(db._seen()).toEqual(['serial', 'catch'])
  })
})
