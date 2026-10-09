// #8842 R6 — PB-private task rows on the meeting and calendar routes.
//
// Before the fix (Hub 16e72a50): GET /api/meetings/:id returned a task under
// a 'Peripheral Brain' project in action_items to any authed caller, and
// GET /api/calendar/events returned every open dated task, PB or not, plus
// soft-deleted ones.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts),
// so the SQL filter runs against the real tables. The first cut built nine
// tables by hand (its activity_entries lacked v100 parent_id and every NOT
// NULL). The legacy states it needs -- a task whose project_id is a SLUG and
// one whose ref names no project -- are representable on the real schema
// (tasks.project_id carries no FK), so they are seeded there. The chain's own
// seed rows are filtered out by title, never counted.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { ctToday } from '../lib/ct-date'
import { handleGetMeeting, handleMeetingPrep, handleGenerateAgenda } from './meetings'
import { handleCalendarEvents } from './calendar'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const TODAY = ctToday()
let db: InstanceType<typeof Database>
let env: any
let memberEnv: any

const OURS = new Set([
  'PB PRIVATE', 'PB PRIVATE BY SLUG', 'TEAM TASK', 'NO PROJECT', 'UNKNOWN PROJECT REF', 'DELETED TASK',
  'PREV PB PRIVATE', 'PREV TEAM TASK',
])

function task(id: string, title: string, projectId: string | null, extra: Record<string, unknown> = {}) {
  insertRow(db, 'tasks', {
    id, title, project_id: projectId, meeting_id: 'mtg_now', status: 'todo', priority: 'high', assignee: 'nick-ingraham',
    completed: 0, due_date: TODAY, deleted_at: null, created_at: '2026-09-01 00:00:00', ...extra,
  })
}

beforeEach(() => {
  db = prodSchemaDb()
  insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-private', title: 'Private', category: 'Peripheral Brain', status: 'active' })
  insertRow(db, 'projects', { id: 'proj_team', slug: 'team-proj', title: 'Team', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'meetings', { id: 'mtg_prev', date: '2026-09-01', title: 'Prev', type: 'lab' })
  insertRow(db, 'meetings', { id: 'mtg_now', date: TODAY, title: 'Now', type: 'lab' })
  task('t_pb', 'PB PRIVATE', 'proj_pb')
  task('t_pb_slug', 'PB PRIVATE BY SLUG', 'pb-private')
  task('t_team', 'TEAM TASK', 'proj_team')
  task('t_none', 'NO PROJECT', null)
  task('t_orphan', 'UNKNOWN PROJECT REF', 'proj_gone')
  task('t_deleted', 'DELETED TASK', 'proj_team', { deleted_at: '2026-09-02 00:00:00', status: 'deleted' })
  // Carried-forward items for the agenda route come from the PREVIOUS meeting.
  task('t_prev_pb', 'PREV PB PRIVATE', 'proj_pb', { meeting_id: 'mtg_prev', due_date: null })
  task('t_prev_team', 'PREV TEAM TASK', 'proj_team', { meeting_id: 'mtg_prev', due_date: null })
  env = { DB: d1Adapter(db) }
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  for (const p of ['proj_team', 'proj_pb']) {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, 'casey-eddington', 'test')").run(p)
  }
  db.prepare(`UPDATE tasks SET watchers = '["casey-eddington"]' WHERE id = 't_none'`).run()
  db.prepare(`UPDATE meetings SET attendees = '["casey-eddington"]' WHERE id IN ('mtg_now', 'mtg_prev')`).run()
  memberEnv = { DB: viewerDb(env.DB, personViewer({ slug: 'casey-eddington', email: 'eddin022@umn.edu', pi: false })) }
})

const titles = (rows: Array<{ title?: string }>) => rows.map((r) => r.title).filter((t) => OURS.has(t as string)).sort()

// #145 Lane B: the PB rule for task rows lives in the viewer-bound handle
// (api/lib/table-scope.ts), not in the handler, so every non-PI case reads
// through a member's handle, as the request middleware gives it. Casey is on
// BOTH projects (an accidental add to the PB one) and watches the
// project-less task; the PB rows must still not reach her.
describe('the task rule, through a member handle', () => {
  it('hides PB-project tasks (by PK or slug) and unknown refs; keeps team and the watched project-less task', async () => {
    const { results } = await memberEnv.DB.prepare(
      `SELECT t.title FROM tasks t WHERE t.meeting_id = 'mtg_now' AND t.deleted_at IS NULL`,
    ).all()
    expect(titles(results as Array<{ title: string }>)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })
})

describe('GET /api/meetings/:id — action_items', () => {
  it('non-PI caller does not see PB-private action items', async () => {
    const body = await (await handleGetMeeting('mtg_now', memberEnv, false)).json() as any
    expect(titles(body.data.action_items)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees every live action item', async () => {
    const body = await (await handleGetMeeting('mtg_now', env, true)).json() as any
    expect(titles(body.data.action_items)).toEqual(
      ['NO PROJECT', 'PB PRIVATE', 'PB PRIVATE BY SLUG', 'TEAM TASK', 'UNKNOWN PROJECT REF'],
    )
  })
})

describe('GET /api/calendar/events — task deadlines', () => {
  const url = () => new URL(`https://x/api/calendar/events?start=${TODAY}&end=${TODAY}`)
  const taskTitles = (body: any) => titles(body.data.filter((e: any) => e.type === 'task'))

  it('non-PI caller does not see PB-private tasks or deleted tasks', async () => {
    const body = await (await handleCalendarEvents(url(), memberEnv, 'nick-ingraham', false)).json() as any
    expect(taskTitles(body)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees PB tasks, still not deleted ones', async () => {
    const body = await (await handleCalendarEvents(url(), env, 'nick-ingraham', true)).json() as any
    expect(taskTitles(body)).toContain('PB PRIVATE')
    expect(taskTitles(body)).not.toContain('DELETED TASK')
  })

  // 2026-10-08 (Nick: "the lab calendar and Today page show tasks not assigned
  // to the user"): task deadlines are the viewer's own. Every fixture task is
  // nick-ingraham's, so another viewer, PI flag or not, gets no task rows,
  // while the meeting on the same day still comes back (lab-wide).
  it('another member sees none of the PI tasks but still sees the meeting', async () => {
    for (const pi of [false, true]) {
      const body = await (await handleCalendarEvents(url(), env, 'casey-eddington', pi)).json() as any
      expect(taskTitles(body)).toEqual([])
      expect(body.data.some((e: any) => e.type === 'meeting')).toBe(true)
    }
  })

  it('a caller with no team identity gets no task rows', async () => {
    const body = await (await handleCalendarEvents(url(), env, 'anonymous', true)).json() as any
    expect(taskTitles(body)).toEqual([])
  })
})

describe('meeting prep + generated agenda use the same rule', () => {
  it('prep: previous action items, upcoming and overdue lists hide PB tasks for non-PI', async () => {
    const body = await (await handleMeetingPrep('mtg_now', memberEnv, true, false)).json() as any
    const all = JSON.stringify(body.data)
    expect(all).not.toContain('PB PRIVATE')
    expect(all).not.toContain('UNKNOWN PROJECT REF')
    expect(titles(body.data.upcomingDeadlines)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('prep: PI sees them', async () => {
    const body = await (await handleMeetingPrep('mtg_now', env, true, true)).json() as any
    expect(JSON.stringify(body.data)).toContain('PB PRIVATE')
  })

  it('generate-agenda: carried-forward and urgent items hide PB tasks for non-PI', async () => {
    const body = await (await handleGenerateAgenda('mtg_now', memberEnv, true, false)).json() as any
    const all = JSON.stringify(body)
    expect(all).toContain('PREV TEAM TASK')
    expect(all).not.toContain('PB PRIVATE')
  })

  it('generate-agenda: PI sees them', async () => {
    const body = await (await handleGenerateAgenda('mtg_now', env, true, true)).json() as any
    expect(JSON.stringify(body)).toContain('PREV PB PRIVATE')
  })
})
