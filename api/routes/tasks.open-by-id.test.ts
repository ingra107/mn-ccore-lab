// The by-id read My Tasks falls back on when ?open= names a task off the viewer's
// list. Through the REAL worker, so env.DB is the member's viewer-bound handle:
// she gets what taskRule lets her read, and nothing of the rest.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

async function byId(id: string) {
  const res = await worker.fetch(new Request(`https://hub.test/api/tasks?ids=${id}&include_questions=1`, {
    headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY },
  }), env, CTX)
  const body = await res.json() as { data: { id: string; assignee: string }[] }
  return { status: res.status, rows: body.data }
}

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify(['ingra107@umn.edu']))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', member_type: 'director', email: 'mesfin@umn.edu' })
  insertRow(db, 'projects', { id: 'proj_shared', slug: 'shared', title: 'Shared', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'projects', { id: 'proj_hidden', slug: 'hidden', title: 'Hidden', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: 'proj_shared', member_slug: 'casey-eddington', added_by: 'test' })
  insertRow(db, 'project_members', { project_id: 'proj_hidden', member_slug: 'nate-mesfin', added_by: 'test' })
  const task = (id: string, extra: Record<string, unknown>) => insertRow(db, 'tasks', {
    id, title: id, assignee: 'nate-mesfin', status: 'todo', priority: 'medium', completed: 0, ...extra,
  })
  task('task_shared', { project_id: 'proj_shared' })
  task('task_hidden', { project_id: 'proj_hidden' })
  task('task_gone', { project_id: 'proj_shared', deleted_at: '2026-11-01 00:00:00' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: 'k', REQUIRE_AUTH: '1' } as unknown as Env
})

describe('GET /api/tasks?ids= from the seat of a member, on the task of another person', () => {
  it('a task on a project she is on comes back', async () => {
    const { status, rows } = await byId('task_shared')
    expect(status).toBe(200)
    expect(rows.map((r) => [r.id, r.assignee])).toEqual([['task_shared', 'nate-mesfin']])
  })

  it('a task on a project she is not on comes back empty, not an error', async () => {
    expect(await byId('task_hidden')).toEqual({ status: 200, rows: [] })
  })

  it('a deleted task comes back empty', async () => {
    expect(await byId('task_gone')).toEqual({ status: 200, rows: [] })
  })
})
