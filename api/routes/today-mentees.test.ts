// GET /api/today/mentees (2026-10-08). The Today MENTEES row showed "—" for
// every mentee since it was built: the client filtered the viewer's own task
// list by each mentee's slug. This route returns the viewer's mentees (a
// director's research team) with each one's soonest open due date, and [] for
// anyone else. Runs on the migration-chain database so the SQL runs against
// the real tables; the chain's own seed rows are filtered out by slug.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { handleTodayMentees } from './today-mentees'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'

let db: InstanceType<typeof Database>
let env: any
let directorEnv: any

const OURS = new Set(['zz-mentee-a', 'zz-mentee-b', 'zz-mentee-c'])

function member(slug: string, member_type: string) {
  insertRow(db, 'team_members', { id: `tm_${slug}`, slug, name: slug.toUpperCase(), member_type })
}
let n = 0
function task(assignee: string, due_date: string | null, extra: Record<string, unknown> = {}) {
  n += 1
  insertRow(db, 'tasks', {
    id: `t_zz_${n}`, title: `ZZ TASK ${n}`, project_id: 'proj_team', status: 'todo', priority: 'high', assignee,
    completed: 0, due_date, deleted_at: null, created_at: '2026-09-01 00:00:00', ...extra,
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-private', title: 'Private', category: 'Peripheral Brain', status: 'active' })
  insertRow(db, 'projects', { id: 'proj_team', slug: 'team-proj', title: 'Team', category: 'MNCCORE', status: 'active' })
  member('zz-director', 'director')
  member('zz-faculty', 'faculty')
  member('zz-mentee-a', 'research_team')
  member('zz-mentee-b', 'research_team')
  member('zz-mentee-c', 'research_team')
  // mentee-a: soonest open task is 2026-10-12; the earlier ones are done,
  // deleted, on a project the director is not on, or a QA fixture.
  task('zz-mentee-a', '2026-10-20')
  task('zz-mentee-a', '2026-10-12')
  task('zz-mentee-a', '2026-10-01', { completed: 1, status: 'done', completed_at: '2026-10-02 00:00:00' })
  task('zz-mentee-a', '2026-10-02', { deleted_at: '2026-10-03 00:00:00', status: 'deleted' })
  task('zz-mentee-a', '2026-10-03', { project_id: 'proj_pb' })
  task('zz-mentee-a', '2026-10-04', { title: 'test_delete_probe' })
  // mentee-b: overdue. mentee-c: an undated task only. The director's own
  // dated task must never surface as a mentee date.
  task('zz-mentee-b', '2026-09-21')
  task('zz-mentee-c', null)
  task('zz-director', '2026-09-01')
  env = { DB: d1Adapter(db) }
  // #145 Lane B: a non-PI director reads through their own handle. They are on
  // the team project and not on the Peripheral Brain one, so its task is
  // hidden: a non-member cannot see it (membership is the only rule since
  // 2026-10-09; the category no longer hides anything by itself).
  db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES ('proj_team', 'zz-director', 'test')").run()
  directorEnv = { DB: viewerDb(env.DB, personViewer({ slug: 'zz-director', email: null, pi: false })) }
})

const ours = (body: any) => (body.data as Array<{ slug: string }>).filter((m) => OURS.has(m.slug))

describe('GET /api/today/mentees', () => {
  it("a director gets each research-team member's soonest open due date, soonest first", async () => {
    const body = await (await handleTodayMentees(directorEnv, 'zz-director')).json() as any
    expect(ours(body)).toEqual([
      { slug: 'zz-mentee-b', name: 'ZZ-MENTEE-B', next_due: '2026-09-21' },
      { slug: 'zz-mentee-a', name: 'ZZ-MENTEE-A', next_due: '2026-10-12' },
      { slug: 'zz-mentee-c', name: 'ZZ-MENTEE-C', next_due: null },
    ])
  })

  it("a director who is a member of the Peripheral Brain project sees its task's date (category is a label)", async () => {
    db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_pb', 'zz-director', 'test')").run()
    const body = await (await handleTodayMentees(directorEnv, 'zz-director')).json() as any
    expect(ours(body).find((m: any) => m.slug === 'zz-mentee-a')).toMatchObject({ next_due: '2026-10-03' })
  })

  it("the PB key's unscoped handle sees every task's date", async () => {
    const body = await (await handleTodayMentees(env, 'zz-director')).json() as any
    expect(ours(body).find((m: any) => m.slug === 'zz-mentee-a')).toMatchObject({ next_due: '2026-10-03' })
  })

  it('a non-director member, a mentee, and a caller with no team row get nothing', async () => {
    for (const viewer of ['zz-faculty', 'zz-mentee-a', 'anonymous']) {
      const body = await (await handleTodayMentees(env, viewer)).json() as any
      expect(body.data, viewer).toEqual([])
    }
  })

  it('never returns a task title, only dates', async () => {
    const text = await (await handleTodayMentees(env, 'zz-director')).text()
    expect(text).not.toContain('ZZ TASK')
    expect(text).not.toContain('test_delete_probe')
  })
})
