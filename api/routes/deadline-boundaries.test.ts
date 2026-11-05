// R10, R11, R12: three reads that computed a status from the wrong field or the
// wrong clock. Each runs the route's own SQL on the real migration chain.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { AuthUser, Env } from '../helpers'
import { handleProjectHealth } from './projects'
import { handleAttentionManuscripts } from './revisions'
import { handleGetActiveSubmissions } from './submissions'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const USER: AuthUser = { email: 'bob@umn.edu', name: 'Bob', slug: 'bob' }

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
})
afterEach(() => { vi.useRealTimers() })

function project(id: string) {
  insertRow(db, 'projects', { id, slug: id, title: id, category: 'MNCCORE', status: 'active' })
}

describe('R10: project health velocity reads completion performance', () => {
  function doneTask(id: string, projectId: string, dueDate: string, completedAt: string) {
    insertRow(db, 'tasks', {
      id, title: id, project_id: projectId, status: 'done', priority: 'medium', assignee: 'bob', completed: 1,
      due_date: dueDate, completed_at: completedAt,
    })
  }
  async function velocity(slug: string) {
    const body = await (await handleProjectHealth(env)).json() as { data: { slug: string; factors: { velocity: number } }[] }
    return body.data.find((p) => p.slug === slug)?.factors.velocity
  }

  it('all on time earns the full 25', async () => {
    project('prompt')
    doneTask('t1', 'prompt', '2026-10-10', '2026-10-09T12:00:00')
    doneTask('t2', 'prompt', '2026-10-10', '2026-10-10T12:00:00')
    expect(await velocity('prompt')).toBe(25)
  })

  it('all late earns 5, not the no-data 15', async () => {
    project('late')
    doneTask('t1', 'late', '2026-10-10', '2026-10-20T12:00:00')
    doneTask('t2', 'late', '2026-10-10', '2026-10-21T12:00:00')
    expect(await velocity('late')).toBe(5)
  })

  it('no dated completions stays the neutral 15', async () => {
    project('none')
    expect(await velocity('none')).toBe(15)
  })
})

describe('R11: a revision is overdue after its due day ends in lab time', () => {
  function revision(id: string, responseDue: string) {
    project('ms')
    insertRow(db, 'manuscript_revisions', { id, project_id: 'ms', round: 1, status: 'in_progress', response_due: responseDue })
  }
  async function overdueIds(atUtc: string) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(atUtc))
    const res = await handleAttentionManuscripts(new URL('https://x/api/manuscripts/attention'), USER, env)
    const body = await res.json() as { data: { revisions_overdue: { id: string }[] } }
    return body.data.revisions_overdue.map((r) => r.id)
  }

  it('is not overdue on the evening before (Nov 4, 8 PM CST = Nov 5 UTC)', async () => {
    revision('due-5th', '2026-11-05')
    expect(await overdueIds('2026-11-05T02:00:00Z')).toEqual([])
  })

  it('is not overdue through the last hour of its own day (Nov 5, 11 PM CST)', async () => {
    revision('due-5th', '2026-11-05')
    expect(await overdueIds('2026-11-06T05:00:00Z')).toEqual([])
  })

  it('is overdue the next morning', async () => {
    revision('due-5th', '2026-11-05')
    expect(await overdueIds('2026-11-06T14:00:00Z')).toEqual(['due-5th'])
  })

  it('reads a stored timestamp by its date', async () => {
    revision('stamped', '2026-11-05T00:00:00Z')
    expect(await overdueIds('2026-11-05T14:00:00Z')).toEqual([])
    expect(await overdueIds('2026-11-06T14:00:00Z')).toEqual(['stamped'])
  })
})

describe('R12: a future deadline does not keep a finished submission active', () => {
  function ev(id: string, projectId: string, type: string, date: string) {
    insertRow(db, 'submission_events', { id, project_id: projectId, event_type: type, event_date: date, journal: 'J' })
  }
  async function active() {
    const body = await (await handleGetActiveSubmissions(env)).json() as { data: { project_id: string; latest_event_type: string; revision_due_date: string | null }[] }
    return Object.fromEntries(body.data.map((r) => [r.project_id, r]))
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T18:00:00Z'))
  })

  it('accepted, with a later revision deadline on file, is not active', async () => {
    project('done')
    ev('a', 'done', 'submitted', '2026-09-01')
    ev('b', 'done', 'revision_due', '2026-11-20')
    ev('c', 'done', 'accepted', '2026-11-05')
    expect(await active()).toEqual({})
  })

  it('rejected and withdrawn end it the same way', async () => {
    project('r'); project('w')
    ev('a', 'r', 'revision_due', '2026-11-20'); ev('b', 'r', 'rejected', '2026-11-02')
    ev('c', 'w', 'revision_due', '2026-11-20'); ev('d', 'w', 'withdrawn', '2026-11-02')
    expect(await active()).toEqual({})
  })

  it('under review with a deadline stays active: status from the lifecycle, deadline alongside', async () => {
    project('open')
    ev('a', 'open', 'submitted', '2026-09-01')
    ev('b', 'open', 'reviews_received', '2026-10-15')
    ev('c', 'open', 'revision_due', '2026-11-20')
    expect((await active()).open).toMatchObject({ latest_event_type: 'reviews_received', revision_due_date: '2026-11-20' })
  })

  it('a new cycle after a rejection is active again', async () => {
    project('again')
    ev('a', 'again', 'rejected', '2026-08-01')
    ev('b', 'again', 'submitted', '2026-10-01')
    expect((await active()).again).toMatchObject({ latest_event_type: 'submitted' })
  })

  it('a project with only a deadline on file still shows, as it did', async () => {
    project('only')
    ev('a', 'only', 'revision_due', '2026-11-20')
    expect((await active()).only).toMatchObject({ latest_event_type: 'revision_due', revision_due_date: '2026-11-20' })
  })
})
