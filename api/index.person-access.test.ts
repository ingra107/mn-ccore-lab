/**
 * api/index.person-access.test.ts -- per-person activity is the person's and
 * the PI's alone (Nick, 2026-10-11: "Members see only their own").
 *
 * Drives the REAL worker (full middleware stack, migrated schema). A member who
 * asks for another member's contributions or score gets 403 and no data; the
 * team pulse hands a member team totals and only their own row. The PI and the
 * PB key read everyone.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'person-access-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env
const daysAgo = (n: number) => (db.prepare("SELECT datetime('now', ?) AS t").get(`-${n} days`) as { t: string }).t

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: CASEY })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', role: 'Fellow', member_type: 'research_team', email: 'nate@umn.edu' })
  insertRow(db, 'activity_log', { id: 'al-1', type: 'comment', description: 'c', actor: 'nate-mesfin', timestamp: daysAgo(0) })
  insertRow(db, 'activity_log', { id: 'al-2', type: 'comment', description: 'c', actor: 'casey-eddington', timestamp: daysAgo(0) })
  // One shared project, so the viewer-bound handle shows every member the task.
  insertRow(db, 'projects', { id: 'proj_shared', slug: 'shared', title: 'Shared', category: 'MNCCORE', status: 'active' })
  for (const slug of ['nick-ingraham', 'casey-eddington', 'nate-mesfin']) insertRow(db, 'project_members', { project_id: 'proj_shared', member_slug: slug, added_by: slug })
  insertRow(db, 'tasks', { id: 'task-n', project_id: 'proj_shared', title: 'Nate finished this', assignee: 'nate-mesfin', status: 'done', completed: 1, kind: 'task', completed_by: 'nate-mesfin', created_at: daysAgo(5), completed_at: daysAgo(0) })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

async function get(path: string, who: 'apikey' | 'anonymous' | string) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who === 'anonymous') { /* no credentials */ }
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { headers }), env, CTX)
  return { status: res.status, text: await res.text(), cache: res.headers.get('Cache-Control') }
}

describe('a member sees only their own per-person activity', () => {
  const ROUTES = [
    (slug: string) => `/api/analytics/contributions?slug=${slug}&days=90`,
    (slug: string) => `/api/team/${slug}/contributions?period=90`,
    (slug: string) => `/api/activity/heatmap?slug=${slug}&days=90`,
  ]

  for (const route of ROUTES) {
    it(`${route('x').split('?')[0].replace('/x', '/:slug')}: another member's slug is refused with 403 and no data`, async () => {
      const r = await get(route('nate-mesfin'), CASEY)
      expect(r.status).toBe(403)
      expect(r.text).not.toContain('Nate finished this')
      expect(r.text).not.toContain('nate-mesfin')
    })
    it(`${route('x').split('?')[0].replace('/x', '/:slug')}: a member reads their own; the PI and the PB key read anyone's`, async () => {
      expect((await get(route('casey-eddington'), CASEY)).status).toBe(200)
      expect((await get(route('nate-mesfin'), PI_EMAIL)).status).toBe(200)
      expect((await get(route('nate-mesfin'), 'apikey')).status).toBe(200)
    })
  }

  it('/api/team/:slug/trajectory: another member gets publications only; self, PI and PB key get the activity', async () => {
    const other = JSON.parse((await get('/api/team/nate-mesfin/trajectory', CASEY)).text).data
    expect(other.taskStats).toEqual([])
    expect(other.projects).toEqual([])
    expect(other.taskMetrics.total).toBe(0)
    for (const who of [PI_EMAIL, 'nate@umn.edu', 'apikey']) {
      const d = JSON.parse((await get('/api/team/nate-mesfin/trajectory', who)).text).data
      expect(d.taskMetrics.total, who).toBe(1)
    }
  })

  it('the contribution list names the task only to the person it is about or the PI', async () => {
    expect((await get('/api/team/nate-mesfin/contributions?period=90', PI_EMAIL)).text).toContain('Nate finished this')
    expect((await get('/api/team/nate-mesfin/contributions?period=90', 'nate@umn.edu')).text).toContain('Nate finished this')
  })

  it('/api/team/pulse: a member gets team totals and only their own row', async () => {
    const member = JSON.parse((await get('/api/team/pulse?hours=48', CASEY)).text).data
    expect(member.scope).toBe('self')
    expect(member.activity.map((a: { slug: string }) => a.slug)).toEqual(['casey-eddington'])
    expect(member.active_this_week).toBe(2) // the team count stays whole
    expect(member.totals.completions).toBe(1) // Nate's completion is in the team total
  })

  it('/api/team/pulse: the PI and the PB key get every row; no response is cacheable', async () => {
    for (const who of [PI_EMAIL, 'apikey']) {
      const r = await get('/api/team/pulse?hours=48', who)
      const d = JSON.parse(r.text).data
      expect(d.scope, who).toBe('all')
      expect(d.activity.map((a: { slug: string }) => a.slug).sort(), who).toEqual(['casey-eddington', 'nate-mesfin'])
      expect(r.cache, who).toBe('private, no-store')
    }
    expect((await get('/api/team/pulse?hours=48', CASEY)).cache).toBe('private, no-store')
  })
})

// Overnight audit 2026-10-14 (G9-1, G9-2, G9-4, G11-8, G11-9). Real worker,
// migrated schema: who reads a member's trajectory, which papers are theirs,
// and who may edit their expertise tags.
describe('trajectory and expertise (2026-10-14)', () => {
  beforeEach(() => {
    // `authors` holds names, never slugs; author_slugs is what names the member.
    insertRow(db, 'publications', { id: 'pub-nate-1', title: 'Nate published', authors: 'Mesfin N, Ingraham NE', journal: 'Chest', year: 2021, status: 'Published', author_slugs: '["nate-mesfin","nick-ingraham"]' })
    insertRow(db, 'publications', { id: 'pub-nate-2', title: 'Nate in review', authors: 'Mesfin N', journal: 'CCM', year: 2025, status: 'In Review', author_slugs: '["nate-mesfin"]' })
    insertRow(db, 'publications', { id: 'pub-casey', title: 'Casey only', authors: 'Eddington C', journal: 'JAMA', year: 2023, status: 'Published', author_slugs: '["casey-eddington"]' })
  })

  it('a signed-out visitor reads the published papers on a public trajectory, not a 401', async () => {
    const r = await get('/api/team/nate-mesfin/trajectory', 'anonymous')
    expect(r.status).toBe(200)
    const d = JSON.parse(r.text).data
    expect(d.publications.map((p: { id: string }) => p.id)).toEqual(['pub-nate-1'])
    expect(d.publications[0].year).toBe(2021)
    expect(d.taskStats).toEqual([])
    expect(d.taskMetrics.total).toBe(0)
  })

  it('a member reading their own trajectory gets every paper whose author_slugs names them, with its year', async () => {
    const d = JSON.parse((await get('/api/team/nate-mesfin/trajectory', 'nate@umn.edu')).text).data
    expect(d.publications.map((p: { id: string }) => p.id).sort()).toEqual(['pub-nate-1', 'pub-nate-2'])
    expect(d.publications.every((p: { year: number }) => typeof p.year === 'number')).toBe(true)
  })

  it('the trajectory "projects" list leaves out finished projects', async () => {
    insertRow(db, 'projects', { id: 'proj_done', slug: 'done-one', title: 'Done one', category: 'MNCCORE', status: 'done' })
    insertRow(db, 'project_members', { project_id: 'proj_done', member_slug: 'nate-mesfin', added_by: 'nate-mesfin' })
    insertRow(db, 'tasks', { id: 'task-d', project_id: 'proj_done', title: 'old', assignee: 'nate-mesfin', status: 'done', completed: 1, completed_at: daysAgo(400), kind: 'task' })
    const d = JSON.parse((await get('/api/team/nate-mesfin/trajectory', 'nate@umn.edu')).text).data
    expect(d.projects.map((p: { id: string }) => p.id)).toEqual(['proj_shared'])
  })

  it('contributions count a paper only when its whole year is inside the window', async () => {
    const thisYear = new Date().getUTCFullYear()
    insertRow(db, 'publications', { id: 'pub-nate-now', title: 'This year', authors: 'Mesfin N', journal: 'Chest', year: thisYear, status: 'Published', author_slugs: '["nate-mesfin"]' })
    const d90 = JSON.parse((await get('/api/team/nate-mesfin/contributions?period=90', 'nate@umn.edu')).text).data
    // A paper dated only "this year" may be older than 90 days, so it is not claimed.
    if (new Date().getUTCMonth() >= 3) expect(d90.publications).toEqual([])
    const d1y = JSON.parse((await get('/api/team/nate-mesfin/contributions?period=365', 'nate@umn.edu')).text).data
    expect(d1y.publications.map((p: { id: string }) => p.id)).toEqual(['pub-nate-now'])
  })

  async function post(path: string, who: string, body?: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
    else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
    const res = await worker.fetch(new Request(`https://hub.test${path}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, CTX)
    return res.status
  }
  const tagCount = (id: string) => (db.prepare('SELECT COUNT(*) AS n FROM expertise_tags WHERE id = ?').get(id) as { n: number }).n

  it('another member cannot delete or add a member\'s expertise tag; the member and the PI can', async () => {
    insertRow(db, 'expertise_tags', { id: 'tag-1', member_slug: 'nate-mesfin', tag: 'Sepsis', source: 'manual', confidence: 1 })
    insertRow(db, 'expertise_tags', { id: 'tag-2', member_slug: 'nate-mesfin', tag: 'ARDS', source: 'manual', confidence: 1 })
    expect(await post('/api/expertise/tag-1/delete', CASEY)).toBe(403)
    expect(tagCount('tag-1')).toBe(1)
    expect(await post('/api/expertise', CASEY, { member_slug: 'nate-mesfin', tag: 'Vandal' })).toBe(403)
    expect(await post('/api/expertise/tag-1/delete', 'nate@umn.edu')).toBe(200)
    expect(tagCount('tag-1')).toBe(0)
    expect(await post('/api/expertise/tag-2/delete', PI_EMAIL)).toBe(200)
    expect(tagCount('tag-2')).toBe(0)
    expect(await post('/api/expertise', 'nate@umn.edu', { member_slug: 'nate-mesfin', tag: 'Ventilation' })).toBe(201)
  })
})
