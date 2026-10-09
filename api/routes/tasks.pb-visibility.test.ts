// GET /api/tasks and GET /api/task-updates/recent use pbTaskVisibilitySql, the
// one PB-visibility rule for task rows (helpers.ts).
//
// Both routes used to carry their own `project_id NOT IN (PB ids UNION PB
// slugs)` fragment. That form failed OPEN on a task whose project_id matched
// no project row, disagreeing with canSeePbProject (fails closed) and with
// pbTaskVisibilitySql. The recent-updates form also let through an update
// whose task row did not exist. Prod on 2026-09-24 had 6 deleted tasks with an
// unknown project ref (0 live) and 0 orphan team updates, so the stricter rule
// hides nothing a team member reads today.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut built its own tasks/activity_entries tables, whose
// activity_entries lacked v100 parent_id and every NOT NULL. The legacy states
// this file needs (a task whose project_id is a SLUG, one whose ref names no
// project, an update whose task row is gone) are all representable on the real
// schema -- tasks.project_id carries no FK and activity_entries.entity_id is a
// free reference -- so they are seeded there.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleGetTasks, handleGetRecentTaskUpdates } from './tasks'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'

let db: InstanceType<typeof Database>
let env: any
let memberEnv: any

const OUR_TASKS = ['t_pb', 't_pb_slug', 't_team', 't_none', 't_orphan']

function task(id: string, title: string, projectId: string | null) {
  insertRow(db, 'tasks', {
    id, title, project_id: projectId, status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
    completed: 0, created_at: '2026-09-01 00:00:00',
  })
}
function update(id: string, taskId: string, body: string, visibility = 'team') {
  insertRow(db, 'activity_entries', {
    id, entity_type: 'task', entity_id: taskId, kind: 'update', actor_slug: 'nick', body,
    update_type: 'note', created_at: '2026-09-02 00:00:00', visibility,
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-private', title: 'Private', category: 'Peripheral Brain' })
  insertRow(db, 'projects', { id: 'proj_team', slug: 'team-proj', title: 'Team', category: 'MNCCORE' })
  task('t_pb', 'PB PRIVATE', 'proj_pb')
  task('t_pb_slug', 'PB PRIVATE BY SLUG', 'pb-private')
  task('t_team', 'TEAM TASK', 'proj_team')
  task('t_none', 'NO PROJECT', null)
  task('t_orphan', 'UNKNOWN PROJECT REF', 'proj_gone')
  update('u_pb', 't_pb', 'PB UPDATE')
  update('u_pb_slug', 't_pb_slug', 'PB SLUG UPDATE')
  update('u_team', 't_team', 'TEAM UPDATE')
  update('u_none', 't_none', 'NO PROJECT UPDATE')
  update('u_orphan', 't_orphan', 'UNKNOWN REF UPDATE')
  update('u_no_task', 't_vanished', 'NO TASK ROW UPDATE')
  update('u_private', 't_team', 'AUTHOR-ONLY UPDATE', 'author')
  env = { DB: d1Adapter(db) }
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  for (const p of ['proj_team', 'proj_pb']) {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, 'casey-eddington', 'test')").run(p)
  }
  db.prepare(`UPDATE tasks SET watchers = '["casey-eddington"]' WHERE id = 't_none'`).run()
  memberEnv = { DB: viewerDb(env.DB, personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })) }
})

// #145 Lane B: the PB rule for task rows lives in the viewer-bound handle
// (api/lib/table-scope.ts), not in the handler, so every non-PI case reads
// through a member's handle, as the request middleware gives it. Casey is on
// BOTH projects (an accidental add to the PB one) and watches the
// project-less task; the PB rows must still not reach her.


const sorted = (xs: unknown[]) => (xs as string[]).slice().sort()
const ourTasks = (rows: any[]) => rows.filter((r) => OUR_TASKS.includes(r.id))
const OUR_BODIES = new Set([
  'PB UPDATE', 'PB SLUG UPDATE', 'TEAM UPDATE', 'NO PROJECT UPDATE', 'UNKNOWN REF UPDATE', 'NO TASK ROW UPDATE', 'AUTHOR-ONLY UPDATE',
])
const ourUpdates = (rows: any[]) => rows.filter((r) => OUR_BODIES.has(r.content))

describe('GET /api/tasks — handleGetTasks', () => {
  const url = new URL('https://x/api/tasks')

  it('non-PI caller sees team and project-less tasks only (unknown ref fails closed)', async () => {
    const body = await (await handleGetTasks(url, memberEnv, false)).json() as any
    expect(sorted(ourTasks(body.data).map((r: any) => r.title))).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees every task', async () => {
    const body = await (await handleGetTasks(url, env, true)).json() as any
    expect(ourTasks(body.data)).toHaveLength(5)
  })
})

describe('GET /api/task-updates/recent — handleGetRecentTaskUpdates', () => {
  const url = new URL('https://x/api/task-updates/recent')

  it('non-PI caller sees team updates on visible, existing tasks only', async () => {
    const body = await (await handleGetRecentTaskUpdates(url, memberEnv, false)).json() as any
    expect(sorted(ourUpdates(body.data).map((r: any) => r.content))).toEqual(['NO PROJECT UPDATE', 'TEAM UPDATE'])
  })

  it('the since= branch applies the same rule', async () => {
    const u = new URL('https://x/api/task-updates/recent?since=2026-01-01')
    const body = await (await handleGetRecentTaskUpdates(u, memberEnv, false)).json() as any
    expect(sorted(ourUpdates(body.data).map((r: any) => r.content))).toEqual(['NO PROJECT UPDATE', 'TEAM UPDATE'])
  })

  it('PI caller sees every update, author-only included', async () => {
    const body = await (await handleGetRecentTaskUpdates(url, env, true)).json() as any
    expect(ourUpdates(body.data)).toHaveLength(7)
  })
})
