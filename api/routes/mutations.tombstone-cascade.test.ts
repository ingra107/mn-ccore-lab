// codex Fixes 1+2+3 (2026-05-11):
//   Fix 1: Tombstone resurrection guard — applyUpdate rejects updates to
//           soft-deleted rows unless patch explicitly sets deleted_at=null.
//   Fix 2: Task delete cascade in applyDelete — activity_entries /
//           notifications / task_subtasks cleaned atomically with the
//           soft-delete (one env.DB.batch()).
//   Fix 3: Project delete cascade in applyDelete — project children deleted
//           and tasks.project_id NULLed in the same batch.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old stub kept rows in a Map, parsed SET clauses by text, treated every
// DELETE as a string to record (it removed nothing), ran batch() statements
// one by one with no rollback, and stored a receipt whatever its values were.
// Its project row even carried a `name` column projects does not have. Here
// the parent and its children are real rows (real FKs, the tasks/projects seq
// triggers, processed_mutations' NOT NULL columns), each cascade is checked by
// reading which children are gone and which unrelated controls survived, the
// receipt is read back, and a failing cascade statement is shown to roll the
// whole delete back, as D1's batch does.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyUpdate, applyDelete } from './mutations'
import type { Mutation } from './mutations'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow, receiptOf } from '../test-support/prod-schema-db'

const user = { email: 'test@example.com', slug: 'test' } as AuthUser

let db: InstanceType<typeof Database>
let env: Env
let writes: string[]
beforeEach(() => {
  db = prodSchemaDb()
  writes = []
  env = { DB: d1Adapter(db, { onExec: (sql) => { if (!/^\s*SELECT\b/i.test(sql)) writes.push(sql.trim()) } }) } as unknown as Env
})

function mut(overrides: Partial<Mutation> & Pick<Mutation, 'mutation_id' | 'op' | 'table' | 'record_id'>): Mutation {
  return {
    patch: null,
    payload: null,
    base_seq: null,
    base_row_hash: null,
    depends_on: null,
    origin_machine: 'pb:home',
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  } as Mutation
}

function seedTask(id: string, extra: Record<string, unknown> = {}) {
  return insertRow(db, 'tasks', { id, title: `Task ${id}`, assignee: 'nick-ingraham', ...extra })
}

const row = (table: string, id: string) =>
  db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined
const ids = (table: string) =>
  (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: string }>).map((r) => r.id)

// ── Fix 1: Tombstone resurrection guard ──────────────────────────────────────

describe('Fix 1: applyUpdate rejects updates to deleted rows', () => {
  const taskId = 'task_01tombstone_res_guard_00001'
  beforeEach(() => {
    seedTask(taskId, { title: 'Tombstoned task', status: 'deleted', deleted_at: '2026-05-10 12:00:00', last_mutation_id: 'mut_old' })
  })

  it('rejects a field-only patch (no status change) on a deleted task', async () => {
    // The dangerous resurrection path: updating due_date/priority/etc on a
    // tombstoned row without intending to undelete. Without the guard this
    // silently applies the patch and leaves an inconsistent tombstone.
    const before = row('tasks', taskId)
    const result = await applyUpdate(env, mut({
      mutation_id: 'mut_tombstone_test_001', op: 'update', table: 'tasks', record_id: taskId,
      patch: { due_date: '2026-06-01' }, // no status change, no deleted_at clear
    }), user)

    expect(result.status).toBe('error')
    expect(result.reason).toContain('deleted')
    // Row must remain untouched (seq included), and nothing was written.
    expect(row('tasks', taskId)).toEqual(before)
    expect(writes).toEqual([])
    expect(receiptOf(db, 'mut_tombstone_test_001')).toBeUndefined()
  })

  it('allows status=todo patch on deleted row (I7-INVERSE: PB outbox undelete path)', async () => {
    // PB sends op=update + patch={status:'todo'} when correcting a deletion.
    // The I7-INVERSE bridge in applyPatch co-clears deleted_at.
    // The guard must allow this through (status is a live value).
    const result = await applyUpdate(env, mut({
      mutation_id: 'mut_tombstone_test_001b', op: 'update', table: 'tasks', record_id: taskId,
      patch: { status: 'todo' },
    }), user)

    expect(result.status).toBe('accepted')
    expect(row('tasks', taskId)).toMatchObject({ status: 'todo', deleted_at: null, last_mutation_id: 'mut_tombstone_test_001b' })
    expect(receiptOf(db, 'mut_tombstone_test_001b')).toMatchObject({ outcome: 'accepted', table_name: 'tasks', record_id: taskId })
  })

  it('allows a patch that explicitly clears deleted_at (undelete path)', async () => {
    const result = await applyUpdate(env, mut({
      mutation_id: 'mut_tombstone_test_002', op: 'update', table: 'tasks', record_id: taskId,
      patch: { status: 'todo', deleted_at: null }, // explicit undelete
    }), user)

    expect(result.status).toBe('accepted')
    expect(row('tasks', taskId)).toMatchObject({ status: 'todo', deleted_at: null, last_mutation_id: 'mut_tombstone_test_002' })
    const receipt = receiptOf(db, 'mut_tombstone_test_002')
    expect(receipt).toMatchObject({ outcome: 'accepted', record_id: taskId })
    expect(JSON.parse(receipt!.original_response_json)).toMatchObject({ mutation_id: 'mut_tombstone_test_002', status: 'accepted' })
  })
})

// ── Fix 2: Task delete cascade ────────────────────────────────────────────────

describe('Fix 2: applyDelete cascades for tasks table', () => {
  const taskId = 'task_01cascade_test_task_000001'
  const otherId = 'task_01cascade_test_control_01'

  function seedChildren(owner: string, tag: string) {
    insertRow(db, 'activity_entries', { id: `ae_${tag}`, entity_type: 'task', entity_id: owner, kind: 'comment', actor_slug: 'nick-ingraham', body: 'c' })
    insertRow(db, 'notifications', { id: `n_${tag}`, recipient_slug: 'nick-ingraham', type: 'comment', source_type: 'task_comment', source_id: owner, title: 't' })
    insertRow(db, 'task_subtasks', { id: `st_${tag}`, task_id: owner, title: 's' })
  }

  beforeEach(() => {
    seedTask(taskId, { title: 'Task with comments' })
    seedTask(otherId, { title: 'Unrelated task' })
    seedChildren(taskId, 'mine')
    seedChildren(otherId, 'ctl')
  })

  it('soft-deletes the task and deletes its activity_entries, notifications and subtasks, and only its own', async () => {
    const result = await applyDelete(env, mut({ mutation_id: 'mut_cascade_test_001', op: 'delete', table: 'tasks', record_id: taskId }), user)

    expect(result.status).toBe('accepted')
    expect(row('tasks', taskId)).toMatchObject({ status: 'deleted', last_mutation_id: 'mut_cascade_test_001' })
    expect(row('tasks', taskId)?.deleted_at).not.toBeNull()
    // Design C (v77) unified-timeline rows, notifications and subtasks are gone;
    // the unrelated task's children are untouched.
    expect(ids('activity_entries').filter((i) => i.startsWith('ae_'))).toEqual(['ae_ctl'])
    expect(ids('notifications')).toEqual(['n_ctl'])
    expect(ids('task_subtasks')).toEqual(['st_ctl'])
    expect(row('tasks', otherId)?.deleted_at).toBeNull()
    // task_comments/task_updates were dropped (schema-v78): nothing names them.
    expect(writes.join(' ')).not.toMatch(/task_comments|task_updates/)
    expect(receiptOf(db, 'mut_cascade_test_001')).toMatchObject({ outcome: 'accepted', table_name: 'tasks', record_id: taskId })
  })

  it('a failing cascade statement rolls the whole delete back (one batch, #8842 R1)', async () => {
    const failing = { DB: d1Adapter(db, { failSql: /^DELETE FROM task_subtasks/, failTimes: 1 }) } as unknown as Env
    const outcome = await applyDelete(failing, mut({ mutation_id: 'mut_cascade_test_rb', op: 'delete', table: 'tasks', record_id: taskId }), user)
      .then((r) => r.status, (e: Error) => `threw: ${e.message}`)

    expect(outcome).not.toBe('accepted')
    // Parent still live, every child still there, no receipt.
    expect(row('tasks', taskId)).toMatchObject({ status: 'todo', deleted_at: null })
    expect(ids('activity_entries').filter((i) => i.startsWith('ae_'))).toEqual(['ae_ctl', 'ae_mine'])
    expect(ids('notifications')).toEqual(['n_ctl', 'n_mine'])
    expect(ids('task_subtasks')).toEqual(['st_ctl', 'st_mine'])
    expect(receiptOf(db, 'mut_cascade_test_rb')).toBeUndefined()
  })

  it('a soft-delete that matches 0 rows (a peer deleted first) commits no cascade: the children wait for the parent landing', async () => {
    // No error, so no rollback: the batch commits, but this mutation's UPDATE
    // finds deleted_at already set and changes nothing. Only the `AND landed`
    // gate on each cascade statement keeps the children (the peer's own
    // delete owns its cascade).
    let fired = false
    const racing = {
      DB: d1Adapter(db, {
        beforeBatch: () => {
          if (fired) return
          fired = true
          db.prepare("UPDATE tasks SET status = 'deleted', deleted_at = '2026-05-10 12:00:00', last_mutation_id = 'mut_peer' WHERE id = ?").run(taskId)
        },
      }),
    } as unknown as Env
    const result = await applyDelete(racing, mut({ mutation_id: 'mut_cascade_test_race', op: 'delete', table: 'tasks', record_id: taskId }), user)

    expect(fired).toBe(true)
    expect(result.status).toBe('accepted')
    expect(result.reason).toContain('already deleted')
    expect(row('tasks', taskId)).toMatchObject({ last_mutation_id: 'mut_peer' })
    expect(ids('activity_entries').filter((i) => i.startsWith('ae_'))).toEqual(['ae_ctl', 'ae_mine'])
    expect(ids('notifications')).toEqual(['n_ctl', 'n_mine'])
    expect(ids('task_subtasks')).toEqual(['st_ctl', 'st_mine'])
    expect(receiptOf(db, 'mut_cascade_test_race')).toBeUndefined()
  })

  it('is idempotent on an already-deleted task (no cascade re-run)', async () => {
    db.prepare("UPDATE tasks SET status = 'deleted', deleted_at = '2026-05-10 12:00:00' WHERE id = ?").run(taskId)
    const before = row('tasks', taskId)

    const result = await applyDelete(env, mut({ mutation_id: 'mut_cascade_test_002', op: 'delete', table: 'tasks', record_id: taskId }), user)

    // Already deleted — early-return path, no cascade
    expect(result.status).toBe('accepted')
    expect(result.reason).toContain('already deleted')
    expect(writes).toEqual([])
    expect(row('tasks', taskId)).toEqual(before)
    expect(ids('task_subtasks')).toEqual(['st_ctl', 'st_mine'])
  })
})

// ── Fix 3: Project delete cascade ────────────────────────────────────────────

describe('Fix 3: applyDelete cascades for projects table', () => {
  const projId = 'proj_01cascade_test_proj_000001'
  const otherProj = 'proj_01cascade_test_control_01'

  it('deletes project_documents/milestones/activity_entries and NULLs live tasks.project_id, for this project only', async () => {
    insertRow(db, 'projects', { id: projId, slug: 'test-project', title: 'Test Project' })
    insertRow(db, 'projects', { id: otherProj, slug: 'control-project', title: 'Control Project' })
    for (const [p, tag] of [[projId, 'mine'], [otherProj, 'ctl']]) {
      insertRow(db, 'project_documents', { id: `doc_${tag}`, project_id: p, title: 'd', url: 'https://example.com/d' })
      insertRow(db, 'milestones', { id: `ms_${tag}`, project_id: p, title: 'm' })
      insertRow(db, 'activity_entries', { id: `ae_${tag}`, entity_type: 'project', entity_id: p, project_id: p, kind: 'comment', actor_slug: 'nick-ingraham', body: 'c' })
    }
    seedTask('task_live_in_proj', { project_id: projId })
    seedTask('task_dead_in_proj', { project_id: projId, status: 'deleted', deleted_at: '2026-05-01 00:00:00' })
    seedTask('task_in_control', { project_id: otherProj })

    const result = await applyDelete(env, mut({ mutation_id: 'mut_cascade_test_003', op: 'delete', table: 'projects', record_id: projId }), user)

    expect(result.status).toBe('accepted')
    expect(row('projects', projId)).toMatchObject({ last_mutation_id: 'mut_cascade_test_003' })
    expect(row('projects', projId)?.deleted_at).not.toBeNull()
    expect(ids('project_documents')).toEqual(['doc_ctl'])
    expect(ids('milestones')).toEqual(['ms_ctl'])
    expect(ids('activity_entries').filter((i) => i.startsWith('ae_'))).toEqual(['ae_ctl'])
    // Live tasks are soft-orphaned (kept, project_id NULL); a tombstoned task
    // keeps its pointer; another project's task is untouched.
    expect(row('tasks', 'task_live_in_proj')).toMatchObject({ project_id: null, deleted_at: null })
    expect(row('tasks', 'task_dead_in_proj')?.project_id).toBe(projId)
    expect(row('tasks', 'task_in_control')?.project_id).toBe(otherProj)
    // comments/project_updates were dropped (schema-v78): nothing names them.
    expect(writes.join(' ')).not.toMatch(/DELETE FROM comments|project_updates/)
    expect(receiptOf(db, 'mut_cascade_test_003')).toMatchObject({ outcome: 'accepted', table_name: 'projects', record_id: projId })
  })
})
