// M33 regression test (2026-05-29): applyDelete (Site 1 forward guard).
//
// Asserts that a post-op=delete tasks row reads status='deleted' AND
// deleted_at IS NOT NULL. Prior to M33, applyDelete stamped deleted_at
// without setting status — PB's pull guard (hub.py:1315-1339) refused the
// row as a malformed tombstone, creating a dead-letter loop.
//
// Also asserts that applyDelete on a Lane-3 table (sessions, which has no
// status column) does NOT set status — the STATUS_BEARING_DELETE_TABLES gate.
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts),
// not the SET-clause-parsing stub it used to. The stub treated the receipt
// INSERT and the cascade DELETEs as no-ops, so a NULL receipt body (the
// 2026-09-24 bug: original_response_json is NOT NULL in prod) passed here.
// Every test below now also reads the receipt row the batch wrote.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyDelete } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

function del(table: string, recordId: string, mutationId: string, baseSeq: number | null): Mutation {
  return {
    mutation_id: mutationId,
    origin_machine: 'home',
    table,
    op: 'delete',
    record_id: recordId,
    base_seq: baseSeq,
    base_row_hash: null,
    patch: {},
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  } as Mutation
}

const receipt = (id: string) =>
  db.prepare('SELECT outcome, original_response_json, table_name, record_id FROM processed_mutations WHERE mutation_id = ?').get(id) as
    | { outcome: string; original_response_json: string; table_name: string; record_id: string }
    | undefined

describe('M33 forward guard — applyDelete (Site 1: mutations.ts)', () => {
  it('stamps status=deleted AND deleted_at on a tasks row, with a receipt', async () => {
    const taskId = 'task_01hw_m33_test_000000000001'
    db.prepare("INSERT INTO tasks (id, title, assignee, status) VALUES (?, 'M33 test task', 'nick', 'todo')").run(taskId)

    const result = await applyDelete(env, del('tasks', taskId, 'mut_01hw_m33_test_000000000001', null), fakeUser)
    expect(result.status).toBe('accepted')

    const row = db.prepare('SELECT status, deleted_at, last_mutation_id FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>
    expect(row.status).toBe('deleted')
    expect(typeof row.deleted_at).toBe('string')
    expect((row.deleted_at as string).length).toBeGreaterThan(0)
    expect(row.last_mutation_id).toBe('mut_01hw_m33_test_000000000001')

    const r = receipt('mut_01hw_m33_test_000000000001')!
    expect(r.outcome).toBe('accepted')
    expect(r.table_name).toBe('tasks')
    expect(JSON.parse(r.original_response_json).status).toBe('accepted')
  })

  it('stamps status=deleted AND deleted_at on a projects row, with a receipt', async () => {
    const projId = 'proj_01hw_m33_test_000000000001'
    db.prepare("INSERT INTO projects (id, title, slug, status) VALUES (?, 'M33 test project', 'm33-test-project', 'active')").run(projId)

    const result = await applyDelete(env, del('projects', projId, 'mut_01hw_m33_test_000000000002', null), fakeUser)
    expect(result.status).toBe('accepted')

    const row = db.prepare('SELECT status, deleted_at FROM projects WHERE id = ?').get(projId) as Record<string, unknown>
    expect(row.status).toBe('deleted')
    expect(typeof row.deleted_at).toBe('string')
    expect((row.deleted_at as string).length).toBeGreaterThan(0)
    expect(receipt('mut_01hw_m33_test_000000000002')!.outcome).toBe('accepted')
  })

  it('does NOT set status on a Lane-3 table (sessions has no status column)', async () => {
    // The old stub accepted any status here and checked the SQL only if one
    // was captured. On the real schema a `status = 'deleted'` clause on
    // sessions is "no such column", so a landed delete IS the assertion.
    const sessId = 'session_2026-05-29T00-00-00_m33test'
    db.prepare('INSERT INTO sessions (session_id) VALUES (?)').run(sessId)
    expect(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('sessions') WHERE name = 'status'").get()).toEqual({ n: 0 })

    const result = await applyDelete(env, del('sessions', sessId, 'mut_01hw_m33_test_000000000003', null), fakeUser)
    expect(result.status).toBe('accepted')

    const row = db.prepare('SELECT deleted_at, last_mutation_id FROM sessions WHERE session_id = ?').get(sessId) as Record<string, unknown>
    expect(typeof row.deleted_at).toBe('string')
    expect(row.last_mutation_id).toBe('mut_01hw_m33_test_000000000003')
    expect(receipt('mut_01hw_m33_test_000000000003')!.outcome).toBe('accepted')
  })

  it('is idempotent: already-deleted row returns accepted without re-deleting', async () => {
    const taskId = 'task_01hw_m33_test_000000000004'
    const existingDeletedAt = '2026-05-28 10:00:00'
    db.prepare(
      "INSERT INTO tasks (id, title, assignee, status, deleted_at, last_mutation_id) VALUES (?, 'Already deleted', 'nick', 'deleted', ?, 'mut_prev')",
    ).run(taskId, existingDeletedAt)

    const result = await applyDelete(env, del('tasks', taskId, 'mut_01hw_m33_test_000000000005', null), fakeUser)
    expect(result.status).toBe('accepted')
    const row = db.prepare('SELECT deleted_at, last_mutation_id FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>
    expect(row.deleted_at).toBe(existingDeletedAt)
    expect(row.last_mutation_id).toBe('mut_prev')
  })
})
