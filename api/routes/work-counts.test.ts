// work-counts.test.ts -- a count of open work counts open work (2026-11-05 live
// walk). The trajectory page read "427 overdue, 78% of open" and "548 open" for a
// person with 8 overdue and 45 open everywhere else: its metrics query never
// checked deleted_at, and 500 of the 548 rows were soft-deleted. Approvals and
// questions are not work either (lib/taskStats.ts isWorkTask on the client).
// Real queries on the migration-chain database.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import type { Viewer } from '../lib/viewer-db'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { ctToday } from '../lib/ct-date'
import { handleOverdueCount } from './tasks'
import { handleTrajectory } from './trajectory'
import { handleMeetingPrep } from './meetings'
import { handleInsightsDashboard } from './insights'

const ME = 'casey-eddington'
const LONG_AGO = '2020-01-01'

let db: InstanceType<typeof Database>
let env: Env

function task(id: string, over: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', {
    id, title: id, kind: 'task', status: 'todo', priority: 'medium', assignee: ME, source: 'manual',
    project_id: null, completed: 0, completed_at: null, deleted_at: null, due_date: LONG_AGO, ...over,
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  task('live-overdue')
  task('live-later', { due_date: '2999-01-01' })
  task('due-today', { due_date: ctToday() })
  task('live-done', { completed: 1, status: 'done', completed_at: '2026-01-02 00:00:00', created_at: '2026-01-01 00:00:00' })
  task('deleted-overdue', { deleted_at: '2026-01-01 00:00:00' })
  task('deleted-done', { completed: 1, status: 'done', completed_at: '2026-01-02 00:00:00', deleted_at: '2026-01-03 00:00:00' })
  task('question-overdue', { kind: 'question' })
  task('approval-pending', { source: 'meeting_approval', approval_status: 'pending' })
  task('approval-accepted', { source: 'meeting_approval', approval_status: 'accepted' })
})

describe('trajectory task metrics', () => {
  const metrics = async () => {
    const res = await handleTrajectory(ME, env, { kind: 'service' } as unknown as Viewer, true)
    return ((await res.json()) as { data: { taskMetrics: Record<string, number> } }).data.taskMetrics
  }

  it('counts live work only: no soft-deleted row, no question, no approval', async () => {
    const m = await metrics()
    expect(m.total).toBe(4) // live-overdue, live-later, due-today, live-done
    expect(m.completed).toBe(1)
    expect(m.overdue).toBe(1)
  })

  it('reads the project lists through live tasks only', async () => {
    insertRow(db, 'projects', { id: 'proj_ghost', slug: 'ghost', title: 'Ghost', category: 'MNCCORE', status: 'active' })
    task('ghost-task', { project_id: 'proj_ghost', deleted_at: '2026-01-01 00:00:00' })
    const res = await handleTrajectory(ME, env, { kind: 'service' } as unknown as Viewer, true)
    const d = ((await res.json()) as { data: { projects: unknown[]; projectStages: unknown[] } }).data
    expect(d.projects).toEqual([])
    expect(d.projectStages).toEqual([])
  })
})

describe('the sidebar badge', () => {
  it('leaves an approval out of unseen and overdue, because the New and Overdue lists do', async () => {
    const res = await handleOverdueCount(new URL(`https://x/api/tasks/overdue-count?assignee=${ME}`), env)
    const { data } = (await res.json()) as { data: { count: number; unseen: number } }
    expect(data.count).toBe(1)
    expect(data.unseen).toBe(3) // live-overdue, live-later, due-today
  })
})

describe('meeting prep overdue', () => {
  it('leaves an approval out', async () => {
    insertRow(db, 'meetings', { id: 'mtg-1', date: ctToday(), title: 'Sync' })
    const res = await handleMeetingPrep('mtg-1', env, true)
    const { data } = (await res.json()) as { data: { overdueTasks: { id: string }[] } }
    expect(data.overdueTasks.map((t) => t.id)).toEqual(['live-overdue'])
  })
})

describe('the insights open-task distribution', () => {
  it('leaves an approval out', async () => {
    const res = await handleInsightsDashboard(env)
    const { data } = (await res.json()) as { data: { metrics: { tasksPerPerson: { total: number } } } }
    expect(data.metrics.tasksPerPerson.total).toBe(3)
  })
})
