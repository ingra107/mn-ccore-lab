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
    expect(eng.members.find((m: { slug: string }) => m.slug === 'casey-eddington').total).toBe(1)
    expect(eng.active).toBe(2) // Nate and Casey
  })

  it('response-time leaves out deleted tasks, milestones and questions', async () => {
    const base = { title: 'x', assignee: 'nick-ingraham', status: 'done', completed: 1, priority: 'high', created_at: at(-8), completed_at: at(-2) }
    insertRow(db, 'tasks', { id: 't-ok', kind: 'task', ...base })
    insertRow(db, 'tasks', { id: 't-del', kind: 'task', deleted_at: at(-1), ...base })
    insertRow(db, 'tasks', { id: 't-ms', kind: 'milestone', ...base })
    insertRow(db, 'tasks', { id: 't-q', kind: 'question', ...base })
    const speed = JSON.parse((await get('/api/analytics/response-time', PI_EMAIL)).text).data
    expect(speed.summary.completed).toBe(1)
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
})
