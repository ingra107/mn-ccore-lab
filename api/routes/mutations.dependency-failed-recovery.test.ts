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

// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old stub kept tasks and receipts in Maps, parsed SET clauses by text,
// treated every receipt INSERT/UPDATE as a Map write (so a NULL
// original_response_json was accepted), and its batch() executed nothing. Here
// receipts and tasks are real rows on the real schema (processed_mutations'
// TEXT NOT NULL response column, the tasks seq triggers), seeded with
// insertRow, and every contract reads the stored task AND the stored receipt.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

let db: InstanceType<typeof Database>
beforeEach(() => { db = prodSchemaDb() })

function seedReceipt(mutationId: string, outcome: string, response: object, recordId: string) {
  insertRow(db, 'processed_mutations', {
    mutation_id: mutationId, origin_machine: 'work', processed_at: '2026-10-01 00:00:00',
    outcome, original_response_json: JSON.stringify(response), table_name: 'tasks', record_id: recordId,
  })
}

const taskRow = (id: string) =>
  db.prepare('SELECT id, title, status, seq, last_mutation_id FROM tasks WHERE id = ?').get(id) as
    | { id: string; title: string; status: string; seq: number; last_mutation_id: string | null }
    | undefined

// ── Env / request helpers ─────────────────────────────────────────────────────

const TEST_API_KEY = 'test-pb-api-key-m46'

function makeEnv() {
  return {
    DB: d1Adapter(db),
    PB_API_KEY: TEST_API_KEY,
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

async function send(mut: object) {
  const resp = await handleMutations(makeAuthedRequest({ mutations: [mut] }), PI_USER, makeEnv())
  expect(resp.status).toBe(200)
  return (await resp.json()) as { results: Array<Record<string, unknown> & { mutation_id: string; status: string }> }
}

describe('M46: dependency_failed recovery after parent accepted', () => {
  it('child that got dependency_failed recovers when retried after parent is accepted', async () => {
    const parentId = 'mut_m46_parent_001'
    const childId = 'mut_m46_child_001'
    const childRecordId = 'task_01hwm46testchild001child'

    // Pre-condition: parent is already accepted in processed_mutations
    seedReceipt(parentId, 'accepted', { mutation_id: parentId, status: 'accepted', reason: 'parent applied' }, 'task_01hwm46testparent001par')

    // Pre-condition: child previously got dependency_failed (the poisoned state).
    // This simulates a row that was written by a prior request and is now
    // causing every subsequent retry to replay the failure.
    seedReceipt(childId, 'dependency_failed', {
      mutation_id: childId, status: 'dependency_failed', reason: `depends_on ${parentId} missing`,
    }, childRecordId)

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

    const body = await send(childMut)
    const result = body.results[0]

    // The child must recover — status is terminal, NOT dependency_failed replayed from cache
    expect(result.mutation_id).toBe(childId)
    expect(result.status).toBe('accepted')

    // The task row is really stored, stamped with the child's mutation id.
    expect(taskRow(childRecordId)).toMatchObject({
      id: childRecordId, title: `M46 recovery test ${childRecordId}`, status: 'todo', last_mutation_id: childId,
    })

    // The processed_mutations row was upgraded in place from dependency_failed
    // to the terminal outcome (the M46 UPDATE path), with a parseable response.
    const stored = receiptOf(db, childId)
    expect(stored).toMatchObject({ outcome: 'accepted', table_name: 'tasks' })
    expect(JSON.parse(stored!.original_response_json)).toMatchObject({ mutation_id: childId, status: 'accepted' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM processed_mutations WHERE mutation_id = ?').get(childId)).toEqual({ n: 1 })

    // A further retry replays the settled verdict and writes nothing new.
    const seqBefore = taskRow(childRecordId)!.seq
    const replay = await send(childMut)
    expect(replay.results[0].status).toBe('accepted')
    expect(taskRow(childRecordId)!.seq).toBe(seqBefore)
  })

  it('child still gets dependency_failed when parent is still missing (no regression)', async () => {
    const parentId = 'mut_m46_parent_missing_002'
    const childId = 'mut_m46_child_002'
    const childRecordId = 'task_01hwm46testchild002miss'

    // Parent NOT in processed_mutations — dependency unresolved
    // No pre-existing child row either (first attempt)
    const childMut = {
      mutation_id: childId,
      ...baseMut(),
      table: 'tasks',
      op: 'insert',
      record_id: childRecordId,
      depends_on: parentId,
      base_seq: null,
      base_row_hash: null,
      payload: taskPayload('child_002'),
    }

    const body = await send(childMut)
    expect(body.results[0].status).toBe('dependency_failed')

    // processed_mutations row must be stored with dependency_failed outcome,
    // and the task was not written.
    const stored = receiptOf(db, childId)
    expect(stored?.outcome).toBe('dependency_failed')
    expect(JSON.parse(stored!.original_response_json)).toMatchObject({ status: 'dependency_failed' })
    expect(taskRow(childRecordId)).toBeUndefined()
  })
})

// ── Test 2: cached `accepted` replays verbatim (Bug-Y preserved) ──────────────

describe('M46: cached accepted replays verbatim (Bug-Y contract)', () => {
  it('a mutation that was already accepted replays the exact cached response', async () => {
    const mutId = 'mut_m46_accepted_003'
    const recordId = 'task_01hwm46testaccept003row'

    // The EXACT cached response that should be replayed
    const cachedResponse = {
      mutation_id: mutId,
      status: 'accepted',
      result_seq: 42,
      reason: 'original apply cached',
    }
    seedReceipt(mutId, 'accepted', cachedResponse, recordId)

    // Also seed the row: if the code falls through and re-applies, the patch
    // would move status to in_progress and bump seq, detecting the regression.
    insertRow(db, 'tasks', {
      id: recordId, title: 'Accepted task', status: 'todo', priority: 'medium',
      assignee: 'nick-ingraham', last_mutation_id: mutId,
    })
    const before = taskRow(recordId)!

    const mut = {
      mutation_id: mutId,
      ...baseMut(),
      table: 'tasks',
      op: 'update',
      record_id: recordId,
      depends_on: null,
      base_seq: before.seq,
      base_row_hash: null,
      patch: { status: 'in_progress' },
    }

    const body = await send(mut)
    const result = body.results[0]

    // Must be the EXACT cached response — not a fresh apply
    expect(result).toEqual(cachedResponse)

    // The row was not touched, and the receipt is write-once for accepted.
    expect(taskRow(recordId)).toEqual(before)
    const stored = receiptOf(db, mutId)
    expect(stored?.outcome).toBe('accepted')
    expect(JSON.parse(stored!.original_response_json)).toEqual(cachedResponse)
  })
})

// ── Test 3: cached `conflict` replays verbatim (Bug-Y preserved) ─────────────

describe('M46: cached conflict replays verbatim (Bug-Y contract)', () => {
  it('a mutation that was already conflict replays the exact cached response', async () => {
    const mutId = 'mut_m46_conflict_004'
    const recordId = 'task_01hwm46testconflict004r'

    const cachedResponse = {
      mutation_id: mutId,
      status: 'conflict',
      reason: 'base_seq stale: current=7 base=3',
    }
    seedReceipt(mutId, 'conflict', cachedResponse, recordId)

    insertRow(db, 'tasks', {
      id: recordId, title: 'Conflict task', status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    })
    const before = taskRow(recordId)!

    const mut = {
      mutation_id: mutId,
      ...baseMut(),
      table: 'tasks',
      op: 'update',
      record_id: recordId,
      depends_on: null,
      // The CURRENT seq: a fresh apply would now succeed and write, so only the
      // replay keeps the row unchanged.
      base_seq: before.seq,
      base_row_hash: null,
      patch: { status: 'in_progress' },
    }

    const body = await send(mut)
    const result = body.results[0]

    // Must replay the cached conflict, not re-evaluate
    expect(result).toEqual(cachedResponse)

    // processed_mutations row must NOT have been modified (write-once for conflict),
    // and the row was not written.
    const stored = receiptOf(db, mutId)
    expect(stored?.outcome).toBe('conflict')
    expect(JSON.parse(stored!.original_response_json)).toEqual(cachedResponse)
    expect(taskRow(recordId)).toEqual(before)
  })
})
