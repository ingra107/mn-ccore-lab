// GET /api/tasks?completed_since=&ids= and GET /api/tasks/:id/blocking.
//
// The slices let the Today, Dashboard and Pulse surfaces, and the task detail
// panel's Dependencies section, stop downloading every task in the lab. They
// run on the migration-chain database (api/test-support/prod-schema-db.ts).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetTasks, handleGetBlockingTasks } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'

let db: InstanceType<typeof Database>
let env: any

function task(id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', {
    id, title: id, project_id: null, status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    completed: 0, created_at: '2026-09-01 00:00:00', ...extra,
  })
}

const listIds = async (qs: string) => {
  const res = await handleGetTasks(new URL(`https://x/api/tasks${qs}`), env)
  const body = (await res.json()) as { data: { id: string }[] }
  return { status: res.status, ids: (body.data ?? []).map((r) => r.id).sort() }
}

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) }
  task('t_open')
  task('t_open_blocked', { blocked_by: 't_open' })
  task('t_done_recent', { completed: 1, status: 'done', completed_at: '2026-10-10T15:00:00.000Z' })
  task('t_done_edge', { completed: 1, status: 'done', completed_at: '2026-10-06 00:00:00' })
  task('t_done_old', { completed: 1, status: 'done', completed_at: '2026-03-01T12:00:00.000Z' })
})

describe('GET /api/tasks?completed_since=', () => {
  it('returns open tasks plus tasks completed on or after the date', async () => {
    const { ids } = await listIds('?completed_since=2026-10-06')
    expect(ids).toEqual(['t_done_edge', 't_done_recent', 't_open', 't_open_blocked'])
  })

  it('drops older completions and keeps every open task', async () => {
    const { ids } = await listIds('?completed_since=2026-10-11')
    expect(ids).toEqual(['t_open', 't_open_blocked'])
  })

  it('combines with other filters', async () => {
    const { ids } = await listIds('?completed_since=2026-10-06&assignee=nobody')
    expect(ids).toEqual([])
  })

  it('without the param still returns the whole list', async () => {
    const { ids } = await listIds('')
    expect(ids).toHaveLength(5)
  })

  it('rejects trailing junk after a date', async () => {
    const { status } = await listIds('?completed_since=2026-10-06junk')
    expect(status).toBe(400)
  })

  it('rejects a value that is not a date', async () => {
    const { status } = await listIds("?completed_since=x'; DROP TABLE tasks;--")
    expect(status).toBe(400)
  })
})

describe('GET /api/tasks?ids=', () => {
  it('returns only the named tasks', async () => {
    const { ids } = await listIds('?ids=t_open,t_done_old')
    expect(ids).toEqual(['t_done_old', 't_open'])
  })

  it('an empty ids list matches nothing, not everything', async () => {
    const { ids } = await listIds('?ids=')
    expect(ids).toEqual([])
  })

  it('refuses more than 50 ids', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `t${i}`).join(',')
    const { status } = await listIds(`?ids=${many}`)
    expect(status).toBe(400)
  })
})

describe('GET /api/tasks/:id/blocking', () => {
  const blocking = async (id: string) => {
    const res = await handleGetBlockingTasks(id, env)
    const body = (await res.json()) as { data: { id: string }[] }
    return body.data.map((r) => r.id).sort()
  }

  it('returns the tasks that list the id in blocked_by', async () => {
    expect(await blocking('t_open')).toEqual(['t_open_blocked'])
  })

  it('matches an exact id inside a comma list with spaces', async () => {
    task('t_multi', { blocked_by: 'other_1, t_open ,other_2' })
    expect(await blocking('t_open')).toEqual(['t_multi', 't_open_blocked'])
  })

  it('does not treat the id as a LIKE pattern or a substring', async () => {
    task('tXopen', { blocked_by: 'tXopen_longer' })
    task('t_open_longer')
    task('t_prefixed', { blocked_by: 't_open_longer' })
    // "t_open" must not match "t_open_longer", nor "_" act as a wildcard.
    expect(await blocking('t_open')).toEqual(['t_open_blocked'])
    expect(await blocking('tXopen')).toEqual([])
  })

  it('leaves out soft-deleted tasks and the task itself', async () => {
    task('t_gone', { blocked_by: 't_open', deleted_at: '2026-10-01 00:00:00' })
    task('t_self', { blocked_by: 't_self' })
    expect(await blocking('t_open')).toEqual(['t_open_blocked'])
    expect(await blocking('t_self')).toEqual([])
  })

  it('finds a blocker stored as a JSON array', async () => {
    task('t_json', { blocked_by: '["t_open"]' })
    task('t_json_long', { blocked_by: '["t_open_longer"]' })
    expect(await blocking('t_open')).toEqual(['t_json', 't_open_blocked'])
  })

  it('returns an empty list for a task nothing waits on', async () => {
    expect(await blocking('t_done_old')).toEqual([])
  })
})

describe('GET /api/tasks/:id/blocking is scoped to the viewer', () => {
  it('leaves out a task the viewer cannot see, even when it lists the id', async () => {
    task('t_mine', { assignee: 'casey-eddington', blocked_by: 't_open' })
    task('t_theirs', { assignee: 'nate-mesfin', blocked_by: 't_open' })
    const casey = personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })
    const scoped = { DB: viewerDb(d1Adapter(db) as unknown as D1Database, casey) } as any
    const res = await handleGetBlockingTasks('t_open', scoped)
    const ids = ((await res.json()) as { data: { id: string }[] }).data.map((r) => r.id)
    expect(ids).toContain('t_mine')
    expect(ids).not.toContain('t_theirs')
    // The unscoped handle sees both, so the filter above is the scope's doing.
    const all = ((await (await handleGetBlockingTasks('t_open', env)).json()) as { data: { id: string }[] }).data.map((r) => r.id)
    expect(all).toContain('t_theirs')
  })
})
