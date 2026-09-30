// mutations.i40-email-link.test.ts — I40 class-close: A3 applyPatch path (2026-06-13)
//
// PB outbox patches that carry source_thread_id route through applyPatch
// (the A3 /api/mutations handler). The earlier I40 fix (2026-06-10/11) only
// covered handleCreateTask, handleMobileTasksToHub, and handleUpdateTask.
// The A3 applyPatch path was the gap: a PB push with
//   op='update', patch={ source_thread_id: '...' }
// was written verbatim — no email_link derived. Caught live by PB invariant
// I40 on 2026-06-13 (task_01KTV6W01V3CA7HCVWZAKTCSKX, mut_01KTZZC9E2K2ZJZ6F3NZW8T5RV).
//
// These tests pin the derived-pair rule for the applyPatch code path.
//
// #8862: runs on the migration-chain database (api/test-support/prod-schema-db.ts)
// instead of a SET-clause-parsing stub whose receipt INSERT always succeeded.
// Each accepted write also has its receipt read back.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyUpdate } from './mutations'
import type { Mutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const fakeUser = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser

let db: InstanceType<typeof Database>
let env: import('../helpers').Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as import('../helpers').Env
})

/** Seed a live task; returns the seq the v53 trigger gave it. */
function seedTask(id: string, extra: Record<string, unknown> = {}): number {
  return insertRow(db, 'tasks', {
    id, title: 'Probe', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...extra,
  }).seq as number
}

function upd(mutationId: string, id: string, baseSeq: number, patch: Record<string, unknown>): Mutation {
  return {
    mutation_id: mutationId,
    origin_machine: 'home',
    table: 'tasks',
    op: 'update',
    record_id: id,
    base_seq: baseSeq,
    base_row_hash: null,
    patch,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
  } as Mutation
}

const rowOf = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>

describe('I40 fix — applyPatch (A3 path) derives email_link with source_thread_id', () => {
  it('A3 update patch with source_thread_id derives the paired Gmail link', async () => {
    const id = 'task_01i40test_a3_emaillink_0001'
    const base = seedTask(id)
    const result = await applyUpdate(env, upd('mut_01i40testA3elink000000001A', id, base, { source_thread_id: '19e83df442d6ce09' }), fakeUser)
    expect(result.status).toBe('accepted')
    expect(receiptOf(db, 'mut_01i40testA3elink000000001A')!.outcome).toBe('accepted')

    const row = rowOf(id)
    expect(row.source_thread_id).toBe('19e83df442d6ce09')
    expect(row.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/19e83df442d6ce09')
  })

  it('A3 update patch clearing source_thread_id clears email_link', async () => {
    const id = 'task_01i40test_a3_emaillink_0002'
    const base = seedTask(id, {
      source_thread_id: 'OLDTHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/OLDTHREAD',
    })
    const result = await applyUpdate(env, upd('mut_01i40testA3elink000000002A', id, base, { source_thread_id: null }), fakeUser)
    expect(result.status).toBe('accepted')

    const row = rowOf(id)
    expect(row.source_thread_id).toBeNull()
    expect(row.email_link).toBeNull()
  })

  it('A3 update patch without source_thread_id does not touch email_link', async () => {
    const id = 'task_01i40test_a3_emaillink_0003'
    const base = seedTask(id, {
      source_thread_id: 'SOMETHREAD',
      email_link: 'https://mail.google.com/mail/u/1/#inbox/SOMETHREAD',
    })
    const result = await applyUpdate(env, upd('mut_01i40testA3elink000000003A', id, base, { due_date: '2026-06-15' }), fakeUser)
    expect(result.status).toBe('accepted')

    const row = rowOf(id)
    // email_link stays as seeded — unrelated update must not clear it
    expect(row.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/SOMETHREAD')
    expect(row.source_thread_id).toBe('SOMETHREAD')
    expect(row.due_date).toBe('2026-06-15')
  })

  it('explicit email_link in A3 patch wins over the derived value', async () => {
    const id = 'task_01i40test_a3_emaillink_0004'
    const base = seedTask(id)
    const customLink = 'https://mail.google.com/mail/u/0/#all/CUSTOMTHREAD'
    const result = await applyUpdate(
      env,
      upd('mut_01i40testA3elink000000004A', id, base, { source_thread_id: 'SOMETHREAD', email_link: customLink }),
      fakeUser,
    )
    expect(result.status).toBe('accepted')

    // explicit email_link in the patch wins — derivation must not override it
    expect(rowOf(id).email_link).toBe(customLink)
  })
})
