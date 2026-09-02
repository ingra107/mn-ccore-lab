// Meeting-approval dedup tests (2026-07-02 meeting-dedup wave)
//
// Covers the source-dispatched task-insert dedup in mutations.ts applyInsert:
//   - source='meeting_approval' rows dedup ONLY by (source, meeting_id),
//     never by (title, project_id); a missing meeting_id is an error.
//   - everything else keeps the (title, project_id) dedup, now excluding
//     meeting-approval rows from the name identity class.
// Both the serial-dedup path and the race-loser catch path.
//
// Uses an in-memory D1 stub modeled on tasks.dedup.test.ts, but with a FAITHFUL
// INSERT (columns parsed from the SQL text, so stored rows reflect the payload
// regardless of key order) and a meeting-identity SELECT. The dedup flag
// (hub_dedup_adoptable) is stubbed ON so canonical_id is surfaced, matching prod.

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import { _resetValidationFlagsCache } from '../helpers'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'

const TEST_API_KEY = 'test-meeting-dedup-api-key'
const fakeUser: AuthUser = { email: 'test@example.com', role: 'admin', name: 'Test User' } as unknown as AuthUser

// ── Faithful in-memory D1 stub ──────────────────────────────────────────────

function isActive(row: Record<string, unknown>): boolean {
  return !row.deleted_at && row.status !== 'done'
}

// Parse "INSERT INTO tasks (c1, c2, ...) VALUES (...)" -> column names, so the
// stored row mirrors the payload no matter the payload key order (applyInsert
// derives column order from Object.keys(payload)). last_mutation_id is a bound
// value; only the trailing updated_at = datetime('now') has no placeholder, so
// col[i] -> boundVals[i] for i < boundVals.length is exact.
function insertColumns(sql: string): string[] {
  const m = sql.match(/INSERT INTO \w+ \(([^)]*)\)/i)
  return m ? m[1].split(',').map(s => s.trim()) : []
}

function makeStubDB(seedRows: Record<string, Record<string, unknown>> = {}) {
  const store: Map<string, Record<string, unknown>> = new Map(Object.entries(seedRows))

  function findByMeeting(meetingId: string): Record<string, unknown> | null {
    for (const row of store.values()) {
      if (row.source === 'meeting_approval' && row.meeting_id === meetingId && isActive(row)) return row
    }
    return null
  }

  function findByTitleProjectNonMeeting(title: string, projectId: string | null): Record<string, unknown> | null {
    for (const row of store.values()) {
      if (
        row.title === title &&
        (row.project_id ?? null) === projectId &&
        isActive(row) &&
        row.source !== 'meeting_approval'
      ) return row
    }
    return null
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // meeting-identity SELECT: (source, meeting_id). The classifier THROWS
        // on a `SELECT id FROM tasks` it does not recognise, so a query edit
        // that outruns this stub is red, not a vacuous green (#530b).
        if (classifyTaskDedupSelect(sql) === 'meeting') {
          const row = findByMeeting(boundVals[0] as string)
          return (row ? { id: row.id } : null) as T | null
        }
        // non-meeting name-identity SELECT, raw or normalized
        if (classifyTaskDedupSelect(sql) === 'title') {
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const row = findByTitleProjectNonMeeting(title, projectId)
          return (row ? { id: row.id } : null) as T | null
        }
        // processed_mutations idempotency gate: never pre-processed in tests
        if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
        // readCanonical: SELECT * FROM tasks WHERE id = ?
        return (store.get(boundVals[0] as string) ?? null) as T | null
      },

      all: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // getValidationFlags: SELECT key, value FROM lab_settings WHERE key IN (...)
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
          const id = boundVals[0] as string
          if (id && !store.has(id)) {
            const row: Record<string, unknown> = { deleted_at: null, seq: 1 }
            cols.forEach((c, i) => { if (i < boundVals.length) row[c] = boundVals[i] })
            if (!('updated_at' in row)) row.updated_at = nowInstant()
            store.set(id, row)
          }
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => { for (const s of stmts) await s.run(); return [] },
  }
}

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
    payload: over.payload,
  } as Mutation
}

async function run(db: ReturnType<typeof makeStubDB>, mut: Mutation) {
  const { handleMutations } = await import('./mutations')
  const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('mutations.ts applyInsert — meeting_approval (source, meeting_id) dedup', () => {
  beforeEach(() => { _resetValidationFlagsCache() })

  it('(a) two meeting_approval inserts, same title + null project, distinct meeting_id -> BOTH insert, no canonical_id', async () => {
    const db = makeStubDB()
    const title = 'Meeting: Weekly Sync [pending approval]'

    const first = meetingMut({
      record_id: 'task_meet_a',
      payload: { title, project_id: null, status: 'pending', source: 'meeting_approval', meeting_id: 'mtg_test_a', created_at: nowInstant() },
    })
    const r1 = await run(db, first)
    expect(r1.status).toBe('accepted')
    expect(r1.reason ?? '').not.toContain('deduped')
    expect(r1.canonical_id).toBeUndefined()
    expect(db._store.has('task_meet_a')).toBe(true)

    const second = meetingMut({
      record_id: 'task_meet_b',
      payload: { title, project_id: null, status: 'pending', source: 'meeting_approval', meeting_id: 'mtg_test_b', created_at: nowInstant() },
    })
    const r2 = await run(db, second)
    expect(r2.status).toBe('accepted')
    expect(r2.reason ?? '').not.toContain('deduped')
    expect(r2.canonical_id).toBeUndefined()
    expect(db._store.has('task_meet_b')).toBe(true)
  })

  it('(b) same meeting_id re-insert -> adopt with canonical_id, incl. when existing row approval_status=declined (Hub does NOT reset it)', async () => {
    const db = makeStubDB({
      task_meet_existing: {
        id: 'task_meet_existing',
        title: 'Meeting: Grant Call [pending approval]',
        project_id: null,
        source: 'meeting_approval',
        meeting_id: 'mtg_test_x',
        approval_status: 'declined',
        status: 'pending',
        deleted_at: null,
        seq: 4,
      },
    })

    const dup = meetingMut({
      record_id: 'task_meet_dup',
      // A different title on purpose: meeting identity is (source, meeting_id), not title.
      payload: { title: 'Meeting: Grant Call RETRY [pending approval]', project_id: null, status: 'pending', source: 'meeting_approval', meeting_id: 'mtg_test_x', created_at: nowInstant() },
    })
    const r = await run(db, dup)
    expect(r.status).toBe('accepted')
    expect(r.reason).toContain('deduped')
    expect(r.reason).toContain('task_meet_existing')
    expect(r.canonical_id).toBe('task_meet_existing')
    // New row NOT inserted (adopted the winner instead)
    expect(db._store.has('task_meet_dup')).toBe(false)
    // Hub did NOT reset the existing row's approval_status — it stays 'declined'
    expect(db._store.get('task_meet_existing')?.approval_status).toBe('declined')
  })

  it('(c) same meeting_id where existing row status=done -> fresh insert (NOT adopted)', async () => {
    const db = makeStubDB({
      task_meet_done: {
        id: 'task_meet_done',
        title: 'Meeting: Retro [pending approval]',
        project_id: null,
        source: 'meeting_approval',
        meeting_id: 'mtg_test_done',
        status: 'done',
        deleted_at: null,
        seq: 9,
      },
    })

    const fresh = meetingMut({
      record_id: 'task_meet_fresh',
      payload: { title: 'Meeting: Retro [pending approval]', project_id: null, status: 'pending', source: 'meeting_approval', meeting_id: 'mtg_test_done', created_at: nowInstant() },
    })
    const r = await run(db, fresh)
    expect(r.status).toBe('accepted')
    expect(r.reason ?? '').not.toContain('deduped')
    expect(r.canonical_id).toBeUndefined()
    expect(db._store.has('task_meet_fresh')).toBe(true)
  })

  it('(d) race-loser on the meeting index -> catch re-queries by meeting_id and adopts the correct winner', async () => {
    // Race stub: the serial meeting SELECT misses (winner not yet committed), the
    // loser INSERT throws the meeting UNIQUE constraint, and the catch re-query
    // then finds the pre-seeded winner.
    const winner = {
      id: 'task_meet_winner',
      title: 'Meeting: Concurrent [pending approval]',
      project_id: null,
      source: 'meeting_approval',
      meeting_id: 'mtg_test_race',
      status: 'pending',
      deleted_at: null,
      seq: 1,
    }
    const store = new Map<string, Record<string, unknown>>([[winner.id, winner]])
    let meetingSelectCalls = 0

    const raceDB: any = {
      _store: store,
      prepare: (sql: string) => {
        const mk = (s: string, vals: unknown[]): any => ({
          bind: (...more: unknown[]) => mk(s, [...vals, ...more]),
          first: async <T>() => {
            const upper = s.trim().toUpperCase()
            if (upper.includes("SOURCE = 'MEETING_APPROVAL'") && upper.includes('MEETING_ID =')) {
              meetingSelectCalls += 1
              // 1st call = serial dedup during the race window -> miss.
              // 2nd call = race-loser catch re-query -> winner is now visible.
              if (meetingSelectCalls === 1) return null as T | null
              const mid = vals[0] as string
              for (const row of store.values()) {
                if (row.source === 'meeting_approval' && row.meeting_id === mid && !row.deleted_at && row.status !== 'done') {
                  return { id: row.id } as T
                }
              }
              return null as T | null
            }
            if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
            return (store.get(vals[0] as string) ?? null) as T | null
          },
          all: async <T>() => {
            const upper = s.trim().toUpperCase()
            if (upper.includes('FROM LAB_SETTINGS')) {
              return { results: [{ key: 'hub_dedup_adoptable', value: '1' }] as unknown as T[], success: true, meta: {} }
            }
            return { results: [] as T[], success: true, meta: {} }
          },
          run: async () => {
            const upper = s.trim().toUpperCase()
            if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) return { meta: { changes: 1 } }
            if (upper.startsWith('INSERT INTO TASKS')) {
              // Loser INSERT hits the meeting partial unique index.
              throw new Error('D1_ERROR: UNIQUE constraint failed: tasks.source, tasks.meeting_id')
            }
            return { meta: { changes: 0 } }
          },
        })
        return mk(sql, [])
      },
      batch: async (stmts: any[]) => { for (const s of stmts) await s.run(); return [] },
    }

    const loser = meetingMut({
      record_id: 'task_meet_loser',
      payload: { title: 'Meeting: Concurrent [pending approval]', project_id: null, status: 'pending', source: 'meeting_approval', meeting_id: 'mtg_test_race', created_at: nowInstant() },
    })
    const r = await run(raceDB, loser)
    expect(r.status).toBe('accepted')
    expect(r.reason).toContain('race-loser')
    expect(r.reason).toContain('task_meet_winner')
    expect(r.canonical_id).toBe('task_meet_winner')
    // Loser row was NOT inserted (adopted the winner via the catch)
    expect(store.has('task_meet_loser')).toBe(false)
    expect(meetingSelectCalls).toBe(2)
  })

  it('(e) regression: non-meeting (title, project_id) serial dedup still fires; a meeting row with the same title is NOT adopted by a non-meeting insert', async () => {
    const db = makeStubDB({
      // an ordinary name-keyed task
      task_name_keyed: {
        id: 'task_name_keyed', title: 'Approve: MECHANIC: I3', project_id: null,
        source: 'mechanic_triage', status: 'todo', deleted_at: null, seq: 2,
      },
      // a meeting-approval row that happens to share a title with the non-meeting insert below
      task_meet_sametitle: {
        id: 'task_meet_sametitle', title: 'Reply to Abbie', project_id: null,
        source: 'meeting_approval', meeting_id: 'mtg_sametitle', status: 'pending', deleted_at: null, seq: 3,
      },
    })

    // Non-meeting insert with the same (title, project_id) as task_name_keyed -> serial dedup adopts it.
    const dupNonMeeting = meetingMut({
      record_id: 'task_name_dup',
      payload: { title: 'Approve: MECHANIC: I3', project_id: null, status: 'todo', source: 'mechanic_triage', created_at: nowInstant() },
    })
    const r1 = await run(db, dupNonMeeting)
    expect(r1.status).toBe('accepted')
    expect(r1.reason).toContain('deduped')
    expect(r1.reason).toContain('task_name_keyed')
    expect(r1.canonical_id).toBe('task_name_keyed')
    expect(db._store.has('task_name_dup')).toBe(false)

    // Non-meeting insert sharing a title with a MEETING row -> NOT adopted (source guard excludes it).
    const nonMeetingVsMeeting = meetingMut({
      record_id: 'task_reply_new',
      payload: { title: 'Reply to Abbie', project_id: null, status: 'todo', created_at: nowInstant() },
    })
    const r2 = await run(db, nonMeetingVsMeeting)
    expect(r2.status).toBe('accepted')
    expect(r2.reason ?? '').not.toContain('deduped')
    expect(r2.canonical_id).toBeUndefined()
    expect(db._store.has('task_reply_new')).toBe(true)
  })

  it('(f) meeting_approval insert WITHOUT meeting_id -> error (never guessed, never title-deduped)', async () => {
    const db = makeStubDB()
    const bad = meetingMut({
      record_id: 'task_meet_nomeetingid',
      payload: { title: 'Meeting: No ID [pending approval]', project_id: null, status: 'pending', source: 'meeting_approval', created_at: nowInstant() },
    })
    const r = await run(db, bad)
    expect(r.status).toBe('error')
    expect(r.reason).toContain('meeting_approval task requires meeting_id')
    expect(db._store.has('task_meet_nomeetingid')).toBe(false)
  })
})
