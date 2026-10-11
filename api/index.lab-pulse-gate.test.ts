/**
 * api/index.lab-pulse-gate.test.ts — the Lab pulse routes answer only the PI.
 *
 * mentee-velocity, response-time and team-engagement read lab-wide numbers and,
 * for team-engagement, one row of activity per person. Nick's ruling
 * (2026-10-11): the per-person numbers and the score are his alone. Drives the
 * REAL worker (full middleware stack, migrated schema): a member gets 403 and
 * no names, no counts; the PI and the PB key get the numbers. pi-dashboard,
 * which a member can still call, hands a member an empty engagement list.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'lab-pulse-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'eddin022@umn.edu'
const ROUTES = ['mentee-velocity', 'response-time', 'team-engagement'] as const

let db: InstanceType<typeof Database>
let env: Env

// SQLite's own clock, in the format the tables store (datetime('now')).
const at = (days: number) => (db.prepare("SELECT datetime('now', ?) AS t").get(`${days} days`) as { t: string }).t
const daysAgo = (n: number) => at(-n)

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: MEMBER_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', role: 'Fellow', member_type: 'research_team', email: 'nate@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-hermes', name: 'Hermes', slug: 'claude-ai', role: 'ai', member_type: 'ai', email: 'claude-ai@umn.edu' })
  // Nate acted this month and last; Casey only last month; the AI and a PB
  // session row must not count.
  insertRow(db, 'activity_log', { id: 'al-1', type: 'comment', description: 'c', actor: 'nate-mesfin', timestamp: daysAgo(3) })
  insertRow(db, 'activity_log', { id: 'al-2', type: 'comment', description: 'c', actor: 'nate-mesfin', timestamp: daysAgo(40) })
  insertRow(db, 'activity_log', { id: 'al-3', type: 'comment', description: 'c', actor: 'casey-eddington', timestamp: daysAgo(45) })
  insertRow(db, 'activity_log', { id: 'al-4', type: 'comment', description: 'c', actor: 'claude-ai', timestamp: daysAgo(2) })
  insertRow(db, 'activity_log', { id: 'al-5', type: 'pb_session', description: 'p', actor: 'nick-ingraham', timestamp: daysAgo(1) })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

async function get(path: string, who: 'apikey' | string) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { headers }), env, CTX)
  return { status: res.status, text: await res.text() }
}

describe('Lab pulse routes are PI-only', () => {
  for (const route of ROUTES) {
    it(`GET /api/analytics/${route}: a member gets 403 and no data`, async () => {
      const r = await get(`/api/analytics/${route}`, MEMBER_EMAIL)
      expect(r.status).toBe(403)
      expect(r.text).not.toContain('nate-mesfin')
      expect(r.text).not.toContain('Nate')
    })
    it(`GET /api/analytics/${route}: the PI session and the PB key get 200`, async () => {
      for (const who of [PI_EMAIL, 'apikey']) {
        expect((await get(`/api/analytics/${route}`, who)).status, who).toBe(200)
      }
    })
  }

  it('team-engagement counts members, not the AI or PB automation', async () => {
    const r = await get('/api/analytics/team-engagement', PI_EMAIL)
    const d = JSON.parse(r.text).data
    expect(d.of).toBe(3) // Nick, Casey, Nate; Hermes is out
    expect(d.active).toBe(1) // Nate; the pb_session row does not make Nick active
    expect(d.prior_active).toBe(2) // Nate and Casey in the 30 days before
    expect(d.trend).toBe('down')
    expect(d.members.map((m: { slug: string }) => m.slug)).not.toContain('claude-ai')
  })

  it('the denominator counts people who use the Hub: a collaborator who never acts is out, one who acts is in', async () => {
    insertRow(db, 'team_members', { id: 'tm-fac', name: 'Faye Faculty', slug: 'faye-faculty', role: 'Professor', member_type: 'faculty', email: 'faye@umn.edu' })
    insertRow(db, 'team_members', { id: 'tm-mentor', name: 'Sam Mentor', slug: 'sam-mentor', role: 'Professor', member_type: 'senior_mentor', email: 'sam@umn.edu' })
    insertRow(db, 'activity_log', { id: 'al-9', type: 'comment', description: 'c', actor: 'sam-mentor', timestamp: daysAgo(100) })
    const d = JSON.parse((await get('/api/analytics/team-engagement', PI_EMAIL)).text).data
    const slugs = d.members.map((m: { slug: string }) => m.slug)
    expect(slugs).not.toContain('faye-faculty')
    expect(slugs).toContain('sam-mentor') // acted 100 days ago: inside the 180-day window
    expect(d.of).toBe(4) // Nick, Casey, Nate, Sam
    expect(d.active).toBe(1) // Sam's action is outside the 30 days
  })

  it('the three routes are never cached: private, no-store on a 200 and on a 403', async () => {
    for (const route of ROUTES) {
      for (const who of [PI_EMAIL, MEMBER_EMAIL]) {
        const res = await worker.fetch(new Request(`https://hub.test/api/analytics/${route}`, { headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who } }), env, CTX)
        expect(res.headers.get('Cache-Control'), `${route} ${who}`).toBe('private, no-store')
      }
    }
  })

  it('days to done has one bar per month, twelve at most, even when a month a year back has rows', async () => {
    const base = { title: 'x', assignee: 'casey-eddington', status: 'done', completed: 1, kind: 'task', priority: 'high' }
    insertRow(db, 'tasks', { id: 't-now', ...base, created_at: at(-5), completed_at: at(-1) })
    insertRow(db, 'tasks', { id: 't-year', ...base, created_at: at(-370), completed_at: at(-361) })
    const months = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data.monthly.map((m: { month: string }) => m.month.slice(5))
    expect(new Set(months).size).toBe(months.length)
    expect(months.length).toBeLessThanOrEqual(12)
  })

  it('pi-dashboard still answers a member, with the per-person engagement list empty', async () => {
    const member = JSON.parse((await get('/api/analytics/pi-dashboard', MEMBER_EMAIL)).text).data
    expect(member.teamEngagement).toEqual([])
    const pi = JSON.parse((await get('/api/analytics/pi-dashboard', PI_EMAIL)).text).data
    expect(pi.teamEngagement.map((m: { slug: string }) => m.slug)).toContain('nate-mesfin')
  })

  it('the PI reads lab-wide: a task and an action on a project the PI is not a member of still count', async () => {
    insertRow(db, 'projects', { id: 'proj_other', slug: 'other', title: 'Other', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'project_members', { project_id: 'proj_other', member_slug: 'casey-eddington', added_by: 'casey-eddington' })
    insertRow(db, 'tasks', { id: 'task_other', project_id: 'proj_other', title: 'x', assignee: 'casey-eddington', status: 'done', completed: 1, kind: 'task', priority: 'high', created_at: at(-12), completed_at: at(-2) })
    insertRow(db, 'activity_log', { id: 'al-6', type: 'project_update', description: 'u', actor: 'casey-eddington', related_id: 'proj_other', related_type: 'project', timestamp: daysAgo(1) })
    const speed = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data
    expect(speed.summary.completed).toBe(1)
    expect(speed.summary.median_days).toBe(10)
    const eng = JSON.parse((await get('/api/analytics/team-engagement', PI_EMAIL)).text).data
    expect(eng.members.find((m: { slug: string }) => m.slug === 'casey-eddington').total).toBe(2)
    expect(eng.active).toBe(2) // Nate and Casey
  })

  it('response-time leaves out deleted tasks, milestones and questions', async () => {
    const base = { title: 'x', assignee: 'casey-eddington', status: 'done', completed: 1, priority: 'high', created_at: at(-8), completed_at: at(-2) }
    insertRow(db, 'tasks', { id: 't-ok', kind: 'task', ...base })
    insertRow(db, 'tasks', { id: 't-del', kind: 'task', deleted_at: at(-1), ...base })
    insertRow(db, 'tasks', { id: 't-ms', kind: 'milestone', ...base })
    insertRow(db, 'tasks', { id: 't-q', kind: 'question', ...base })
    const speed = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data
    expect(speed.summary.completed).toBe(1)
  })

  it('days to done counts team tasks only: not Nick, not unassigned, not closed within a day; a thin sample is flagged', async () => {
    const base = { title: 'x', status: 'done', completed: 1, kind: 'task', priority: 'high' }
    insertRow(db, 'tasks', { id: 'd-1', ...base, assignee: 'casey-eddington', created_at: at(-12), completed_at: at(-2) }) // 10 days
    insertRow(db, 'tasks', { id: 'd-2', ...base, assignee: 'nate-mesfin', created_at: at(-6), completed_at: at(-2) }) // 4 days
    insertRow(db, 'tasks', { id: 'd-3', ...base, assignee: 'nick-ingraham', created_at: at(-30), completed_at: at(-2) }) // Nick: out
    insertRow(db, 'tasks', { id: 'd-4', ...base, assignee: '', created_at: at(-30), completed_at: at(-2) }) // unassigned: out
    insertRow(db, 'tasks', { id: 'd-5', ...base, assignee: 'casey-eddington', created_at: at(-2.5), completed_at: at(-2) }) // 12 hours: out
    const s = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data
    expect(s.summary.completed).toBe(2)
    expect(s.summary.median_days).toBe(7)
    expect(s.summary.small_sample).toBe(true)
    expect(s.byPriority).toEqual([{ priority: 'high', count: 2, median_days: 7 }])
    for (let i = 0; i < 3; i++) insertRow(db, 'tasks', { id: `d-x${i}`, ...base, assignee: 'casey-eddington', created_at: at(-12), completed_at: at(-2) })
    const s5 = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data
    expect(s5.summary.completed).toBe(5)
    expect(s5.summary.small_sample).toBe(false)
    // the dashboard's response metrics are the same definition: team tasks, median
    const rm = JSON.parse((await get('/api/analytics/pi-dashboard', PI_EMAIL)).text).data.responseMetrics
    expect(rm).toMatchObject({ avg_days_recent: s5.summary.median_days, total_tasks: 5, trend: 'insufficient_data' })
    const member = JSON.parse((await get('/api/analytics/pi-dashboard', MEMBER_EMAIL)).text).data.responseMetrics
    expect(member.total_tasks).toBe(0)
  })

  it('active = an assigned task done, a comment or update authored, or something opened; each alone is enough', async () => {
    insertRow(db, 'team_members', { id: 'tm-dan', name: 'Dan Shyu', slug: 'dan-shyu', role: 'RA', member_type: 'research_team', email: 'dan@umn.edu' })
    insertRow(db, 'team_members', { id: 'tm-bea', name: 'Bea Open', slug: 'bea-open', role: 'RA', member_type: 'research_team', email: 'bea@umn.edu' })
    insertRow(db, 'team_members', { id: 'tm-cy', name: 'Cy Idle', slug: 'cy-idle', role: 'RA', member_type: 'research_team', email: 'cy@umn.edu' })
    // Dan: a task assigned to him, finished by the PI (completed_by = the PI's email).
    insertRow(db, 'tasks', { id: 'a-1', title: 'x', assignee: 'dan-shyu', status: 'done', completed: 1, kind: 'task', priority: 'high', created_at: at(-9), completed_at: at(-2), completed_by: PI_EMAIL })
    // Bea: only opened a task. Cy: nothing. Casey: a comment kept in activity_entries.
    insertRow(db, 'entity_seen', { entity_type: 'task', entity_id: 'a-1', viewer_slug: 'bea-open', last_seen_at: at(-1) })
    insertRow(db, 'activity_entries', { id: 'e-1', entity_type: 'task', entity_id: 'a-1', kind: 'comment', actor_slug: 'casey-eddington', body: 'b', created_at: at(-3) })
    // Not authored by a person: a PB progress note and a hidden comment.
    insertRow(db, 'activity_entries', { id: 'e-2', entity_type: 'task', entity_id: 'a-1', kind: 'update', actor_slug: 'cy-idle', body: 'b', source_table: 'pb_progress_note', created_at: at(-3) })
    insertRow(db, 'activity_entries', { id: 'e-3', entity_type: 'task', entity_id: 'a-1', kind: 'comment', actor_slug: 'cy-idle', body: 'b', hidden_at: at(-1), created_at: at(-3) })
    const eng = JSON.parse((await get('/api/analytics/team-engagement', PI_EMAIL)).text).data
    const by = (slug: string) => eng.members.find((m: { slug: string }) => m.slug === slug)
    expect(by('dan-shyu')).toMatchObject({ completions: 1, active: true, score: 1 })
    expect(by('bea-open')).toMatchObject({ total: 0, opened: true, active: true })
    expect(by('cy-idle')).toMatchObject({ active: false })
    expect(by('casey-eddington')).toMatchObject({ comments: 1, active: true })
    expect(by('nick-ingraham').completions).toBe(0) // his clicks on Dan's task are not his completion
    expect(by('nate-mesfin')).toMatchObject({ comments: 1, active: true })
    expect(eng.active).toBe(4)
    // the dashboard's per-person list is the same definition
    const dash = JSON.parse((await get('/api/analytics/pi-dashboard', PI_EMAIL)).text).data.teamEngagement
    expect(dash.map((m: { slug: string }) => m.slug).sort()).toEqual(eng.members.filter((m: { active: boolean }) => m.active).map((m: { slug: string }) => m.slug).sort())
    expect(dash.find((m: { slug: string }) => m.slug === 'dan-shyu')).toMatchObject({ actions: 1, completions: 1, score: 1 })
  })

  it('mentee-velocity counts a paper once when two trainees are on it', async () => {
    insertRow(db, 'team_members', { id: 'tm-ana', name: 'Ana Ruiz', slug: 'ana-ruiz', role: 'Resident', member_type: 'research_team', email: 'ana@umn.edu' })
    const slugs = JSON.stringify(['nate-mesfin', 'ana-ruiz'])
    const lastYear = Number((db.prepare("SELECT strftime('%Y','now') AS y").get() as { y: string }).y) - 1
    insertRow(db, 'publications', { id: 'pub-1', title: 'T', authors: '[]', year: lastYear, status: 'Published', author_slugs: slugs })
    const d = JSON.parse((await get('/api/analytics/mentee-velocity', PI_EMAIL)).text).data
    expect(d.perYear.find((y: { year: number }) => y.year === lastYear).count).toBe(1)
    expect(d.mentees.map((m: { slug: string }) => m.slug).sort()).toEqual(['ana-ruiz', 'nate-mesfin'])
  })

  it('research staff are never trainees: no row in the list, no paper in the pace', async () => {
    insertRow(db, 'team_members', { id: 'tm-steven', name: 'Steven Arriaza', slug: 'steven-arriaza', role: 'Research Coordinator', member_type: 'research_team', email: 'steven@umn.edu' })
    const lastYear = Number((db.prepare("SELECT strftime('%Y','now') AS y").get() as { y: string }).y) - 1
    insertRow(db, 'publications', { id: 'pub-staff', title: 'S', authors: '[]', year: lastYear, status: 'Published', author_slugs: JSON.stringify(['casey-eddington', 'steven-arriaza']) })
    const d = JSON.parse((await get('/api/analytics/mentee-velocity', PI_EMAIL)).text).data
    const slugs = d.mentees.map((m: { slug: string }) => m.slug)
    expect(slugs).not.toContain('casey-eddington')
    expect(slugs).not.toContain('steven-arriaza')
    expect(d.perYear.find((y: { year: number }) => y.year === lastYear).count).toBe(0)
    const dash = JSON.parse((await get('/api/analytics/pi-dashboard', PI_EMAIL)).text).data
    expect(dash.menteeVelocity.map((m: { slug: string }) => m.slug)).not.toContain('steven-arriaza')
  })

  it('completions come from tasks: counted by the ASSIGNEE, not completed_by, not activity_log', async () => {
    const base = { title: 'x', assignee: 'nick-ingraham', status: 'done', completed: 1, kind: 'task', priority: 'high', created_at: at(-9) }
    insertRow(db, 'tasks', { id: 'c-1', completed_at: at(-2), completed_by: PI_EMAIL, ...base, assignee: 'casey-eddington' })
    insertRow(db, 'tasks', { id: 'c-2', completed_at: at(-3), completed_by: 'casey-eddington', ...base, assignee: 'casey-eddington' })
    insertRow(db, 'tasks', { id: 'c-3', completed_at: at(-4), completed_by: MEMBER_EMAIL, ...base }) // Nick's task, Casey clicked: Nick's, not Casey's
    insertRow(db, 'tasks', { id: 'c-4', completed_at: at(-5), completed_by: PI_EMAIL, deleted_at: at(-1), ...base, assignee: 'casey-eddington' })
    const d = JSON.parse((await get('/api/analytics/team-engagement', PI_EMAIL)).text).data
    const casey = d.members.find((m: { slug: string }) => m.slug === 'casey-eddington')
    expect(casey.completions).toBe(2)
    expect(casey.score).toBe(2)
    expect(d.members.find((m: { slug: string }) => m.slug === 'nick-ingraham').completions).toBe(1)
  })

  it('no Lab pulse response carries a project name or slug, a task id or a task title', async () => {
    insertRow(db, 'projects', { id: 'proj_secretx', slug: 'secret-slug-x', title: 'SECRETPROJECTNAME', category: 'MNCCORE', status: 'active', stage: 'idea' })
    insertRow(db, 'tasks', { id: 'task_secretid', project_id: 'proj_secretx', title: 'SECRETTASKTITLE', assignee: 'casey-eddington', status: 'done', completed: 1, kind: 'task', priority: 'high', created_at: at(-9), completed_at: at(-2), completed_by: MEMBER_EMAIL })
    insertRow(db, 'activity_log', { id: 'al-secret', type: 'project_update', description: 'SECRETDESC SECRETPROJECTNAME', actor: 'casey-eddington', related_id: 'proj_secretx', related_type: 'project', timestamp: daysAgo(1) })
    insertRow(db, 'publications', { id: 'pub-secret', title: 'SECRETPUBTITLE', authors: '[]', year: 2024, status: 'Published', author_slugs: JSON.stringify(['nate-mesfin']) })
    for (const route of ROUTES) {
      for (const who of [PI_EMAIL, 'apikey']) {
        const r = await get(`/api/analytics/${route}`, who)
        expect(r.status).toBe(200)
        expect(r.text, `${route} as ${who}`).not.toMatch(/SECRET|secret-slug|proj_|task_secretid/i)
      }
    }
  })
})
