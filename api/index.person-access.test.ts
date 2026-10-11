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
  insertRow(db, 'projects', { id: 'proj_shared', slug: 'shared', title: 'Shared', category: 'MNCCORE', status: 'active', stage: 'idea' })
  for (const slug of ['nick-ingraham', 'casey-eddington', 'nate-mesfin']) insertRow(db, 'project_members', { project_id: 'proj_shared', member_slug: slug, added_by: slug })
  insertRow(db, 'tasks', { id: 'task-n', project_id: 'proj_shared', title: 'Nate finished this', assignee: 'nate-mesfin', status: 'done', completed: 1, kind: 'task', completed_by: 'nate-mesfin', created_at: daysAgo(5), completed_at: daysAgo(0) })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

async function get(path: string, who: 'apikey' | string) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { headers }), env, CTX)
  return { status: res.status, text: await res.text(), cache: res.headers.get('Cache-Control') }
}

describe('a member sees only their own per-person activity', () => {
  const ROUTES = [
    (slug: string) => `/api/analytics/contributions?slug=${slug}&days=90`,
    (slug: string) => `/api/team/${slug}/contributions?period=90`,
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
