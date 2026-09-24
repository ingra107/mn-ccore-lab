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
// Real SQLite (better-sqlite3), so the WHERE clause itself runs; the Pattern B
// cases in pb-visibility-contract.test.ts use a stub that returns rows verbatim
// and cannot see it.

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { TASK_PLAIN_COLS } from '../lib/task-cols'
import { handleGetTasks, handleGetRecentTaskUpdates } from './tasks'

function makeD1(db: InstanceType<typeof Database>) {
  function makeStmt(sql: string, vals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...vals, ...more]),
      first: async () => db.prepare(sql).get(...vals) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...vals), success: true, meta: {} }),
      run: async () => ({ success: true, meta: { changes: db.prepare(sql).run(...vals).changes } }),
    }
  }
  return { prepare: (sql: string) => makeStmt(sql, []) }
}

const TASK_COLS = new Set<string>([...TASK_PLAIN_COLS, 'project_id', 'notes'])
const DDL = `
CREATE TABLE projects (id TEXT PRIMARY KEY, slug TEXT, title TEXT, category TEXT);
CREATE TABLE tasks (${[...TASK_COLS].map((c) => `${c} ${c === 'completed' ? 'INTEGER DEFAULT 0' : 'TEXT'}`).join(', ')});
CREATE TABLE meetings (id TEXT PRIMARY KEY, date TEXT, title TEXT);
CREATE TABLE activity_entries (id TEXT, entity_id TEXT, entity_type TEXT, kind TEXT, actor_slug TEXT, body TEXT,
  update_type TEXT, created_at TEXT, hidden_at TEXT, visibility TEXT);
`

let db: InstanceType<typeof Database>
let env: any

function task(id: string, title: string, projectId: string | null) {
  db.prepare('INSERT INTO tasks (id, title, project_id, completed, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(id, title, projectId, '2026-09-01 00:00:00')
}
function update(id: string, taskId: string, body: string, visibility = 'team') {
  db.prepare(`INSERT INTO activity_entries VALUES (?, ?, 'task', 'update', 'nick', ?, 'note', '2026-09-02 00:00:00', NULL, ?)`)
    .run(id, taskId, body, visibility)
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(DDL)
  db.prepare("INSERT INTO projects VALUES ('proj_pb', 'pb-private', 'Private', 'Peripheral Brain')").run()
  db.prepare("INSERT INTO projects VALUES ('proj_team', 'team-proj', 'Team', 'MNCCORE')").run()
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
  env = { DB: makeD1(db) }
})

const sorted = (xs: unknown[]) => (xs as string[]).slice().sort()

describe('GET /api/tasks — handleGetTasks', () => {
  const url = new URL('https://x/api/tasks')

  it('non-PI caller sees team and project-less tasks only (unknown ref fails closed)', async () => {
    const body = await (await handleGetTasks(url, env, false)).json() as any
    expect(sorted(body.data.map((r: any) => r.title))).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees every task', async () => {
    const body = await (await handleGetTasks(url, env, true)).json() as any
    expect(body.data).toHaveLength(5)
  })
})

describe('GET /api/task-updates/recent — handleGetRecentTaskUpdates', () => {
  const url = new URL('https://x/api/task-updates/recent')

  it('non-PI caller sees team updates on visible, existing tasks only', async () => {
    const body = await (await handleGetRecentTaskUpdates(url, env, false)).json() as any
    expect(sorted(body.data.map((r: any) => r.content))).toEqual(['NO PROJECT UPDATE', 'TEAM UPDATE'])
  })

  it('the since= branch applies the same rule', async () => {
    const u = new URL('https://x/api/task-updates/recent?since=2026-01-01')
    const body = await (await handleGetRecentTaskUpdates(u, env, false)).json() as any
    expect(sorted(body.data.map((r: any) => r.content))).toEqual(['NO PROJECT UPDATE', 'TEAM UPDATE'])
  })

  it('PI caller sees every update, author-only included', async () => {
    const body = await (await handleGetRecentTaskUpdates(url, env, true)).json() as any
    expect(body.data).toHaveLength(7)
  })
})
