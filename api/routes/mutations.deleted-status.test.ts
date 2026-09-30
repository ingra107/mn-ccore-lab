// I7 regression test (2026-05-03): op='update' with patch.status='deleted'
// must co-apply deleted_at so Hub D1 rows don't stay visible with I7 invariant
// "deleted brain.db task still active on Hub".
//
// We exercise applyPatch indirectly through applyUpdate, the exported path
// processOne reaches when op='update'.
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// This file used to say it ran on "the miniflare in-process D1 stub"; it ran on
// a hand-written SET-clause parser whose receipt INSERT was a no-op and which
// had no completion-triad trigger, so a status-only `done` patch passed here
// whatever applyPatch did with completed/completed_at. Prod's v98 guard refuses
// that row; the test now meets the guard and reads the receipt.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

const taskId = 'task_01hwtest000000000000000001'
const fakeUser = { email: 'test@example.com', role: 'admin' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

/** Seed the task and return the seq the v53 trigger gave it (the base a PB writer holds). */
function seed(row: Record<string, unknown>): number {
  const full: Record<string, unknown> = { id: taskId, assignee: 'nick', ...row }
  const cols = Object.keys(full)
  db.prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => full[c]))
  return (db.prepare('SELECT seq FROM tasks WHERE id = ?').get(taskId) as { seq: number }).seq
}

function upd(mutationId: string, baseSeq: number, patch: Record<string, unknown>): Mutation {
  return {
    mutation_id: mutationId,
    origin_machine: 'home',
    table: 'tasks',
    op: 'update',
    record_id: taskId,
    base_seq: baseSeq,
    base_row_hash: null,
    patch,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  } as Mutation
}

const rowOf = () => db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>
const receiptOf = (id: string) =>
  db.prepare('SELECT outcome, original_response_json FROM processed_mutations WHERE mutation_id = ?').get(id) as
    | { outcome: string; original_response_json: string }
    | undefined

describe('I7 fix — op=update with status=deleted sets deleted_at', () => {
  it('sets deleted_at when status=deleted and deleted_at was NULL', async () => {
    const base = seed({ title: 'Test task', status: 'todo' })
    const result = await applyUpdate(env, upd('mut_01hwtest000000000000000001', base, { status: 'deleted' }), fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = rowOf()
    expect(row.status).toBe('deleted')
    expect(typeof row.deleted_at).toBe('string')
    expect((row.deleted_at as string).length).toBeGreaterThan(0)
    expect(receiptOf('mut_01hwtest000000000000000001')!.outcome).toBe(result.status)
  })

  it('does not overwrite deleted_at when already set (idempotent)', async () => {
    const existingDeletedAt = '2026-05-01 12:00:00'
    const base = seed({ title: 'Already deleted', status: 'deleted', deleted_at: existingDeletedAt, last_mutation_id: 'mut_prev' })

    const result = await applyUpdate(env, upd('mut_01hwtest000000000000000002', base, { status: 'deleted' }), fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(rowOf().deleted_at).toBe(existingDeletedAt)
  })

  it('does NOT set deleted_at for non-deleted status updates', async () => {
    // A full completion triad: prod's v98 trigger refuses status=done without
    // completed=1 and completed_at (see the next test).
    const base = seed({ title: 'Active task', status: 'todo' })
    const result = await applyUpdate(
      env,
      upd('mut_01hwtest000000000000000003', base, { status: 'done', completed: 1, completed_at: '2026-05-03 09:00:00' }),
      fakeUser,
    )

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = rowOf()
    expect(row.status).toBe('done')
    expect(row.deleted_at).toBeNull()
    expect(receiptOf('mut_01hwtest000000000000000003')!.outcome).toBe(result.status)
  })

  it('a status-only `done` patch meets the prod completion-triad guard, row untouched', async () => {
    // The old stub accepted this. Prod refuses it (schema-v98); applyUpdate
    // surfaces the RAISE as a thrown constraint error, which processOne
    // records as `apply error:` (pinned end-to-end in mutations.cas-race.test.ts).
    const base = seed({ title: 'Active task', status: 'todo' })
    await expect(applyUpdate(env, upd('mut_01hwtest000000000000000006', base, { status: 'done' }), fakeUser))
      .rejects.toThrow(/completion triad guard/)
    expect(rowOf().status).toBe('todo')
    expect(receiptOf('mut_01hwtest000000000000000006')).toBeUndefined()
  })

  // I7-INVERSE tests (2026-05-03): symmetric recovery path
  it('clears deleted_at when status transitions from deleted to a live status', async () => {
    const base = seed({ title: 'Restored task', status: 'deleted', deleted_at: '2026-05-03 14:24:33', last_mutation_id: 'mut_prev' })

    const result = await applyUpdate(env, upd('mut_01hwtest000000000000000004', base, { status: 'todo' }), fakeUser)

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    const row = rowOf()
    expect(row.status).toBe('todo')
    expect(row.deleted_at).toBeNull()
  })

  it('explicit deleted_at in patch wins over implicit co-flip (precedence rule)', async () => {
    const explicitTs = '2026-01-01 00:00:00'
    const base = seed({ title: 'Task with explicit deleted_at', status: 'deleted', deleted_at: '2026-05-03 14:24:33', last_mutation_id: 'mut_prev2' })

    // Patch sets status='todo' AND deleted_at explicitly — explicit wins, no co-flip.
    // deleted_at is not in the TABLE_FIELDS whitelist, so this calls applyUpdate
    // directly (not through processOne).
    const result = await applyUpdate(
      env,
      upd('mut_01hwtest000000000000000005', base, { status: 'todo', deleted_at: explicitTs }),
      fakeUser,
    )

    expect(result.status).toMatch(/^(accepted|merged_clean)$/)
    expect(rowOf().deleted_at).toBe(explicitTs)
  })
})
