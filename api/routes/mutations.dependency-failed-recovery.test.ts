// M46 (2026-05-29): dependency_failed recovery tests.
//
// Regression suite for the dead-letter loop fix:
//   Bug: a child mutation that received `dependency_failed` was permanently
//   poisoned — every retry replayed the cached failure from processed_mutations
//   before the depends_on re-evaluation (:464-471) could run.
//   Fix: Slice 2 — if `prior.outcome === 'dependency_failed'`, fall through and
//   re-evaluate; on terminal success, UPSERT the processed_mutations row via
//   UPDATE ... WHERE outcome='dependency_failed'.
//
// Three contracts verified:
//   1. Child that got `dependency_failed` recovers when retried after parent accepted.
//      The processed_mutations row advances from dependency_failed to terminal.
//   2. Cached `accepted` replays verbatim (Bug-Y contract: write-once for non-dep-failed).
//   3. Cached `conflict` replays verbatim (Bug-Y contract: write-once for non-dep-failed).

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'

// ── Stub DB ──────────────────────────────────────────────────────────────────
//
// Handles:
//   SELECT outcome, original_response_json FROM processed_mutations  (M46 idempotency)
//   SELECT outcome FROM processed_mutations                           (depends_on check)
//   INSERT INTO processed_mutations ... ON CONFLICT DO NOTHING        (Bug-Y atomic insert)
//   UPDATE processed_mutations ... WHERE outcome='dependency_failed'  (M46 upgrade)
//   INSERT/UPDATE/SELECT on tasks                                     (apply path)

interface ProcessedRow {
  outcome: string
  original_response_json: string
}

function makeM46StubDB() {
  // tasks store — simple id → row map
  const store: Map<string, Record<string, unknown>> = new Map()
  // processed_mutations store — mutable (M46 can upgrade dependency_failed rows)
  const mutations: Map<string, ProcessedRow> = new Map()

  function makeStmt(sql: string, boundVals: unknown[]): ReturnType<typeof makeStmt> {
    const upper = sql.trim().toUpperCase()

    const self = {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),

      first: async <T>() => {
        // processed_mutations SELECTs (idempotency + depends_on check)
        if (upper.includes('PROCESSED_MUTATIONS')) {
          const id = boundVals[0] as string
          const row = mutations.get(id)
          return (row ?? null) as T | null
        }
        // tasks SELECT by id
        const id = boundVals[0] as string
        return (store.get(id) ?? null) as T | null
      },

      all: async <T>() => ({ results: [] as T[], success: true, meta: {} }),

      run: async () => {
        // INSERT INTO processed_mutations ... ON CONFLICT DO NOTHING
        if (upper.startsWith('INSERT INTO PROCESSED_MUTATIONS')) {
          const mutId = boundVals[0] as string
          if (!mutations.has(mutId)) {
            mutations.set(mutId, {
              outcome: boundVals[2] as string,
              original_response_json: boundVals[3] as string,
            })
            return { meta: { changes: 1 } }
          }
          // ON CONFLICT DO NOTHING
          return { meta: { changes: 0 } }
        }

        // M46 UPDATE processed_mutations SET outcome=?, original_response_json=?, ...
        // WHERE mutation_id=? AND outcome='dependency_failed'
        if (upper.startsWith('UPDATE PROCESSED_MUTATIONS')) {
          const newOutcome = boundVals[0] as string
          const newJson = boundVals[1] as string
          const mutId = boundVals[2] as string
          const existing = mutations.get(mutId)
          if (existing && existing.outcome === 'dependency_failed') {
            mutations.set(mutId, { outcome: newOutcome, original_response_json: newJson })
            return { meta: { changes: 1 } }
          }
          return { meta: { changes: 0 } }
        }

        // UPDATE tasks (apply patch)
        if (upper.startsWith('UPDATE')) {
          const setMatch = sql.match(/SET (.+) WHERE/si)
          if (setMatch) {
            const pairs = setMatch[1].split(',').map((s: string) => s.trim())
            const id = boundVals[boundVals.length - 1] as string
            const row = store.get(id)
            if (row) {
              let paramIdx = 0
              for (const pair of pairs) {
                const eqIdx = pair.indexOf('=')
                if (eqIdx === -1) continue
                const col = pair.slice(0, eqIdx).trim()
                const placeholder = pair.slice(eqIdx + 1).trim()
                if (placeholder.toLowerCase().includes('datetime')) {
                  row[col] = nowInstant().replace('T', ' ').slice(0, 19)
                } else if (placeholder.toUpperCase() === 'NULL') {
                  row[col] = null
                } else {
                  row[col] = boundVals[paramIdx++]
                }
              }
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }

        // INSERT INTO tasks ... ON CONFLICT DO NOTHING
        if (upper.startsWith('INSERT INTO')) {
          const id = boundVals[0] as string
          if (!store.has(id)) {
            const colsMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/)
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map((c: string) => c.trim())
              const row: Record<string, unknown> = {}
              cols.forEach((col: string, i: number) => { row[col] = boundVals[i] ?? null })
              row['seq'] = 1
              store.set(id, row)
            }
          }
          return { meta: { changes: 1 } }
        }

        return { meta: { changes: 0 } }
      },
    }
    return self
  }

  return {
    _store: store,
    _mutations: mutations,
    prepare: (sql: string) => makeStmt(sql, []),
    batch: async () => [],
  }
}

// ── Env / request helpers ─────────────────────────────────────────────────────

const TEST_API_KEY = 'test-pb-api-key-m46'

function makeEnv(db: ReturnType<typeof makeM46StubDB>) {
  return {
    DB: db,
    PB_API_KEY: TEST_API_KEY,
    // getValidationFlags reads lab_settings KV; null → all flags OFF (correct)
    lab_settings: { get: async () => null },
  } as unknown as import('../helpers').Env
}

function makeAuthedRequest(body: object): Request {
  return new Request('https://hub.example.com/api/mutations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TEST_API_KEY,
    },
    body: JSON.stringify(body),
  })
}

const PI_USER = {
  email: 'ingra107@umn.edu',
  slug: 'nick-ingraham',
  role: 'pi',
} as unknown as import('../helpers').AuthUser

function baseMut(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    origin_machine: 'work',
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  }
}

// Valid tasks insert payload (all required fields, no unknown fields)
function taskPayload(taskId: string) {
  return {
    title: `M46 recovery test ${taskId}`,
    status: 'todo',
    priority: 'medium',
    assignee: 'nick-ingraham',
  }
}

// ── Test 1: dependency_failed → recovery after parent accepted ────────────────

describe('M46: dependency_failed recovery after parent accepted', () => {
  it('child that got dependency_failed recovers when retried after parent is accepted', async () => {
    const db = makeM46StubDB()

    const parentId = 'mut_m46_parent_001'
    const childId = 'mut_m46_child_001'
    const childRecordId = 'task_01hwm46testchild001child'

    // Pre-condition: parent is already accepted in processed_mutations
    db._mutations.set(parentId, {
      outcome: 'accepted',
      original_response_json: JSON.stringify({
        mutation_id: parentId,
        status: 'accepted',
        reason: 'parent applied',
      }),
    })

    // Pre-condition: child previously got dependency_failed (the poisoned state).
    // This simulates a row that was written by a prior request and is now
    // causing every subsequent retry to replay the failure.
    const poisonedResponse = JSON.stringify({
      mutation_id: childId,
      status: 'dependency_failed',
      reason: `depends_on ${parentId} missing`,
    })
    db._mutations.set(childId, {
      outcome: 'dependency_failed',
      original_response_json: poisonedResponse,
    })

    // Child retry — same mutation_id (PB re-sends the same id on every retry
    // per outbox.py:1471)
    const childMut = {
      mutation_id: childId,
      ...baseMut(),
      table: 'tasks',
      op: 'insert',
      record_id: childRecordId,
      depends_on: parentId,
      base_seq: null,
      base_row_hash: null,
      payload: taskPayload(childRecordId),
    }

    const env = makeEnv(db)
    const req = makeAuthedRequest({ mutations: [childMut] })
    const resp = await handleMutations(req, PI_USER, env)

    expect(resp.status).toBe(200)
    const body = await resp.json() as { results: Array<{ mutation_id: string; status: string }> }
    const result = body.results[0]

    // The child must recover — status is terminal (accepted or merged_clean),
    // NOT dependency_failed replayed from cache
    expect(result.mutation_id).toBe(childId)
    expect(['accepted', 'merged_clean']).toContain(result.status)

    // The processed_mutations row must have been upgraded from dependency_failed
    // to the terminal outcome (the M46 UPDATE path)
    const storedRow = db._mutations.get(childId)
    expect(storedRow).toBeDefined()
    expect(storedRow?.outcome).not.toBe('dependency_failed')
    expect(['accepted', 'merged_clean']).toContain(storedRow?.outcome)

    // The stored JSON must also reflect the terminal outcome
    const storedResult = JSON.parse(storedRow?.original_response_json ?? '{}') as { status: string }
    expect(['accepted', 'merged_clean']).toContain(storedResult.status)
  })

  it('child still gets dependency_failed when parent is still missing (no regression)', async () => {
    const db = makeM46StubDB()

    const parentId = 'mut_m46_parent_missing_002'
    const childId = 'mut_m46_child_002'

    // Parent NOT in processed_mutations — dependency unresolved
    // No pre-existing child row either (first attempt)

    const childMut = {
      mutation_id: childId,
      ...baseMut(),
      table: 'tasks',
      op: 'insert',
      record_id: 'task_01hwm46testchild002miss',
      depends_on: parentId,
      base_seq: null,
      base_row_hash: null,
      payload: taskPayload('child_002'),
    }

    const env = makeEnv(db)
    const req = makeAuthedRequest({ mutations: [childMut] })
    const resp = await handleMutations(req, PI_USER, env)

    expect(resp.status).toBe(200)
    const body = await resp.json() as { results: Array<{ status: string }> }
    expect(body.results[0].status).toBe('dependency_failed')

    // processed_mutations row must be stored with dependency_failed outcome
    const storedRow = db._mutations.get(childId)
    expect(storedRow?.outcome).toBe('dependency_failed')
  })
})

// ── Test 2: cached `accepted` replays verbatim (Bug-Y preserved) ──────────────

describe('M46: cached accepted replays verbatim (Bug-Y contract)', () => {
  it('a mutation that was already accepted replays the exact cached response', async () => {
    const db = makeM46StubDB()

    const mutId = 'mut_m46_accepted_003'
    const recordId = 'task_01hwm46testaccept003row'

    // The EXACT cached response that should be replayed
    const cachedResponse = {
      mutation_id: mutId,
      status: 'accepted',
      result_seq: 42,
      reason: 'original apply cached',
    }

    // Pre-seed as accepted in processed_mutations
    db._mutations.set(mutId, {
      outcome: 'accepted',
      original_response_json: JSON.stringify(cachedResponse),
    })

    // Also seed the row in the task store with a different seq — if the code
    // falls through and re-applies, the fresh result_seq would differ, detecting regression
    db._store.set(recordId, {
      id: recordId,
      title: 'Accepted task',
      status: 'todo',
      seq: 99, // different from cached result_seq=42
      deleted_at: null,
      last_mutation_id: mutId,
    })

    const mut = {
      mutation_id: mutId,
      ...baseMut(),
      table: 'tasks',
      op: 'update',
      record_id: recordId,
      depends_on: null,
      base_seq: 99,
      base_row_hash: null,
      patch: { status: 'in_progress' },
    }

    const env = makeEnv(db)
    const req = makeAuthedRequest({ mutations: [mut] })
    const resp = await handleMutations(req, PI_USER, env)

    expect(resp.status).toBe(200)
    const body = await resp.json() as { results: Array<typeof cachedResponse> }
    const result = body.results[0]

    // Must be the EXACT cached response — not a fresh apply
    expect(result.status).toBe('accepted')
    expect(result.mutation_id).toBe(mutId)
    expect(result.result_seq).toBe(42) // cached value, not 99 from fresh apply

    // processed_mutations row must NOT have been modified (write-once for accepted)
    const storedRow = db._mutations.get(mutId)
    expect(storedRow?.outcome).toBe('accepted')
    const storedResult = JSON.parse(storedRow?.original_response_json ?? '{}') as typeof cachedResponse
    expect(storedResult.result_seq).toBe(42)
    expect(storedResult.reason).toBe('original apply cached')
  })
})

// ── Test 3: cached `conflict` replays verbatim (Bug-Y preserved) ─────────────

describe('M46: cached conflict replays verbatim (Bug-Y contract)', () => {
  it('a mutation that was already conflict replays the exact cached response', async () => {
    const db = makeM46StubDB()

    const mutId = 'mut_m46_conflict_004'
    const recordId = 'task_01hwm46testconflict004r'

    const cachedResponse = {
      mutation_id: mutId,
      status: 'conflict',
      reason: 'base_seq stale: current=7 base=3',
    }

    // Pre-seed as conflict in processed_mutations
    db._mutations.set(mutId, {
      outcome: 'conflict',
      original_response_json: JSON.stringify(cachedResponse),
    })

    // Seed a row that now has a different seq — if replay is broken and code falls
    // through, it would produce a different verdict
    db._store.set(recordId, {
      id: recordId,
      title: 'Conflict task',
      status: 'todo',
      seq: 7,
      deleted_at: null,
    })

    const mut = {
      mutation_id: mutId,
      ...baseMut(),
      table: 'tasks',
      op: 'update',
      record_id: recordId,
      depends_on: null,
      base_seq: 3,       // stale — would conflict again, but we never reach apply
      base_row_hash: null,
      patch: { status: 'in_progress' },
    }

    const env = makeEnv(db)
    const req = makeAuthedRequest({ mutations: [mut] })
    const resp = await handleMutations(req, PI_USER, env)

    expect(resp.status).toBe(200)
    const body = await resp.json() as { results: Array<typeof cachedResponse> }
    const result = body.results[0]

    // Must replay the cached conflict, not re-evaluate
    expect(result.status).toBe('conflict')
    expect(result.mutation_id).toBe(mutId)
    expect(result.reason).toBe('base_seq stale: current=7 base=3') // exact cached reason

    // processed_mutations row must NOT have been modified (write-once for conflict)
    const storedRow = db._mutations.get(mutId)
    expect(storedRow?.outcome).toBe('conflict')
  })
})
