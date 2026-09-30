// mutations.restore-roundtrip.test.ts — delete → restore convergence contract
// (2026-07-21, quick-delete of over-produced meeting action items).
//
// WHY A SECOND TEST FILE: tasks.restore.test.ts mocks applyMutation, so it can
// only prove the SHAPE of the envelope handleRestoreTask emits. It cannot prove
// that shape actually un-sets the tombstone — the seam under test is stubbed
// out. This file stubs nothing in the mutation path: it runs the REAL
// applyDelete, then the REAL applyUpdate → applyPatch, and asserts the
// resulting ROW.
//
// The assertion that matters is `deleted_at === null` AFTER the restore. If
// I7-INVERSE ever stops firing — or someone "helpfully" adds an explicit
// deleted_at to the restore patch, which SUPPRESSES the co-clear via the
// explicit-wins precedence in applyPatch — the row would rest at
// `{ status: 'todo', deleted_at: <set> }`. That is the shape PB's pull refuses
// as suspicious-alive (sync.pull.tombstone_inconsistent_state_refused,
// hub.py:2093-2117): the Hub row would read alive while brain.db stayed
// tombstoned, and the two stores would never converge. Green here is the only
// thing standing between "undo worked" and a silent cross-store split.
//
// #8862: the database is the migration chain (api/test-support/prod-schema-db.ts).
// This file used to copy a SET-clause parser from the tombstone test and call
// its output "the real product of the real SQL"; only the UPDATE's SET list
// ran. The receipt INSERT, the cascade DELETEs, the CAS WHERE and the
// completion-triad trigger never did. Here they all do, and each round trip
// also reads the receipts the two batches wrote.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyDelete, applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser
const ID = 'task_restore_roundtrip_0001'

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

function mut(over: Partial<Mutation>): Mutation {
  return {
    mutation_id: `mut_${Math.random().toString(36).slice(2)}`,
    origin_machine: 'hub_ui:test',
    table: 'tasks',
    op: 'update',
    record_id: ID,
    base_seq: null,
    base_row_hash: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...over,
  } as Mutation
}

function seed(over: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id: ID,
    title: 'Over-produced action item',
    assignee: 'nick',
    status: 'todo',
    completed: 0,
    completed_at: null,
    completed_by: null,
    ...over,
  }
  const cols = Object.keys(row)
  db.prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]))
  return ID
}

const rowOf = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
const receiptOf = (mutationId: string) =>
  db.prepare('SELECT outcome, original_response_json FROM processed_mutations WHERE mutation_id = ?').get(mutationId) as
    | { outcome: string; original_response_json: string }
    | undefined

describe('delete → restore round trip (real applyDelete + applyUpdate)', () => {
  it('clears deleted_at and returns the row to a live status', async () => {
    const id = seed()

    const delMut = mut({ op: 'delete', record_id: id })
    const del = await applyDelete(env, delMut, fakeUser)
    expect(del.status).toBe('accepted')
    expect(receiptOf(delMut.mutation_id)!.outcome).toBe('accepted')

    // Tombstoned as PB expects: BOTH signals set.
    const tombstoned = rowOf(id)
    expect(tombstoned.status).toBe('deleted')
    expect(typeof tombstoned.deleted_at).toBe('string')

    // The exact patch handleRestoreTask emits — status only, NO deleted_at.
    const resMut = mut({
      op: 'update',
      record_id: id,
      patch: { status: 'todo', completed: 0, completed_at: null, completed_by: null },
    })
    const res = await applyUpdate(env, resMut, fakeUser)
    expect(res.status).toMatch(/^(accepted|merged_clean)$/)
    expect(JSON.parse(receiptOf(resMut.mutation_id)!.original_response_json).status).toBe(res.status)

    const restored = rowOf(id)
    // THE assertion: the tombstone is gone. A non-null deleted_at here is the
    // cross-store split described in the header.
    expect(restored.deleted_at).toBeNull()
    expect(restored.status).toBe('todo')
    expect(restored.completed).toBe(0)
    expect(restored.last_mutation_id).toBe(resMut.mutation_id)
  })

  it('restores a previously-DONE item with its completion triad intact', async () => {
    const id = seed({ status: 'done', completed: 1, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' })

    await applyDelete(env, mut({ op: 'delete', record_id: id }), fakeUser)
    expect(rowOf(id).status).toBe('deleted')

    const res = await applyUpdate(env, mut({
      op: 'update',
      record_id: id,
      patch: { status: 'done', completed: 1, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' },
    }), fakeUser)
    expect(res.status).toMatch(/^(accepted|merged_clean)$/)

    const restored = rowOf(id)
    expect(restored.deleted_at).toBeNull()
    expect(restored.status).toBe('done')
    expect(restored.completed).toBe(1)
    expect(restored.completed_at).toBe('2026-07-20 09:00:00')
  })

  it('a patch that does NOT address the deletion is refused (guard still armed)', async () => {
    const id = seed()

    await applyDelete(env, mut({ op: 'delete', record_id: id }), fakeUser)

    // No status in the patch → applyUpdate's tombstone resurrection guard must
    // reject rather than silently apply a field edit to a tombstoned row.
    const res = await applyUpdate(env, mut({
      op: 'update',
      record_id: id,
      patch: { due_date: '2026-08-01' },
    }), fakeUser)

    expect(res.status).toBe('error')
    expect(rowOf(id).deleted_at).not.toBeNull()
    expect(rowOf(id).due_date).toBeNull()
  })
})
