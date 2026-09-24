// #8842 R6 — PB-private task rows on the meeting and calendar routes.
//
// Real SQLite (better-sqlite3), so the SQL filter itself is exercised; the
// Pattern B cases in pb-visibility-contract.test.ts use a stub that returns
// rows verbatim and cannot see a WHERE clause.
//
// Before the fix (Hub 16e72a50): GET /api/meetings/:id returned a task under
// a 'Peripheral Brain' project in action_items to any authed caller, and
// GET /api/calendar/events returned every open dated task, PB or not, plus
// soft-deleted ones.

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { TASK_PLAIN_COLS } from '../lib/task-cols'
import { ctToday } from '../lib/ct-date'
import { handleGetMeeting, handleMeetingPrep, handleGenerateAgenda } from './meetings'
import { handleCalendarEvents } from './calendar'
import { pbTaskVisibilitySql } from '../helpers'

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
CREATE TABLE projects (id TEXT PRIMARY KEY, slug TEXT, title TEXT, category TEXT, status TEXT, stage TEXT, updated_at TEXT);
CREATE TABLE tasks (${[...TASK_COLS].map((c) => `${c} ${c === 'completed' ? 'INTEGER DEFAULT 0' : 'TEXT'}`).join(', ')});
CREATE TABLE meetings (id TEXT PRIMARY KEY, date TEXT, title TEXT, type TEXT, status TEXT, facilitator TEXT,
  created_at TEXT, updated_at TEXT, source_id TEXT, notes TEXT);
CREATE TABLE agenda_items (id TEXT, meeting_id TEXT, sort_order INTEGER, created_at TEXT);
CREATE TABLE activity_log (id TEXT, type TEXT, description TEXT, actor TEXT, related_id TEXT, related_type TEXT, timestamp TEXT);
CREATE TABLE regulatory_items (id TEXT, title TEXT, item_type TEXT, expiration_date TEXT, status TEXT, project_id TEXT);
CREATE TABLE activity_entries (id TEXT, body TEXT, update_type TEXT, actor_slug TEXT, created_at TEXT, project_id TEXT,
  entity_type TEXT, kind TEXT, hidden_at TEXT);
CREATE TABLE milestones (id TEXT, title TEXT, target_date TEXT, status TEXT, grant_id TEXT);
CREATE TABLE grants (id TEXT, mechanism TEXT, title TEXT);
`

const TODAY = ctToday()
let db: InstanceType<typeof Database>
let env: any

function task(id: string, title: string, projectId: string | null, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id, title, project_id: projectId, meeting_id: 'mtg_now', status: 'todo', priority: 'high',
    completed: 0, due_date: TODAY, deleted_at: null, created_at: '2026-09-01 00:00:00', ...extra,
  }
  const cols = Object.keys(row)
  db.prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]))
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(DDL)
  db.prepare("INSERT INTO projects VALUES ('proj_pb', 'pb-private', 'Private', 'Peripheral Brain', 'active', 'x', '2026-01-01')").run()
  db.prepare("INSERT INTO projects VALUES ('proj_team', 'team-proj', 'Team', 'MNCCORE', 'active', 'x', '2026-01-01')").run()
  db.prepare("INSERT INTO meetings (id, date, title, type) VALUES ('mtg_prev', '2026-09-01', 'Prev', 'lab')").run()
  db.prepare(`INSERT INTO meetings (id, date, title, type) VALUES ('mtg_now', '${TODAY}', 'Now', 'lab')`).run()
  task('t_pb', 'PB PRIVATE', 'proj_pb')
  task('t_pb_slug', 'PB PRIVATE BY SLUG', 'pb-private')
  task('t_team', 'TEAM TASK', 'proj_team')
  task('t_none', 'NO PROJECT', null)
  task('t_orphan', 'UNKNOWN PROJECT REF', 'proj_gone')
  task('t_deleted', 'DELETED TASK', 'proj_team', { deleted_at: '2026-09-02 00:00:00', status: 'deleted' })
  // Carried-forward items for the agenda route come from the PREVIOUS meeting.
  task('t_prev_pb', 'PREV PB PRIVATE', 'proj_pb', { meeting_id: 'mtg_prev', due_date: null })
  task('t_prev_team', 'PREV TEAM TASK', 'proj_team', { meeting_id: 'mtg_prev', due_date: null })
  env = { DB: makeD1(db) }
})

const titles = (rows: Array<{ title?: string }>) => rows.map((r) => r.title).sort()

describe('pbTaskVisibilitySql — the one rule', () => {
  it('is empty for a PI / API-key caller', () => {
    expect(pbTaskVisibilitySql('t', true)).toBe('')
  })

  it('hides PB-project tasks (by PK or slug) and unknown refs; keeps team and project-less tasks', () => {
    const rows = db.prepare(
      `SELECT t.title FROM tasks t WHERE t.meeting_id = 'mtg_now' AND t.deleted_at IS NULL${pbTaskVisibilitySql('t', false)}`,
    ).all() as Array<{ title: string }>
    expect(titles(rows)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })
})

describe('GET /api/meetings/:id — action_items', () => {
  it('non-PI caller does not see PB-private action items', async () => {
    const body = await (await handleGetMeeting('mtg_now', env, true, false)).json() as any
    expect(titles(body.data.action_items)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees every live action item', async () => {
    const body = await (await handleGetMeeting('mtg_now', env, true, true)).json() as any
    expect(titles(body.data.action_items)).toEqual(
      ['NO PROJECT', 'PB PRIVATE', 'PB PRIVATE BY SLUG', 'TEAM TASK', 'UNKNOWN PROJECT REF'],
    )
  })
})

describe('GET /api/calendar/events — task deadlines', () => {
  const url = () => new URL(`https://x/api/calendar/events?start=${TODAY}&end=${TODAY}`)
  const taskTitles = (body: any) => titles(body.data.filter((e: any) => e.type === 'task'))

  it('non-PI caller does not see PB-private tasks or deleted tasks', async () => {
    const body = await (await handleCalendarEvents(url(), env, false)).json() as any
    expect(taskTitles(body)).toEqual(['NO PROJECT', 'TEAM TASK'])
  })

  it('PI caller sees PB tasks, still not deleted ones', async () => {
    const body = await (await handleCalendarEvents(url(), env, true)).json() as any
    expect(taskTitles(body)).toContain('PB PRIVATE')
    expect(taskTitles(body)).not.toContain('DELETED TASK')
  })
})

describe('meeting prep + generated agenda use the same rule', () => {
  it('prep: previous action items, upcoming and overdue lists hide PB tasks for non-PI', async () => {
    const body = await (await handleMeetingPrep('mtg_now', env, true, false)).json() as any
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
    const body = await (await handleGenerateAgenda('mtg_now', env, true, false)).json() as any
    const all = JSON.stringify(body)
    expect(all).toContain('PREV TEAM TASK')
    expect(all).not.toContain('PB PRIVATE')
  })

  it('generate-agenda: PI sees them', async () => {
    const body = await (await handleGenerateAgenda('mtg_now', env, true, true)).json() as any
    expect(JSON.stringify(body)).toContain('PREV PB PRIVATE')
  })
})
