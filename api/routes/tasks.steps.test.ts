// tasks.steps.test.ts — schema-v152 steps and check-ins on the real routes.
//
// Runs on the migration-chain database (api/test-support/prod-schema-db.ts):
// the v152 FK and triggers are the real ones, so each case reads back what the
// schema made of the write. Plan: PB Scratch/plans/2026-10-30-steps-checkins-RECONCILED.md.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { nowInstant } from '../lib/time'
import { applyDelete, applyMutation, releaseStepsSql } from './mutations'
import type { Mutation } from './mutations'
import {
  handleCreateTask, handleGetNextStepGaps, handleGetTask, handleGetTaskDetail, handleGetTasks, handleUpdateTask,
} from './tasks'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  insertRow(db, 'team_members', { slug: 'nick-ingraham', name: 'Nick' })
})

function mut(o: Partial<Mutation> & Pick<Mutation, 'mutation_id' | 'op' | 'table' | 'record_id'>): Mutation {
  return {
    patch: null, payload: null, base_seq: null, base_row_hash: null, depends_on: null,
    origin_machine: 'pb:home', client_ts: nowInstant(), issued_at: nowInstant(), ...o,
  } as Mutation
}
const task = (id: string, extra: Record<string, unknown> = {}) =>
  insertRow(db, 'tasks', { id, title: id, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...extra })
const row = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
const apiKey = (url: string, body?: unknown) => new Request(url, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

describe('deleting a parent releases its steps (applyDelete dependents)', () => {
  it('a live step loses its parent and stays live; a deleted step is left alone; seq moves', async () => {
    task('task_P')
    task('task_S1', { parent_id: 'task_P' })
    task('task_S2', { parent_id: 'task_P', status: 'deleted', deleted_at: '2026-10-29 00:00:00' })
    const seqBefore = row('task_S1').seq as number

    const r = await applyDelete(env, mut({ mutation_id: 'mut_del_parent', op: 'delete', table: 'tasks', record_id: 'task_P' }), user)
    expect(r.status).toBe('accepted')
    expect(row('task_P').deleted_at).not.toBeNull()
    expect(row('task_S1').parent_id).toBeNull()
    expect(row('task_S1').deleted_at).toBeNull()
    expect(row('task_S1').seq as number).toBeGreaterThan(seqBefore)
    expect(row('task_S2').parent_id).toBe('task_P')
  })

  it('the release statement is one UPDATE scoped to live rows', () => {
    expect(releaseStepsSql()).toMatch(/^UPDATE tasks SET parent_id = NULL, .* WHERE parent_id = \? AND deleted_at IS NULL$/)
  })
})

describe('/api/mutations refuses a parent close while a step is open', () => {
  it('arrives as code constraint, and lands once the step is done', async () => {
    task('task_P')
    task('task_S', { parent_id: 'task_P' })
    const close = { status: 'done', completed: 1, completed_at: '2026-10-30 12:00:00', completed_by: 'ingra107@umn.edu' }
    const patch = (record_id: string) => applyMutation(env, { table: 'tasks', record_id, op: 'update', patch: close, route: 'test', user })
    const refused = await patch('task_P')
    expect(refused.status).toBe('error')
    expect(refused.code).toBe('constraint')
    expect(refused.reason).toMatch(/task_parent_open_steps/)
    expect(row('task_P').status).toBe('todo')

    expect((await patch('task_S')).status).toBe('accepted')
    expect((await patch('task_P')).status).toBe('accepted')
    expect(row('task_P').status).toBe('done')
  })

  it('an insert of a step under a step is refused with code constraint', async () => {
    task('task_P')
    task('task_S', { parent_id: 'task_P' })
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_G', op: 'insert', route: 'test', user,
      payload: { title: 'grandchild', assignee: 'nick-ingraham', status: 'todo', parent_id: 'task_S' },
    })
    expect(r.status).toBe('error')
    expect(r.code).toBe('constraint')
    expect(db.prepare("SELECT 1 FROM tasks WHERE id = 'task_G'").get()).toBeUndefined()
  })
})

describe('step progress on the reads', () => {
  beforeEach(() => {
    task('task_P')
    task('task_S1', { parent_id: 'task_P', status: 'done', completed: 1, completed_at: '2026-10-30 10:00:00' })
    task('task_S2', { parent_id: 'task_P' })
    task('task_S3', { parent_id: 'task_P', status: 'deleted', deleted_at: '2026-10-29 00:00:00' })
  })

  it('the list read carries step_total / step_done (deleted steps not counted)', async () => {
    const res = await handleGetTasks(new URL('https://x/api/tasks'), env)
    const { data } = await res.json() as { data: Array<Record<string, unknown>> }
    const p = data.find((t) => t.id === 'task_P')!
    expect([p.step_total, p.step_done]).toEqual([2, 1])
    expect(p.parent_id).toBeNull()
    const s = data.find((t) => t.id === 'task_S2')!
    expect([s.step_total, s.step_done, s.parent_id]).toEqual([0, 0, 'task_P'])
  })

  it('the PB sync read (seq_after) mirrors stored columns only', async () => {
    const res = await handleGetTasks(new URL('https://x/api/tasks?seq_after=0'), env, true)
    const { data } = await res.json() as { data: Array<Record<string, unknown>> }
    const p = data.find((t) => t.id === 'task_P')!
    expect('step_total' in p).toBe(false)
    expect(data.find((t) => t.id === 'task_S2')!.parent_id).toBe('task_P')
  })

  it('GET /api/tasks/:id carries the counts; the detail lists the live steps', async () => {
    const one = await (await handleGetTask('task_P', env)).json() as { data: Record<string, unknown> }
    expect([one.data.step_total, one.data.step_done]).toEqual([2, 1])
    const detail = await (await handleGetTaskDetail('task_P', apiKey('https://x/api/tasks/task_P/detail'), env)).json() as {
      data: { steps: Array<{ id: string }> }
    }
    expect(detail.data.steps.map((s) => s.id).sort()).toEqual(['task_S1', 'task_S2'])
  })
})

describe('creating a step and a check-in through the REST routes', () => {
  it('POST /api/tasks with parent_id creates a step', async () => {
    task('task_P')
    const res = await handleCreateTask(apiKey('https://x/api/tasks', {
      description: 'Step one', assignee: 'nick-ingraham', parent_id: 'task_P',
    }), user, env)
    expect(res.status).toBe(201)
    const { data } = await res.json() as { data: { id: string; parent_id: string } }
    expect(data.parent_id).toBe('task_P')
  })

  it('kind=checkin is accepted with its title, refused without it', async () => {
    const ok = await handleCreateTask(apiKey('https://x/api/tasks', {
      description: 'Check in: CQODE -- what is next?', assignee: 'nick-ingraham', kind: 'checkin',
    }), user, env)
    expect(ok.status).toBe(201)
    const bad = await handleCreateTask(apiKey('https://x/api/tasks', {
      description: 'CQODE follow-up', assignee: 'nick-ingraham', kind: 'checkin',
    }), user, env)
    expect(bad.status).toBe(409)
    expect(await bad.text()).toMatch(/checkin_title/)
  })

  it('an existing check-in can be patched through the update route', async () => {
    task('task_C', { kind: 'checkin', title: 'Check in: X' })
    const res = await handleUpdateTask('task_C', apiKey('https://x/api/tasks/task_C', { due_date: '2026-11-02' }), user, env)
    expect(res.status).toBe(200)
  })
})

describe('GET /api/projects/next-step-gaps', () => {
  const project = (id: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'projects', { id, slug: id.replace('proj_', 'slug-'), title: id, category: 'MNCCORE', status: 'active', ...extra })

  it('lists active projects with no open kind=task row that is not a parent', async () => {
    project('proj_has_task'); task('t1', { project_id: 'proj_has_task' })
    project('proj_waiting_task'); task('t2', { project_id: 'proj_waiting_task', status: 'waiting_external' })
    project('proj_step_only')
    task('t3p', { project_id: 'proj_step_only' }); task('t3s', { project_id: 'proj_step_only', parent_id: 't3p' })
    project('proj_parent_only')
    task('t4p', { project_id: 'proj_parent_only' }); task('t4s', { parent_id: 't4p' })
    project('proj_checkin_only'); task('t5', { project_id: 'proj_checkin_only', kind: 'checkin', title: 'Check in: A' })
    project('proj_milestone_only'); task('t6', { project_id: 'proj_milestone_only', kind: 'milestone' })
    project('proj_done_only'); task('t7', { project_id: 'proj_done_only', status: 'done', completed: 1, completed_at: '2026-10-01' })
    project('proj_deleted_only'); task('t8', { project_id: 'proj_deleted_only', status: 'deleted', deleted_at: '2026-10-01' })
    project('proj_empty', { tier: '1-Weekly' })
    project('proj_paused', { status: 'waiting_external' })

    const res = await handleGetNextStepGaps(env)
    const { data, count } = await res.json() as { data: Array<{ id: string }>; count: number }
    const got = data.map((p) => p.id)
    expect(got.sort()).toEqual([
      'proj_checkin_only', 'proj_deleted_only', 'proj_done_only', 'proj_empty', 'proj_milestone_only', 'proj_parent_only',
    ].sort())
    expect(count).toBe(6)
    // Weekly tier first.
    expect(data[0].id).toBe('proj_empty')
  })
})
