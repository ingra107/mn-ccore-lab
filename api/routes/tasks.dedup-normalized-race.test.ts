// The race-loser catch under the FOLDED key (#530b, 2026-09-02).
//
// The serial dedup SELECT runs before the winner's INSERT commits, so in a true
// race it finds nothing and both writers attempt an INSERT. The loser trips
// the partial UNIQUE name index and the catch re-queries. If that re-query used
// the raw title it could not find a differently-spelled winner, applyInsert
// would re-throw, processOne would record an `error`, and processed_mutations
// would replay that error for the same mutation_id -- a create lost for good.
// The catch was moved onto the folded key ONE DEPLOY AHEAD of the serial arm
// for exactly that reason; this file is what the bridge bought, kept after the
// cutover because the property it pins is permanent.
//
// Reconciled Dual-Plan (builder + mechanic + codex), Nick's GO 2026-09-02. Both
// codex and mechanic argued the superset property; neither ran it. This runs it.
//
// #8875: runs through handleMutations on the migration-chain database
// (api/test-support/prod-schema-db.ts). The first cut used a stub whose fold
// and whose "index" were JavaScript re-implementations, so a drift between the
// catch's SQL and the migrated index could not fail it. Here the index that
// refuses the loser is the one the chain builds, and the receipt is read back.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const fakeUser = { email: 'ingra107@umn.edu', role: 'admin' } as AuthUser
const TEST_API_KEY = 'test-dedup-normalized-race-api-key'

const WINNER_ID = 'task_01KQQ1SRTWBWREJY0SHPTE5RPJ'
const LOSER_ID = 'task_01KQQ1SRTWBWREJY0SHPTE5RXX'
const WINNER_TITLE = 'Approve: MECHANIC: I18'
const LOSER_TITLE = 'approve: mechanic: i18 '   // case + trailing space: raw-distinct, normalized-equal

let db: InstanceType<typeof Database>
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  db.prepare("INSERT OR REPLACE INTO lab_settings (key, value) VALUES ('hub_dedup_adoptable', '1')").run()
  insertRow(db, 'tasks', { id: WINNER_ID, title: WINNER_TITLE, project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' })
})

/**
 * The race window: the FIRST name-identity SELECT (the serial arm) answers "no
 * row", as it does in production when the winner's INSERT has not committed
 * yet. Every later SELECT -- the catch -- reads the real table, and the
 * loser's INSERT meets the real migrated index.
 */
function racingD1(raceWindow: boolean) {
  const base = d1Adapter(db)
  const seen: Array<'serial' | 'catch'> = []
  const DB = {
    ...base,
    prepare(sql: string) {
      const stmt = base.prepare(sql)
      if (classifyTaskDedupSelect(sql) !== 'title') return stmt
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrap = (s: any): any => ({
        ...s,
        bind: (...v: unknown[]) => wrap(s.bind(...v)),
        first: async () => {
          seen.push(seen.length === 0 ? 'serial' : 'catch')
          const real = await s.first()
          return seen.length === 1 && raceWindow ? null : real
        },
      })
      return wrap(stmt)
    },
  }
  return { DB, seen }
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

async function post(DB: unknown, mut: Mutation) {
  const { handleMutations } = await import('./mutations')
  const env = { DB, PB_API_KEY: TEST_API_KEY } as unknown as Env
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [mut] }),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
  })
  const resp = await handleMutations(req, fakeUser, env)
  return await resp.json() as { results: Array<{ status: string; reason?: string; canonical_id?: string }> }
}

const taskIds = () => (db.prepare('SELECT id FROM tasks ORDER BY id').all() as { id: string }[]).map((r) => r.id)

describe('#530b — the folded catch adopts a case-variant race loser', () => {
  it('the migrated index refuses the case variant outright (the race arbiter is real)', () => {
    expect(() => insertRow(db, 'tasks', { id: LOSER_ID, title: LOSER_TITLE, status: 'todo', priority: 'medium', assignee: 'nick-ingraham' }))
      .toThrow(/UNIQUE constraint failed/)
  })

  it('serial arm misses in the race window, the index fires, the catch adopts the winner', async () => {
    const { DB, seen } = racingD1(true)
    const body = await post(DB, loserMutation())

    // Adopted, not dead-lettered. A regression to status='error' here IS the
    // permanently-lost create this whole change exists to prevent.
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason).toContain('race-loser')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)

    // No second row: the case variant did not become a separate task.
    expect(taskIds()).toEqual([WINNER_ID])

    // The adoption settled a receipt, so a retry replays 'accepted', not an error.
    expect(receiptOf(db, 'mut_530b_bridge_0001')?.outcome).toBe('accepted')

    // Both arms ran, in order: the serial one saw the race window and missed,
    // the catch re-queried after the INSERT threw. A one-element list here
    // means the INSERT never fired and this is no longer a race test.
    expect(seen).toEqual(['serial', 'catch'])
  })

  it('with no race, the serial arm adopts the case variant and never INSERTs', async () => {
    // The ordinary path: two sequential creates. The serial arm folds the
    // title, finds the winner, and returns the adoptable response without ever
    // reaching the INSERT -- so the index is a backstop here, not the actor.
    const { DB, seen } = racingD1(false)
    const body = await post(DB, loserMutation())
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)
    expect(body.results[0].reason).not.toContain('race-loser')
    expect(seen).toEqual(['serial'])
    expect(taskIds()).toEqual([WINNER_ID])
  })

  it('an exact-title race still adopts — the folded key is a superset of the raw one', async () => {
    // The property the reconciliation leaned on: folding the key cannot lose a
    // case the byte-exact key handled.
    const { DB, seen } = racingD1(true)
    const mut = loserMutation()
    ;(mut.payload as Record<string, unknown>).title = WINNER_TITLE
    mut.mutation_id = 'mut_530b_bridge_exact_0001'

    const body = await post(DB, mut)
    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].canonical_id).toBe(WINNER_ID)
    expect(body.results[0].reason).toContain('race-loser')
    expect(seen).toEqual(['serial', 'catch'])
    expect(taskIds()).toEqual([WINNER_ID])
  })
})
