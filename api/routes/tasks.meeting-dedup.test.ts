// Meeting-approval dedup tests (2026-07-02 meeting-dedup wave)
//
// Covers the source-dispatched task-insert dedup in mutations.ts applyInsert:
//   - source='meeting_approval' rows dedup ONLY by (source, meeting_id),
//     never by (title, project_id); a missing meeting_id is an error.
//   - everything else keeps the (title, project_id) dedup, now excluding
//     meeting-approval rows from the name identity class.
// Both the serial-dedup path and the race-loser catch path.
//
// #8875: runs through handleMutations on the migration-chain database
// (api/test-support/prod-schema-db.ts). The first cut re-implemented both
// identity SELECTs and the meeting UNIQUE index in JavaScript, and its race
// case threw a hand-written constraint message from a stub INSERT. Here the
// partial UNIQUE indexes are the ones the migration chain builds, every row
// asserted on is read from the table, and each landed write has its receipt.
// The dedup flag (hub_dedup_adoptable) is seeded ON so canonical_id is
// surfaced, matching prod.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { _resetValidationFlagsCache } from '../helpers'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const TEST_API_KEY = 'test-meeting-dedup-api-key'
const fakeUser: AuthUser = { email: 'test@example.com', role: 'admin', name: 'Test User' } as unknown as AuthUser

let db: InstanceType<typeof Database>
beforeEach(() => {
  _resetValidationFlagsCache()
  db = prodSchemaDb()
  db.prepare("INSERT OR REPLACE INTO lab_settings (key, value) VALUES ('hub_dedup_adoptable', '1')").run()
})

function seed(row: Record<string, unknown>) {
  insertRow(db, 'tasks', { priority: 'medium', assignee: 'nick-ingraham', project_id: null, ...row })
}
const has = (id: string) => db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id) !== undefined
const col = (id: string, c: string) => (db.prepare(`SELECT ${c} AS v FROM tasks WHERE id = ?`).get(id) as { v: unknown } | undefined)?.v

// ── Mutation + request factories ────────────────────────────────────────────

let mutSeq = 0
function meetingMut(over: Partial<Mutation> & { payload?: Record<string, unknown> }): Mutation {
  mutSeq += 1
  return {
    mutation_id: `mut_meetdedup_${String(mutSeq).padStart(4, '0')}`,
    origin_machine: 'work',
    table: 'tasks',
    op: 'insert',
    record_id: `task_meetdedup_${String(mutSeq).padStart(4, '0')}`,
    base_seq: null,
    base_row_hash: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...over,
    payload: { assignee: 'nick-ingraham', ...over.payload },
  } as Mutation
}

async function run(DB: unknown, mut: Mutation) {
  const { handleMutations } = await import('./mutations')
  const fakeEnv = { DB, PB_API_KEY: TEST_API_KEY } as unknown as Env
  const req = new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations: [mut] }),
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
  })
  const resp = await handleMutations(req, fakeUser, fakeEnv)
  const body = await resp.json() as {
    results: Array<{ status: string; reason?: string; canonical_id?: string; canonical_payload?: Record<string, unknown> }>
  }
  return body.results[0]
}

/** The first meeting-identity SELECT answers "no row" (the race window); later ones read the table. */
function racingMeetingD1() {
  const base = d1Adapter(db)
  let calls = 0
  const DB = {
    ...base,
    prepare(sql: string) {
      const stmt = base.prepare(sql)
      if (classifyTaskDedupSelect(sql) !== 'meeting') return stmt
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrap = (s: any): any => ({
        ...s,
        bind: (...v: unknown[]) => wrap(s.bind(...v)),
        first: async () => {
          calls += 1
          const real = await s.first()
          return calls === 1 ? null : real
        },
      })
      return wrap(stmt)
    },
  }
  return { DB, calls: () => calls }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('mutations.ts applyInsert — meeting_approval (source, meeting_id) dedup', () => {
  it('(a) two meeting_approval inserts, same title + null project, distinct meeting_id -> BOTH insert, no canonical_id', async () => {
    const DB = d1Adapter(db)
    const title = 'Meeting: Weekly Sync [pending approval]'

    const first = meetingMut({
      record_id: 'task_meet_a',
      payload: { title, project_id: null, status: 'todo', source: 'meeting_approval', meeting_id: 'mtg_test_a', created_at: nowInstant() },
    })
    const r1 = await run(DB, first)
    expect(r1.status).toBe('accepted')
    expect(r1.reason ?? '').not.toContain('deduped')
    expect(r1.canonical_id).toBeUndefined()
    expect(has('task_meet_a')).toBe(true)
    expect(receiptOf(db, first.mutation_id)?.outcome).toBe('accepted')

    const second = meetingMut({
      record_id: 'task_meet_b',
      payload: { title, project_id: null, status: 'todo', source: 'meeting_approval', meeting_id: 'mtg_test_b', created_at: nowInstant() },
    })
    const r2 = await run(DB, second)
    expect(r2.status).toBe('accepted')
    expect(r2.reason ?? '').not.toContain('deduped')
    expect(r2.canonical_id).toBeUndefined()
    expect(has('task_meet_b')).toBe(true)
  })

  it('(b) same meeting_id re-insert -> adopt with canonical_id; a create that does not ask for pending leaves a declined winner declined', async () => {
    seed({
      id: 'task_meet_existing', title: 'Meeting: Grant Call [pending approval]',
      source: 'meeting_approval', meeting_id: 'mtg_test_x', approval_status: 'declined', status: 'todo',
    })

    const dup = meetingMut({
      record_id: 'task_meet_dup',
      // A different title on purpose: meeting identity is (source, meeting_id), not title.
      payload: { title: 'Meeting: Grant Call RETRY [pending approval]', project_id: null, status: 'todo', source: 'meeting_approval', meeting_id: 'mtg_test_x', created_at: nowInstant() },
    })
    const r = await run(d1Adapter(db), dup)
    expect(r.status).toBe('accepted')
    expect(r.reason).toContain('deduped')
    expect(r.reason).toContain('task_meet_existing')
    expect(r.canonical_id).toBe('task_meet_existing')
    // New row NOT inserted (adopted the winner instead)
    expect(has('task_meet_dup')).toBe(false)
    // No approval_status: 'pending' in the create, so no #8352 reset.
    expect(col('task_meet_existing', 'approval_status')).toBe('declined')
  })

  it('(c) same meeting_id where existing row status=done -> fresh insert (NOT adopted)', async () => {
    seed({
      id: 'task_meet_done', title: 'Meeting: Retro [pending approval]',
      source: 'meeting_approval', meeting_id: 'mtg_test_done',
      status: 'done', completed: 1, completed_at: '2026-07-01T00:00:00Z',
    })

    const fresh = meetingMut({
      record_id: 'task_meet_fresh',
      payload: { title: 'Meeting: Retro [pending approval]', project_id: null, status: 'todo', source: 'meeting_approval', meeting_id: 'mtg_test_done', created_at: nowInstant() },
    })
    const r = await run(d1Adapter(db), fresh)
    expect(r.status).toBe('accepted')
    expect(r.reason ?? '').not.toContain('deduped')
    expect(r.canonical_id).toBeUndefined()
    expect(has('task_meet_fresh')).toBe(true)
    expect(has('task_meet_done')).toBe(true)
  })

  it('(d) race-loser on the meeting index -> catch re-queries by meeting_id and adopts the correct winner', async () => {
    // The serial meeting SELECT misses (winner not yet committed), the loser
    // INSERT meets the migrated meeting UNIQUE index, and the catch re-query
    // then finds the winner.
    seed({
      id: 'task_meet_winner', title: 'Meeting: Concurrent [pending approval]',
      source: 'meeting_approval', meeting_id: 'mtg_test_race', status: 'todo',
    })
    const { DB, calls } = racingMeetingD1()

    const loser = meetingMut({
      record_id: 'task_meet_loser',
      payload: { title: 'Meeting: Concurrent [pending approval]', project_id: null, status: 'todo', source: 'meeting_approval', meeting_id: 'mtg_test_race', created_at: nowInstant() },
    })
    const r = await run(DB, loser)
    expect(r.status).toBe('accepted')
    expect(r.reason).toContain('race-loser')
    expect(r.reason).toContain('task_meet_winner')
    expect(r.canonical_id).toBe('task_meet_winner')
    // Loser row was NOT inserted (adopted the winner via the catch)
    expect(has('task_meet_loser')).toBe(false)
    expect(calls()).toBe(2)
    expect(receiptOf(db, loser.mutation_id)?.outcome).toBe('accepted')
  })

  it('the migrated meeting index refuses a second open row for one meeting_id', () => {
    seed({ id: 'task_meet_ix1', title: 'Meeting: Ix', source: 'meeting_approval', meeting_id: 'mtg_ix', status: 'todo' })
    expect(() => seed({ id: 'task_meet_ix2', title: 'Meeting: Ix other title', source: 'meeting_approval', meeting_id: 'mtg_ix', status: 'todo' }))
      .toThrow(/UNIQUE constraint failed/)
  })

  it('(e) regression: non-meeting (title, project_id) serial dedup still fires; a meeting row with the same title is NOT adopted by a non-meeting insert', async () => {
    // an ordinary name-keyed task
    seed({ id: 'task_name_keyed', title: 'Approve: MECHANIC: I3', source: 'mechanic_triage', status: 'todo' })
    // a meeting-approval row that happens to share a title with the non-meeting insert below
    seed({ id: 'task_meet_sametitle', title: 'Reply to Abbie', source: 'meeting_approval', meeting_id: 'mtg_sametitle', status: 'todo' })
    const DB = d1Adapter(db)

    // Non-meeting insert with the same (title, project_id) as task_name_keyed -> serial dedup adopts it.
    const dupNonMeeting = meetingMut({
      record_id: 'task_name_dup',
      payload: { title: 'Approve: MECHANIC: I3', project_id: null, status: 'todo', source: 'mechanic_triage', created_at: nowInstant() },
    })
    const r1 = await run(DB, dupNonMeeting)
    expect(r1.status).toBe('accepted')
    expect(r1.reason).toContain('deduped')
    expect(r1.reason).toContain('task_name_keyed')
    expect(r1.canonical_id).toBe('task_name_keyed')
    expect(has('task_name_dup')).toBe(false)

    // Non-meeting insert sharing a title with a MEETING row -> NOT adopted (source guard excludes it).
    const nonMeetingVsMeeting = meetingMut({
      record_id: 'task_reply_new',
      payload: { title: 'Reply to Abbie', project_id: null, status: 'todo', created_at: nowInstant() },
    })
    const r2 = await run(DB, nonMeetingVsMeeting)
    expect(r2.status).toBe('accepted')
    expect(r2.reason ?? '').not.toContain('deduped')
    expect(r2.canonical_id).toBeUndefined()
    expect(has('task_reply_new')).toBe(true)
  })

  it('(f) meeting_approval insert WITHOUT meeting_id -> error (never guessed, never title-deduped)', async () => {
    const bad = meetingMut({
      record_id: 'task_meet_nomeetingid',
      payload: { title: 'Meeting: No ID [pending approval]', project_id: null, status: 'todo', source: 'meeting_approval', created_at: nowInstant() },
    })
    const r = await run(d1Adapter(db), bad)
    expect(r.status).toBe('error')
    expect(r.reason).toContain('meeting_approval task requires meeting_id')
    expect(has('task_meet_nomeetingid')).toBe(false)
  })
})
