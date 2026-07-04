// I18 dedup regression tests (2026-05-03)
//
// Covers server-side (title, project_id) dedup via:
//   1. mutations.ts applyInsert — via the exported handleMutations path
// (sync-bulk path deleted 2026-05-12; codex audit #8)
//
// Uses the same in-memory D1 stub pattern as mutations.deleted-status.test.ts.
// Covers the four edge cases from the incident spec:
//   - Dedup fires on same (title, project_id) both null
//   - No dedup when project_id differs
//   - No dedup against deleted rows
//   - No dedup against done rows

import { describe, it, expect, beforeEach } from 'vitest'
import { nowInstant } from '../lib/time'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { _resetValidationFlagsCache } from '../helpers'

// ── Shared stub DB ──────────────────────────────────────────────────────────

function makeStubDB(seedRows: Record<string, Record<string, unknown>> = {}) {
  const store: Map<string, Record<string, unknown>> = new Map(
    Object.entries(seedRows)
  )

  // Title+project_id index: key = `${title}|||${project_id ?? 'NULL'}`
  // We rebuild on each query so mutations are reflected.
  function findByTitleProject(title: string, projectId: string | null): Record<string, unknown> | null {
    for (const row of store.values()) {
      if (
        row.title === title &&
        (row.project_id ?? null) === projectId &&
        !row.deleted_at &&
        row.status !== 'done'
      ) {
        return row
      }
    }
    return null
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // SELECT id FROM tasks WHERE title = ? AND project_id IS ? AND ...
        if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          const row = findByTitleProject(title, projectId)
          return (row ? { id: row.id } : null) as T | null
        }
        // SELECT * FROM tasks/projects WHERE id = ?
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // SELECT id, updated_at FROM tasks WHERE id IN (...)
        if (upper.includes('ID IN')) {
          const ids = boundVals as string[]
          const results = ids
            .map(id => store.get(id))
            .filter(Boolean) as T[]
          return { results, success: true, meta: {} }
        }
        return { results: [] as T[], success: true, meta: {} }
      },

      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/s)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const [col, placeholder] = pair.split('=').map((s: string) => s.trim())
                if (placeholder && placeholder.includes('datetime')) {
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO TASKS') || upper.startsWith('INSERT INTO ')) {
          // Parse id from VALUES (first positional)
          const id = boundVals[0] as string
          if (id && !store.has(id)) {
            // Build a minimal row from bound values
            // Column order matches the INSERT in applyInsert (mutations.ts):
            // id, meeting_id, project_id, title, description, assignee, assigned_by,
            // due_date, deadline, priority, status, source, completed, completed_at,
            // completed_by, created_at, key_link_1..6, updated_at
            store.set(id, {
              id, meeting_id: boundVals[1], project_id: boundVals[2],
              title: boundVals[3], description: boundVals[4],
              assignee: boundVals[5], assigned_by: boundVals[6],
              due_date: boundVals[7], deadline: boundVals[8],
              priority: boundVals[9], status: boundVals[10],
              source: boundVals[11], completed: boundVals[12],
              completed_at: boundVals[13], completed_by: boundVals[14],
              created_at: boundVals[15],
              deleted_at: null, seq: 1, updated_at: boundVals[22] ?? nowInstant(),
              last_mutation_id: null,
            })
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
    batch: async (stmts: any[]) => {
      const results = []
      for (const s of stmts) await s.run()
      return results
    },
  }
}

const fakeUser: AuthUser = { email: 'test@example.com', role: 'admin', name: 'Test User' } as unknown as AuthUser
const TEST_API_KEY = 'test-dedup-api-key' // M07: handleMutations requires PI/API-key auth

// ── mutations.ts applyInsert dedup tests ────────────────────────────────────

describe('mutations.ts applyInsert — I18 (title, project_id) dedup', () => {
  // We test via applyUpdate (exported) as a proxy — the full processOne
  // path requires processed_mutations table. The dedup logic in applyInsert
  // is unit-tested here by constructing op='insert' mutations directly via
  // the exported handleMutations path with a stub DB.
  //
  // Since applyInsert is not exported, we verify the dedup contract by
  // confirming that a second insert with the same title+project_id returns
  // status='accepted' with a reason containing 'deduped' and the existing id.

  it('deduped: same title + same null project_id returns accepted with reason', async () => {
    const existingId = 'task_existing_001'
    const db = makeStubDB({
      [existingId]: {
        id: existingId,
        title: 'Approve: MECHANIC: I3',
        project_id: null,
        deleted_at: null,
        status: 'todo',
        seq: 1,
        last_mutation_id: null,
      }
    })

    // Simulate what applyInsert does: the dedup SELECT fires before INSERT
    // We test via the full handleMutations import which calls processOne ->
    // applyInsert. Import it here.
    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0001',
      origin_machine: 'work',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_dup_0001',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Approve: MECHANIC: I3',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string; canonical_payload?: Record<string, unknown> }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason).toContain('deduped')
    expect(body.results[0].reason).toContain(existingId)
    // New row should NOT have been inserted
    expect(db._store.has('task_new_dup_0001')).toBe(false)
  })

  it('no-dedup: same title but different non-null project_id — inserts normally', async () => {
    const db = makeStubDB({
      'task_proj_a': {
        id: 'task_proj_a',
        title: 'Write draft',
        project_id: 'proj_alpha',
        deleted_at: null,
        status: 'todo',
        seq: 1,
        last_mutation_id: null,
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0002',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_proj_b_new',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Write draft',
        project_id: 'proj_beta',  // different project
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    // Should NOT have the dedup reason
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    // New row should have been inserted
    expect(db._store.has('task_proj_b_new')).toBe(true)
  })

  it('no-dedup against deleted row — soft-deleted task does not block new insert', async () => {
    const db = makeStubDB({
      'task_deleted_old': {
        id: 'task_deleted_old',
        title: 'Reply to Abbie',
        project_id: null,
        deleted_at: '2026-05-01 10:00:00',
        status: 'deleted',
        seq: 3,
        last_mutation_id: 'mut_prev',
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0003',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_reply',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Reply to Abbie',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    expect(db._store.has('task_new_reply')).toBe(true)
  })

  it('no-dedup against done row — completed task does not block a new task of same name', async () => {
    const db = makeStubDB({
      'task_done_old': {
        id: 'task_done_old',
        title: 'Weekly review',
        project_id: null,
        deleted_at: null,
        status: 'done',
        seq: 10,
        last_mutation_id: 'mut_completed',
      }
    })

    const { handleMutations } = await import('./mutations')
    const mut: Mutation = {
      mutation_id: 'mut_dedup_test_0004',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_new_weekly',
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'Weekly review',
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    }

    const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env
    const req = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mut] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })

    const resp = await handleMutations(req, fakeUser, fakeEnv)
    const body = await resp.json() as { results: Array<{ status: string; reason?: string }> }

    expect(body.results[0].status).toBe('accepted')
    expect(body.results[0].reason ?? '').not.toContain('deduped')
    expect(db._store.has('task_new_weekly')).toBe(true)
  })
})

// ── Concurrent-race tests (partial index backstop) ──────────────────────────
//
// The serial dedup path (SELECT finds existing → return deduped) was tested
// above. These tests cover the race window:
//
//   T=0  machine-home  SELECT → no row found (winner not yet inserted)
//   T=0  machine-work  SELECT → no row found (same empty state)
//   T=1  machine-home  INSERT → succeeds (first writer wins)
//   T=1  machine-work  INSERT → partial index fires (UNIQUE violation)
//
// In production D1/SQLite the partial index
//   CREATE UNIQUE INDEX idx_tasks_title_project_active
//     ON tasks(title, project_id) WHERE deleted_at IS NULL AND status != 'done'
// makes this structural: the race-loser INSERT throws a constraint error.
//
// applyInsert's catch(e) (mutations.ts, 2026-07-02 meeting-dedup wave, commit
// 1dfe81bf) re-queries by (title, project_id) — same predicate as the serial
// SELECT — and, when the winner is now visible, returns the SAME adoptable
// `accepted` + canonical_id response as the serial path (reason prefixed
// "deduped (race-loser)"). The race-loser no longer dead-letters; it adopts
// the winner's PK via alias, closing the client-side gap previously documented
// here (flagged 2026-05-03, resolved 2026-07-02).

// Parses "INSERT INTO tasks (c1, c2, ...) VALUES (...)" -> column names, so
// the stored row reflects the ACTUAL payload key order (applyInsert builds
// columns from Object.keys(payload), not a fixed schema-wide order). A prior
// version of this stub hardcoded positional indices assuming a fixed legacy
// column layout (title at index 3, status at index 10); with this test's
// payload key order that silently stored the STATUS value under `title`,
// which the race-loser catch's honest re-query then failed to match. Faithful
// parsing (mirrors tasks.meeting-dedup.test.ts's insertColumns) makes the stub
// correct regardless of payload key order.
function insertColumns(sql: string): string[] {
  const m = sql.match(/INSERT INTO \w+ \(([^)]*)\)/i)
  return m ? m[1].split(',').map(s => s.trim()) : []
}

function makeRaceStubDB() {
  const store: Map<string, Record<string, unknown>> = new Map()
  let insertCount = 0
  let titleProjectSelectCalls = 0

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()
        if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
          titleProjectSelectCalls += 1
          // Calls 1-2 = the serial pre-insert dedup checks for BOTH machines
          // (the race window: neither writer's INSERT has committed yet, so
          // both miss). Call 3+ = the race-loser's catch re-query, which fires
          // strictly AFTER the winner's INSERT has committed (that commit is
          // the only reason the loser's INSERT hit the UNIQUE constraint in
          // the first place) — an honest store lookup reflects that.
          if (titleProjectSelectCalls <= 2) return null as T | null
          const title = boundVals[0] as string
          const projectId = (boundVals[1] === undefined ? null : boundVals[1]) as string | null
          for (const row of store.values()) {
            if (row.title === title && (row.project_id ?? null) === projectId && !row.deleted_at && row.status !== 'done') {
              return { id: row.id } as T
            }
          }
          return null as T | null
        }
        // processed_mutations idempotency check
        if (upper.includes('PROCESSED_MUTATIONS')) {
          return null as T | null
        }
        // readCanonical (SELECT * FROM tasks WHERE id = ?)
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => {
        const upper = sql.trim().toUpperCase()
        // getValidationFlags: SELECT key, value FROM lab_settings WHERE key IN (...)
        // Stubbed ON so canonical_id is surfaced on the adoptable response,
        // matching prod (mirrors tasks.meeting-dedup.test.ts convention).
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
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          return { meta: { changes: 1 } }
        }
        if (upper.startsWith('INSERT INTO TASKS')) {
          insertCount++
          const id = boundVals[0] as string
          if (insertCount === 1) {
            // First INSERT (home-machine winner): succeeds. Column names parsed
            // from the SQL text so the row reflects the actual payload key order.
            const cols = insertColumns(sql)
            const row: Record<string, unknown> = { deleted_at: null, seq: 1 }
            cols.forEach((c, i) => { if (i < boundVals.length) row[c] = boundVals[i] })
            if (!('updated_at' in row)) row.updated_at = nowInstant()
            store.set(id, row)
            return { meta: { changes: 1 } }
          } else {
            // Second INSERT (work-machine loser): partial index fires.
            // D1 throws an error matching SQLite UNIQUE constraint violation.
            throw new Error(
              'D1_ERROR: UNIQUE constraint failed: tasks.title, tasks.project_id'
            )
          }
        }
        return { meta: { changes: 0 } }
      },
    }
  }

  return {
    _store: store,
    _insertCount: () => insertCount,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run()
      return []
    },
  }
}

describe('partial index race backstop — concurrent dup INSERT (18:00:27 shape)', () => {
  beforeEach(() => { _resetValidationFlagsCache() })

  // Regression test for the 2026-05-03 18:00:27 incident:
  // Both home + work machines pushed "Approve: MECHANIC: I18 — 0p+19t" near-
  // simultaneously. Phase 2 serial dedup didn't catch it because both machines
  // passed the SELECT check before either INSERT landed.
  //
  // With the partial index in place (2be4a01b) AND the race-loser catch (commit
  // 1dfe81bf, 2026-07-02):
  //   - The winner INSERT succeeds → row in store
  //   - The loser INSERT hits the UNIQUE constraint → throws
  //   - applyInsert's catch(e) re-queries by (title, project_id), finds the now-
  //     committed winner, and returns the SAME adoptable accepted+canonical_id
  //     response as the serial dedup path (reason: "deduped (race-loser): ...")
  //
  // This test DOCUMENTS the current behavior (the loser adopts the winner via
  // alias, it does NOT dead-letter) and asserts the partial index still fires
  // structurally (regression would be: both rows land as separate tasks).
  it('test_partial_index_catches_concurrent_dup_insert_race: loser adopts winner via race-loser catch', async () => {
    const db = makeRaceStubDB()
    const { handleMutations } = await import('./mutations')

    const title = 'Approve: MECHANIC: I18 — 0p+19t'
    const fakeEnv = { DB: db, PB_API_KEY: TEST_API_KEY } as unknown as Env

    // Machine-home (winner) mutation — arrives first
    const mutHome: Mutation = {
      mutation_id: 'mut_race_home_0001',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_01KQQ1SRTWBWREJY0SHPTE5RPJ',  // actual winner PK from incident
      base_seq: null,
      base_row_hash: null,
      payload: {
        title,
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: '2026-05-03T18:00:27.000Z',
      },
      client_ts: '2026-05-03T18:00:27.000Z',
      issued_at: '2026-05-03T18:00:27.000Z',
    }

    // Machine-work (loser) mutation — same title, different record_id
    const mutWork: Mutation = {
      mutation_id: 'mut_race_work_0001',
      origin_machine: 'work',
      table: 'tasks',
      op: 'insert',
      record_id: 'task_01KQQ1SRTWBWREJY0SHPTE5RXX',  // loser PK (alias candidate)
      base_seq: null,
      base_row_hash: null,
      payload: {
        title,
        project_id: null,
        status: 'todo',
        priority: 'medium',
        assignee: 'nick-ingraham',
        created_at: '2026-05-03T18:00:27.100Z',
      },
      client_ts: '2026-05-03T18:00:27.100Z',
      issued_at: '2026-05-03T18:00:27.100Z',
    }

    // Winner request
    const reqHome = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mutHome] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })
    const respHome = await handleMutations(reqHome, fakeUser, fakeEnv)
    const bodyHome = await respHome.json() as { results: Array<{ status: string; reason?: string }> }

    // Winner: succeeds
    expect(bodyHome.results[0].status).toBe('accepted')
    expect(bodyHome.results[0].reason ?? '').not.toContain('error')
    expect(db._store.has('task_01KQQ1SRTWBWREJY0SHPTE5RPJ')).toBe(true)

    // Loser request — partial index fires on INSERT
    const reqWork = new Request('https://example.com/api/mutations', {
      method: 'POST',
      body: JSON.stringify({ mutations: [mutWork] }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
    })
    const respWork = await handleMutations(reqWork, fakeUser, fakeEnv)
    const bodyWork = await respWork.json() as { results: Array<{ status: string; reason?: string; canonical_id?: string }> }

    // Partial index fired (INSERT threw), but the race-loser catch re-queried
    // and adopted the winner: status='accepted', not 'error'.
    // If this regresses to status='error', the catch's re-query stopped
    // finding the winner (or was removed) — back to dead-lettering the loser.
    expect(bodyWork.results[0].status).toBe('accepted')
    expect(bodyWork.results[0].reason).toContain('race-loser')
    expect(bodyWork.results[0].reason).toContain('task_01KQQ1SRTWBWREJY0SHPTE5RPJ')
    expect(bodyWork.results[0].canonical_id).toBe('task_01KQQ1SRTWBWREJY0SHPTE5RPJ')

    // The duplicate was NOT inserted as a separate row — only the winner row exists
    expect(db._store.has('task_01KQQ1SRTWBWREJY0SHPTE5RXX')).toBe(false)

    // Verify index count: both SERIAL SELECTs saw empty state (race window),
    // both attempted INSERT — proves the serial dedup didn't catch this, only
    // the structural partial index + catch backstop did.
    expect(db._insertCount()).toBe(2)
  })

  it('regression proof: without the index both concurrent inserts would succeed', async () => {
    // A stub DB where the second INSERT does NOT throw (index absent).
    // Both inserts succeed → store has two rows with same (title, project_id).
    // This demonstrates what happened at 18:00:27 before 2be4a01b.
    const store: Map<string, Record<string, unknown>> = new Map()
    const noIndexDB = {
      _store: store,
      prepare: (sql: string) => {
        const makeNoIndexStmt = (s: string, vals: unknown[]): any => ({
          bind: (...more: unknown[]) => makeNoIndexStmt(s, [...vals, ...more]),
          first: async <T>() => {
            const upper = s.trim().toUpperCase()
            if (upper.includes('TITLE =') && upper.includes('PROJECT_ID IS')) {
              return null as T | null  // race: both see empty
            }
            if (upper.includes('PROCESSED_MUTATIONS')) return null as T | null
            return (store.get(vals[0] as string) ?? null) as T | null
          },
          all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
          run: async () => {
            const upper = s.trim().toUpperCase()
            if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) return { meta: { changes: 1 } }
            if (upper.startsWith('INSERT INTO TASKS')) {
              const id = vals[0] as string
              // No index: silently accept both inserts
              store.set(id, {
                id, title: vals[3], project_id: vals[2] ?? null,
                status: vals[10] ?? 'todo', deleted_at: null, seq: 1,
              })
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
          },
        })
        return makeNoIndexStmt(sql, [])
      },
      batch: async (stmts: any[]) => { for (const s of stmts) await s.run(); return [] },
    }

    const { handleMutations } = await import('./mutations')
    const title = 'Approve: MECHANIC: I18 — 0p+19t'
    const fakeEnvNoIndex = { DB: noIndexDB, PB_API_KEY: TEST_API_KEY } as unknown as Env

    for (const [origin, id] of [['home', 'task_winner_noindex'], ['work', 'task_loser_noindex']] as const) {
      const mut: Mutation = {
        mutation_id: `mut_race_noidx_${origin}`,
        origin_machine: origin,
        table: 'tasks',
        op: 'insert',
        record_id: id,
        base_seq: null,
        base_row_hash: null,
        payload: { title, project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', created_at: nowInstant() },
        client_ts: nowInstant(),
        issued_at: nowInstant(),
      }
      const req = new Request('https://example.com/api/mutations', {
        method: 'POST',
        body: JSON.stringify({ mutations: [mut] }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
      })
      await handleMutations(req, fakeUser, fakeEnvNoIndex)
    }

    // Without the index: both rows land → this is the pre-2be4a01b dup state
    expect(noIndexDB._store.has('task_winner_noindex')).toBe(true)
    expect(noIndexDB._store.has('task_loser_noindex')).toBe(true)

    // With the index (first test above), only winner lands.
    // This test exists to make the regression explicit:
    // drop 2be4a01b's index → this test passes, the race test above fails.
  })
})

// ── Phase 1.4 — mobile dedup includes project_id ────────────────────────────
//
// handleMobileTasksToHub dedup key was (title, assignee) only.
// Nick decision 2026-05-04: same title+assignee but DIFFERENT project = NOT a
// duplicate. This block verifies the fix: project_id added to the dedup query.

function makeMobileEnv() {
  // Minimal in-memory store for handleMobileTasksToHub tests.
  // Tracks tasks by id; supports INSERT (pre-seed + creation) and SELECT dedup.
  const store: Map<string, Record<string, unknown>> = new Map()
  let lastInsertedId: string | null = null

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        const upper = sql.trim().toUpperCase()

        // Dedup SELECT for handleMobileTasksToHub (pre-fix and post-fix shapes)
        // Pre-fix:  WHERE lower(trim(title)) = lower(trim(?)) AND assignee = ? AND completed = 0 AND deleted_at IS NULL
        // Post-fix: + AND ((project_id IS NULL AND ? IS NULL) OR project_id = ?)
        if (upper.includes('LOWER(TRIM(TITLE))') && upper.includes('ASSIGNEE =')) {
          const title = (boundVals[0] as string).toLowerCase().trim()
          const assignee = boundVals[1] as string
          // Post-fix: project_id is boundVals[2] and boundVals[3]
          const projectId = boundVals.length >= 4 ? (boundVals[2] as string | null) : undefined

          for (const row of store.values()) {
            const rowTitle = ((row.title as string) ?? '').toLowerCase().trim()
            const rowAssignee = row.assignee as string
            const rowCompleted = row.completed as number
            const rowDeletedAt = row.deleted_at

            if (rowTitle !== title) continue
            if (rowAssignee !== assignee) continue
            if (rowCompleted !== 0) continue
            if (rowDeletedAt) continue

            // If project_id is present in the query (post-fix), check it
            if (projectId !== undefined) {
              const rowProjectId = (row.project_id ?? null) as string | null
              const queryProjectId = projectId === undefined ? null : (projectId ?? null)
              if (rowProjectId !== queryProjectId) continue
            }

            return { id: row.id } as T
          }
          return null as T | null
        }

        // Project resolution query: SELECT id, slug FROM projects WHERE id = ? OR slug = ?
        if (upper.includes('FROM PROJECTS') && upper.includes('SLUG')) {
          const ref = boundVals[0] as string
          // Return the ref as-is (treat project_id as already resolved)
          return { id: ref, slug: ref } as T
        }

        return null as T | null
      },

      run: async () => {
        const upper = sql.trim().toUpperCase()
        if (upper.startsWith('INSERT INTO TASKS')) {
          // handleMobileTasksToHub INSERT column order:
          // id, title, description, assignee, assigned_by, project_id, due_date,
          // deadline, priority, status, source, completed, completed_at,
          // notes, effort, short_title, source_thread_id, related_message_ids
          const id = boundVals[0] as string
          store.set(id, {
            id,
            title: boundVals[1],
            assignee: boundVals[3],
            project_id: boundVals[5] ?? null,
            status: boundVals[9],
            completed: boundVals[11],
            deleted_at: null,
          })
          lastInsertedId = id
          return { meta: { changes: 1 } }
        }
        // activity_log INSERT — silently accept
        if (upper.startsWith('INSERT INTO ACTIVITY_LOG')) {
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      },

      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),
    }
  }

  const db = {
    _store: store,
    _lastInsertedId: () => lastInsertedId,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async (stmts: any[]) => { for (const s of stmts) await s.run(); return [] },
  }

  // Env stub — also provides a no-op ACTIVITY_LOG path
  const env = {
    DB: db,
  }

  // Helper: pre-seed a task directly into the store
  function seedTask(row: Record<string, unknown>) {
    store.set(row.id as string, { deleted_at: null, completed: 0, ...row })
  }

  return { env, seedTask, store }
}

const mobileUser = { id: 'u_test', email: 'test@example.com', role: 'admin', name: 'Test' } as unknown as import('../helpers').AuthUser

describe('Phase 1.4 — mobile dedup includes project_id', () => {
  it('different project_id with same title+assignee creates two rows', async () => {
    const { env, seedTask, store } = makeMobileEnv()

    // Pre-seed: task in project A
    seedTask({
      id: 'task_existing',
      title: 'shared title',
      assignee: 'nick-ingraham',
      project_id: 'proj_A',
      status: 'todo',
      completed: 0,
    })

    const { handleMobileTasksToHub } = await import('./tasks')

    const req = new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({
        tasks: [{
          id: 'mobile_xyz',
          title: 'shared title',
          assignee: 'nick-ingraham',
          project_id: 'proj_B',  // DIFFERENT project
        }],
      }),
    })

    const response = await handleMobileTasksToHub(req, mobileUser, env as any)
    const body = await response.json() as { data: { deduped: number; created: number; id_map: Record<string, string> } }

    // Should NOT dedup; should create new task
    expect(body.data.deduped).toBe(0)
    expect(body.data.created).toBe(1)
    expect(body.data.id_map['mobile_xyz']).not.toBe('task_existing')
    // New task should exist in store
    expect(store.has(body.data.id_map['mobile_xyz'])).toBe(true)
  })

  it('same title+assignee+project_id deduplicates', async () => {
    const { env, seedTask } = makeMobileEnv()

    seedTask({
      id: 'task_existing2',
      title: 'dup title',
      assignee: 'nick-ingraham',
      project_id: 'proj_C',
      status: 'todo',
      completed: 0,
    })

    const { handleMobileTasksToHub } = await import('./tasks')

    const req = new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({
        tasks: [{ id: 'mobile_dup', title: 'dup title', assignee: 'nick-ingraham', project_id: 'proj_C' }],
      }),
    })

    const response = await handleMobileTasksToHub(req, mobileUser, env as any)
    const body = await response.json() as { data: { deduped: number; created: number; id_map: Record<string, string> } }

    expect(body.data.deduped).toBe(1)
    expect(body.data.id_map['mobile_dup']).toBe('task_existing2')
  })
})
