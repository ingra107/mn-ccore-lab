// Phase 2 — notes privacy leak guard (/api/mutations canonical_payload)
//
// SEC-P2-03: task mutation results (applyInsert, applyUpdate, applyDelete)
//            must NOT echo `notes` in canonical_payload.
//
// readCanonical() does SELECT * on tasks — the `notes` field is a private
// brain.db column that must be stripped before it reaches the wire.
//
// TDD: write these tests first, run → FAIL, then fix readCanonical().

import { describe, it, expect } from 'vitest'
import { nowInstant } from '../lib/time'
import { handleMutations } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The stored task row carries a real `notes` value (the D1 tasks table has the
// column), so IF readCanonical does SELECT * and returns notes in
// canonical_payload, the test catches it. The old regex stub parsed SET
// clauses and treated the receipt INSERT as a no-op; this one reads the
// stored row and the processed_mutations receipt back.

function makeDb(seed: Array<[string, Record<string, unknown>]> = []) {
  const db = prodSchemaDb()
  for (const [table, row] of seed) insertRow(db, table, row)
  return db
}

/** The seq the v53 trigger gave a seeded row: the base a PB writer holds. */
const seqOf = (db: ReturnType<typeof prodSchemaDb>, table: string, id: string) =>
  (db.prepare(`SELECT seq FROM ${table} WHERE id = ?`).get(id) as { seq: number }).seq

const fakeUser: AuthUser = {
  email: 'nate@umn.edu',
  name: 'Nate Mesfin',
  isNick: false,
} as unknown as AuthUser

// M07: handleMutations now requires PI/API-key auth. Use a stable test key so
// validateApiKey(request, env) returns true, bypassing the getPiEmails DB call.
const TEST_API_KEY = 'test-mutations-api-key'

function makeRequest(mutations: Mutation[]): Request {
  return new Request('https://example.com/api/mutations', {
    method: 'POST',
    body: JSON.stringify({ mutations }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_API_KEY}`,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const taskId = 'task_01hwtest_mut_notes_0001'

const seededTask = (): [string, Record<string, unknown>] => ['tasks', {
  id: taskId,
  title: 'Confidential task',
  description: 'Team-visible description',
  assignee: 'nate-mesfin',
  status: 'todo',
  completed: 0,
  priority: 'medium',
  notes: 'PRIVATE brain.db note — must not reach team via mutations',
}]

type Body = { results: Array<{ status: string; canonical_payload?: Record<string, unknown> }> }

async function send(db: ReturnType<typeof prodSchemaDb>, mut: Mutation): Promise<Body> {
  const env = { DB: d1Adapter(db), PB_API_KEY: TEST_API_KEY } as unknown as Env
  const res = await handleMutations(makeRequest([mut]), fakeUser, env)
  return await res.json() as Body
}

function taskUpdate(db: ReturnType<typeof prodSchemaDb>, mutationId: string): Mutation {
  return {
    mutation_id: mutationId,
    origin_machine: 'home',
    table: 'tasks',
    op: 'update',
    record_id: taskId,
    base_seq: seqOf(db, 'tasks', taskId),
    base_row_hash: null,
    patch: { status: 'in_progress' },
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  }
}

describe('mutations canonical_payload — SEC-P2-03 notes not in response', () => {
  it('task UPDATE canonical_payload does not contain notes', async () => {
    const db = makeDb([seededTask()])
    const body = await send(db, taskUpdate(db, 'mut_notes_test_update_0001'))

    expect(body.results[0].status).toMatch(/^(accepted|merged_clean)$/)
    const payload = body.results[0].canonical_payload
    expect(payload).toBeDefined()
    expect(payload).not.toHaveProperty('notes')
    expect(JSON.stringify(body)).not.toContain('PRIVATE')

    // The write landed and the private note is still stored (stripped on the
    // wire, not erased), and the receipt it replays from does not carry it.
    const row = db.prepare('SELECT status, notes FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>
    expect(row.status).toBe('in_progress')
    expect(row.notes).toMatch(/^PRIVATE/)
    const receipt = receiptOf(db, 'mut_notes_test_update_0001')!
    expect(receipt.outcome).toBe(body.results[0].status)
    expect(receipt.original_response_json).not.toContain('PRIVATE')
  })

  it('task UPDATE canonical_payload still has non-private fields', async () => {
    const db = makeDb([seededTask()])
    const body = await send(db, taskUpdate(db, 'mut_notes_test_update_0002'))

    const payload = body.results[0].canonical_payload
    expect(payload).toHaveProperty('id', taskId)
    expect(payload).toHaveProperty('description', 'Team-visible description')
    expect(payload).toHaveProperty('assignee', 'nate-mesfin')
    expect(payload).toHaveProperty('status', 'in_progress')
  })

  it('task INSERT carrying notes is REJECTED outright (pb-schema 0.4.0 wire contract)', async () => {
    // pb-schema 0.4.0 (2026-06-10) retired the vestigial `notes` wire alias from
    // TABLE_FIELDS.tasks. The old SEC-P2-03 behavior (accept + strip from the
    // canonical_payload echo) is superseded: an unknown field now ERRORS, which
    // makes the leak structurally impossible AND keeps schema drift visible.
    const newTaskId = 'task_01hwtest_mut_notes_insert_0001'
    const db = makeDb()  // empty — insert would create the row

    const body = await send(db, {
      mutation_id: 'mut_notes_test_insert_0001',
      origin_machine: 'home',
      table: 'tasks',
      op: 'insert',
      record_id: newTaskId,
      base_seq: null,
      base_row_hash: null,
      payload: {
        title: 'New task with private note',
        description: 'Team-visible description',
        assignee: 'nate-mesfin',
        status: 'todo',
        priority: 'medium',
        notes: 'PRIVATE note that must not be echoed',
        created_at: nowInstant(),
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    })

    expect(body.results[0].status).toBe('error')
    // And the error echo must not leak the note text back either.
    expect(JSON.stringify(body.results[0])).not.toContain('PRIVATE note')
    // Nothing was written.
    expect(db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(newTaskId)).toBeUndefined()
  })

  it('non-task table mutations are unaffected by task-specific stripping', async () => {
    // Projects don't have a notes column — verify no regression on project mutations.
    const projectId = 'proj_01hwtest_mut_notes_proj_0001'
    const db = makeDb([['projects', {
      id: projectId,
      slug: 'test-project',
      title: 'Test Project',
      status: 'active',
      stage: 'data_analysis',
      category: 'MNCCORE',
    }]])

    const body = await send(db, {
      mutation_id: 'mut_notes_test_proj_0001',
      origin_machine: 'home',
      table: 'projects',
      op: 'update',
      record_id: projectId,
      base_seq: seqOf(db, 'projects', projectId),
      base_row_hash: null,
      patch: { status: 'waiting_external' },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    })

    expect(body.results[0].status).toMatch(/^(accepted|merged_clean)$/)
    const payload = body.results[0].canonical_payload
    expect(payload).toHaveProperty('id', projectId)
    expect(payload).toHaveProperty('slug', 'test-project')
    expect((db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as { status: string }).status)
      .toBe('waiting_external')
    expect(receiptOf(db, 'mut_notes_test_proj_0001')!.outcome).toBe(body.results[0].status)
  })
})
