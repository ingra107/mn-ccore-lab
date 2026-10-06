// I18 dedup regression tests (2026-05-03)
//
// Covers server-side (title, project_id) dedup via:
//   1. mutations.ts applyInsert — via the exported handleMutations path
//   2. handleMobileTasksToHub's (title, project_id) pre-check
// (sync-bulk path deleted 2026-05-12; codex audit #8)
//
// Covers the four edge cases from the incident spec:
//   - Dedup fires on same (title, project_id) both null
//   - No dedup when project_id differs
//   - No dedup against deleted rows
//   - No dedup against done rows
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut answered the dedup SELECTs with JavaScript matchers, modelled
// the partial UNIQUE index as a hand-written throw, and kept a "regression
// proof" that only showed its own index-less stub accepting two rows. Here the
// index is the one the chain builds, the race test counts the INSERTs the
// engine really attempted, and the index-less proof is replaced by the index
// itself refusing the duplicate.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const fakeUser: AuthUser = { email: 'test@example.com', role: 'admin', name: 'Test User' } as unknown as AuthUser
const TEST_API_KEY = 'test-dedup-api-key' // M07: handleMutations requires PI/API-key auth

let db: InstanceType<typeof Database>
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
})

function seedProject(id: string) {
  insertRow(db, 'projects', { id, slug: id.replace(/_/g, '-').toLowerCase(), title: id, category: 'MNCCORE' })
}
function seedTask(row: Record<string, unknown>) {
  insertRow(db, 'tasks', { priority: 'medium', assignee: 'nick-ingraham', project_id: null, status: 'todo', ...row })
}
const has = (id: string) => db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id) !== undefined
const idsTitled = (title: string) =>
  (db.prepare('SELECT id FROM tasks WHERE title = ? ORDER BY id').all(title) as { id: string }[]).map((r) => r.id)

function insertMut(id: string, mutationId: string, payload: Record<string, unknown>, origin = 'home'): Mutation {
  return {
    mutation_id: mutationId,
    origin_machine: origin,
    table: 'tasks',
    op: 'insert',
    record_id: id,
    base_seq: null,
    base_row_hash: null,
    payload: { project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', created_at: nowInstant(), ...payload },
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  } as Mutation
}

async function post(DB: unknown, mut: Mutation) {
  const { handleMutations } = await import('./mutations')
  const fakeEnv = { DB, PB_API_KEY: TEST_API_KEY } as unknown as Env
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [mut] }),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
  })
  const resp = await handleMutations(req, fakeUser, fakeEnv)
  const body = await resp.json() as { results: Array<{ status: string; reason?: string; canonical_id?: string; canonical_payload?: Record<string, unknown> }> }
  return body.results[0]
}

// ── mutations.ts applyInsert dedup tests ────────────────────────────────────

describe('mutations.ts applyInsert — I18 (title, project_id) dedup', () => {
  it('deduped: same title + same null project_id returns accepted with reason', async () => {
    const existingId = 'task_existing_001'
    seedTask({ id: existingId, title: 'Approve: MECHANIC: I3' })

    const r = await post(d1Adapter(db), insertMut('task_new_dup_0001', 'mut_dedup_test_0001', { title: 'Approve: MECHANIC: I3' }, 'work'))

    expect(r.status).toBe('accepted')
    expect(r.reason).toContain('deduped')
    expect(r.reason).toContain(existingId)
    expect(r.canonical_payload?.id).toBe(existingId)
    // New row should NOT have been inserted
    expect(has('task_new_dup_0001')).toBe(false)
    expect(idsTitled('Approve: MECHANIC: I3')).toEqual([existingId])
    expect(receiptOf(db, 'mut_dedup_test_0001')?.outcome).toBe('accepted')
  })

  it('no-dedup: same title but different non-null project_id — inserts normally', async () => {
    seedProject('proj_alpha')
    seedProject('proj_beta')
    seedTask({ id: 'task_proj_a', title: 'Write draft', project_id: 'proj_alpha' })

    const r = await post(d1Adapter(db), insertMut('task_proj_b_new', 'mut_dedup_test_0002', { title: 'Write draft', project_id: 'proj_beta' }))

    expect(r.status).toBe('accepted')
    // Should NOT have the dedup reason
    expect(r.reason ?? '').not.toContain('deduped')
    // New row should have been inserted, in its own project
    expect(idsTitled('Write draft')).toEqual(['task_proj_a', 'task_proj_b_new'])
    expect(db.prepare('SELECT project_id FROM tasks WHERE id = ?').get('task_proj_b_new')).toEqual({ project_id: 'proj_beta' })
  })

  it('no-dedup against deleted row — soft-deleted task does not block new insert', async () => {
    seedTask({ id: 'task_deleted_old', title: 'Reply to Abbie', status: 'deleted', deleted_at: '2026-05-01 10:00:00', last_mutation_id: 'mut_prev' })

    const r = await post(d1Adapter(db), insertMut('task_new_reply', 'mut_dedup_test_0003', { title: 'Reply to Abbie' }))

    expect(r.status).toBe('accepted')
    expect(r.reason ?? '').not.toContain('deduped')
    expect(idsTitled('Reply to Abbie')).toEqual(['task_deleted_old', 'task_new_reply'])
  })

  it('no-dedup against done row — completed task does not block a new task of same name', async () => {
    seedTask({ id: 'task_done_old', title: 'Weekly review', status: 'done', completed: 1, completed_at: '2026-05-01T10:00:00Z', last_mutation_id: 'mut_completed' })

    const r = await post(d1Adapter(db), insertMut('task_new_weekly', 'mut_dedup_test_0004', { title: 'Weekly review' }))

    expect(r.status).toBe('accepted')
    expect(r.reason ?? '').not.toContain('deduped')
    expect(idsTitled('Weekly review')).toEqual(['task_done_old', 'task_new_weekly'])
  })
})

// ── Concurrent-race tests (partial index backstop) ──────────────────────────
//
//   T=0  machine-home  SELECT → no row found (winner not yet inserted)
//   T=0  machine-work  SELECT → no row found (same empty state)
//   T=1  machine-home  INSERT → succeeds (first writer wins)
//   T=1  machine-work  INSERT → partial index fires (UNIQUE violation)
//
// The migrated partial UNIQUE index (today idx_tasks_title_norm_nonrecurring_active,
// schema-v113) makes this structural: the race-loser INSERT throws a constraint
// error. applyInsert's catch re-queries by the same key and, when the winner is
// now visible, returns the SAME adoptable `accepted` + canonical_id response as
// the serial path (reason prefixed "deduped (race-loser)").

/** Both serial name-identity SELECTs miss (the race window); INSERT attempts on tasks are counted. */
function raceWindowD1() {
  let titleSelects = 0
  let taskInserts = 0
  const base = d1Adapter(db, {
    onExec: (sql) => { if (/^\s*INSERT INTO tasks\b/i.test(sql)) taskInserts++ },
  })
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
          titleSelects++
          const real = await s.first()
          // Selects 1 (home serial) and 2 (work serial) see the pre-race state;
          // 3 is the work catch's re-query, which reads honestly.
          return titleSelects <= 2 ? null : real
        },
      })
      return wrap(stmt)
    },
  }
  return { DB, taskInserts: () => taskInserts, titleSelects: () => titleSelects }
}

describe('partial index race backstop — concurrent dup INSERT (18:00:27 shape)', () => {
  // Regression test for the 2026-05-03 18:00:27 incident: both home + work
  // pushed "Approve: MECHANIC: I18 — 0p+19t" near-simultaneously, and both
  // passed the serial SELECT before either INSERT landed.
  it('test_partial_index_catches_concurrent_dup_insert_race: loser adopts winner via race-loser catch', async () => {
    const { DB, taskInserts, titleSelects } = raceWindowD1()
    const title = 'Approve: MECHANIC: I18 — 0p+19t'
    const WINNER = 'task_01KQQ1SRTWBWREJY0SHPTE5RPJ'  // actual winner PK from incident
    const LOSER = 'task_01KQQ1SRTWBWREJY0SHPTE5RXX'   // loser PK (alias candidate)

    const home = await post(DB, insertMut(WINNER, 'mut_race_home_0001', { title, created_at: '2026-05-03T18:00:27.000Z' }, 'home'))
    expect(home.status).toBe('accepted')
    expect(home.reason ?? '').not.toContain('error')
    expect(has(WINNER)).toBe(true)

    const work = await post(DB, insertMut(LOSER, 'mut_race_work_0001', { title, created_at: '2026-05-03T18:00:27.100Z' }, 'work'))

    // The index fired (INSERT threw), but the race-loser catch re-queried and
    // adopted the winner: status='accepted', not 'error'. A regression to
    // 'error' means the catch stopped finding the winner -- back to
    // dead-lettering the loser.
    expect(work.status).toBe('accepted')
    expect(work.reason).toContain('race-loser')
    expect(work.reason).toContain(WINNER)
    // canonical_id is gated on hub_dedup_adoptable, which this database does
    // not seed (OFF); the winner still comes back as the canonical payload.
    expect(work.canonical_payload?.id).toBe(WINNER)

    // The duplicate was NOT inserted as a separate row.
    expect(idsTitled(title)).toEqual([WINNER])
    expect(receiptOf(db, 'mut_race_work_0001')?.outcome).toBe('accepted')

    // Both serial SELECTs saw the empty state and both INSERTs were attempted:
    // only the structural index + catch caught this, not the serial dedup.
    expect(taskInserts()).toBe(2)
    expect(titleSelects()).toBe(3)
  })

  it('the migrated index itself refuses the second open row (what made the race structural)', () => {
    // Replaces the first cut's "without the index both inserts succeed" proof,
    // which exercised only its own index-less stub. Drop the index from the
    // migration chain and this fails.
    const title = 'Approve: MECHANIC: I18 — 0p+19t'
    seedTask({ id: 'task_winner_ix', title })
    expect(() => seedTask({ id: 'task_loser_ix', title })).toThrow(/UNIQUE constraint failed/)
    expect(idsTitled(title)).toEqual(['task_winner_ix'])
  })
})

// ── Phase 1.4 — mobile dedup includes project_id ────────────────────────────
//
// handleMobileTasksToHub dedup key was (title, assignee) only.
// Nick decision 2026-05-04: same title+assignee but DIFFERENT project = NOT a
// duplicate. This block verifies the fix: project_id added to the dedup query.

const mobileUser = { id: 'u_test', email: 'test@example.com', role: 'admin', name: 'Test' } as unknown as AuthUser

async function mobile(tasks: unknown[]) {
  const { handleMobileTasksToHub } = await import('./tasks')
  const req = new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    body: JSON.stringify({ tasks }),
  })
  const response = await handleMobileTasksToHub(req, mobileUser, { DB: d1Adapter(db) } as unknown as Env)
  return (await response.json() as { data: { deduped: number; created: number; id_map: Record<string, string> } }).data
}

describe('Phase 1.4 — mobile dedup includes project_id', () => {
  beforeEach(() => { for (const p of ['proj_A', 'proj_B', 'proj_C', 'proj_D']) seedProject(p) })

  it('different project_id with same title+assignee creates two rows', async () => {
    seedTask({ id: 'task_existing', title: 'shared title', project_id: 'proj_A' })

    const data = await mobile([{ id: 'mobile_xyz', title: 'shared title', assignee: 'nick-ingraham', project_id: 'proj_B' }])

    // Should NOT dedup; should create new task
    expect(data.deduped).toBe(0)
    expect(data.created).toBe(1)
    expect(data.id_map['mobile_xyz']).not.toBe('task_existing')
    expect(db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(data.id_map['mobile_xyz'])).toEqual({ project_id: 'proj_B' })
    expect(idsTitled('shared title')).toHaveLength(2)
  })

  it('same title+assignee+project_id deduplicates', async () => {
    seedTask({ id: 'task_existing2', title: 'dup title', project_id: 'proj_C' })

    const data = await mobile([{ id: 'mobile_dup', title: 'dup title', assignee: 'nick-ingraham', project_id: 'proj_C' }])

    expect(data.deduped).toBe(1)
    expect(data.id_map['mobile_dup']).toBe('task_existing2')
    expect(idsTitled('dup title')).toEqual(['task_existing2'])
  })

  // #523 (2026-07-07): assignee dropped from the pre-check key — it never
  // actually protected anything (applyInsert's own (title, project_id) I18
  // rule downstream doesn't scope by assignee either).
  it('different assignee, same title+project_id now deduplicates (#523)', async () => {
    seedTask({ id: 'task_existing3', title: 'shared owner-agnostic title', assignee: 'claude-ai', project_id: 'proj_D' })

    const data = await mobile([{ id: 'mobile_cross_assignee', title: 'shared owner-agnostic title', assignee: 'nick-ingraham', project_id: 'proj_D' }])

    expect(data.deduped).toBe(1)
    expect(data.created).toBe(0)
    expect(data.id_map['mobile_cross_assignee']).toBe('task_existing3')
  })

  // #523: lower(trim()) normalization is KEPT — genuine tolerance for typed mobile input.
  it('case + whitespace variant of an existing title still deduplicates', async () => {
    seedTask({ id: 'task_existing4', title: 'Buy milk' })

    const data = await mobile([{ id: 'mobile_case_variant', title: '  buy MILK  ', assignee: 'nick-ingraham' }])

    expect(data.deduped).toBe(1)
    expect(data.id_map['mobile_case_variant']).toBe('task_existing4')
    // No second row under the typed spelling either.
    expect(db.prepare("SELECT id FROM tasks WHERE lower(trim(title)) = 'buy milk'").all()).toEqual([{ id: 'task_existing4' }])
  })
})
