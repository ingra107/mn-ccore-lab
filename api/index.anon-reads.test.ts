/**
 * api/index.anon-reads.test.ts — what an anonymous caller can read.
 *
 * Prod (REQUIRE_AUTH=1) served every column of every project, internal
 * activity notes, meeting titles and more to callers with no credentials,
 * because the GET gate was a hand-kept path list (isPublicGet) and the public
 * handlers returned whole rows. The read gate now lives in bindRegistryToHono:
 * a GET route is anonymous-readable only when it is auth: 'public', and then
 * only through its anonShape allowlist.
 *
 * Drives the REAL worker (worker.fetch, full middleware stack) over the real
 * migrated schema (prod-schema-db, better-sqlite3 behind a D1 adapter). Every
 * private column is seeded with a value containing SENTINEL; an anonymous
 * body must never contain it. Signed-in callers (test-mode session and the PB
 * API key) must still get the private fields.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import worker from './index'
import type { Env } from './types'
import { ROUTE_REGISTRY } from './lib/route-dsl'
import { nowInstant } from './lib/time'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'anon-reads-test-api-key'
const S = 'SENTINEL'

let env: Env

beforeAll(() => {
  const db = prodSchemaDb()
  insertRow(db, 'team_members', {
    id: 'tm1', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director',
    email: `${S.toLowerCase()}@umn.edu`, bio: 'public bio',
  })
  // The signed-in session below; a member, so it reads full rows (2026-10-08:
  // a signed-in email with no row is a non-member and reads the anon shape).
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', email: 'nate@umn.edu' })
  insertRow(db, 'projects', {
    id: 'proj_anon1', title: `${S} project title`, slug: 'anon-project', status: 'active',
    category: 'MNCCORE', pi: 'nick-ingraham', description: `${S} description`,
    next_action: `${S} next action`, strategic_context: `${S} strategy`, stage_notes: `${S} stage notes`,
    pi_context: `${S} pi context`, key_link_1: `https://docs.google.com/${S}`, key_link_1_desc: `${S} doc`,
    box_url: `https://box.com/${S}`, primary_folder: `C:/${S}/folder`, manuscript_path: `C:/${S}/ms`,
    analysis_path: `C:/${S}/an`, key_files: `${S} files`,
  })
  // #145 Lane B: a member reads the projects they are on; the session user is Nate.
  insertRow(db, 'project_members', { project_id: 'proj_anon1', member_slug: 'nate-mesfin', added_by: 'test' })
  insertRow(db, 'activity_log', {
    id: 'act1', type: 'project_update', description: `${S} internal progress note`,
    related_id: 'anon-project', related_type: 'project', actor: 'nick-ingraham',
    timestamp: nowInstant().replace('T', ' ').slice(0, 19),
  })
  insertRow(db, 'meetings', {
    id: 'mtg_anon', date: '2999-01-01', title: `${S} meeting title`, type: 'biweekly', status: 'upcoming',
    notes: `${S} notes`,
    // #145: a member reads the meetings that name them; the session user is Nate.
    attendees: JSON.stringify(['nate-mesfin']), owner_slug: 'nick-ingraham',
  })
  // A grant is a grant product now (routes/grants.ts): an application under
  // review on the project above.
  insertRow(db, 'products', {
    id: 'prd_01KXANON0GRANT0000000000G1', project_id: 'proj_anon1', kind: 'grant_application', stage: 'submitted',
    title: `${S} proposal title`, short_name: `${S} A0`, venue: 'NIH R01', stage_notes: `${S} stage notes`,
    period_start: '2027-07-01', is_home: 0,
  })
  // A funded award on a project with a public title (Nick 2026-10-12: funded
  // awards only): the one grant row an anonymous caller may read.
  insertRow(db, 'projects', {
    id: 'proj_award', title: 'K23: Provider variation', slug: 'award-project', status: 'active',
    category: 'MNCCORE', pi: 'nick-ingraham', description: `${S} award project description`,
  })
  insertRow(db, 'products', {
    id: 'prd_01KXANON0AWARD00000000000A1', project_id: 'proj_award', kind: 'award', stage: 'active',
    title: `${S} award title`, short_name: `${S} K23`, venue: 'NHLBI K23', stage_notes: `${S} award notes`,
    period_start: '2024-07-01', period_end: '2029-06-30', amount_usd: 123456, is_home: 0,
  })
  insertRow(db, 'publications', {
    id: 'pub1', title: 'A published paper', authors: 'Ingraham N', journal: 'CHEST', year: 2025,
    status: 'Published', author_slugs: '["nick-ingraham"]',
  })
  // Unpublished work is private to signed-in members, rows and all.
  insertRow(db, 'publications', {
    id: 'pub_review', title: `${S} paper in review`, authors: 'Ingraham N', journal: 'CHEST', year: 2026,
    status: 'In Review', abstract: `${S} unpublished abstract`, featured: 1, author_slugs: '["nick-ingraham"]',
  })
  insertRow(db, 'publications', {
    id: 'pub_prep', title: `${S} paper in preparation`, authors: 'Ingraham N', year: 2026,
    status: 'In Preparation', author_slugs: '["nick-ingraham"]',
  })
  insertRow(db, 'member_featured_publications', { member_slug: 'nick-ingraham', publication_id: 'pub1', sort_order: 0 })
  insertRow(db, 'member_featured_publications', { member_slug: 'nick-ingraham', publication_id: 'pub_review', sort_order: 1 })
  insertRow(db, 'research_digest', {
    id: 'digest-1', title: 'A digest paper', journal: 'Lancet', relevance_score: 0.9,
    relevance_reason: `${S} why it matters to Nick`, summary: `${S} summary`, topics: '["sepsis"]',
    digest_date: '2026-10-01', status: 'new',
  })
  insertRow(db, 'expertise_tags', { id: 'e1', member_slug: 'nick-ingraham', tag: 'Sepsis', source: 'manual', confidence: 1 })
  env = {
    DB: d1Adapter(db),
    REQUIRE_AUTH: '1',
    TEST_MODE_KEY: TEST_KEY,
    PB_API_KEY: API_KEY,
  } as unknown as Env
})

async function get(path: string, who: 'anon' | 'session' | 'apikey' = 'anon') {
  const headers: Record<string, string> = {}
  if (who === 'session') { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = 'nate@umn.edu' }
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  const res = await worker.fetch(new Request(`https://hub.test${path}`, { headers }), env, CTX)
  return { status: res.status, text: await res.text() }
}

// Every public GET and the request used to exercise it. The completeness test
// below fails when a public GET is added without a line here.
const PUBLIC_GETS: Record<string, string> = {
  '/api/auth/me': '/api/auth/me',
  '/api/version': '/api/version',
  '/api/health': '/api/health',
  '/api/digest': '/api/digest?limit=4',
  '/api/projects': '/api/projects',
  '/api/projects/health': '/api/projects/health',
  '/api/grants': '/api/grants',
  '/api/grants/timeline': '/api/grants/timeline',
  '/api/expertise': '/api/expertise',
  '/api/publications': '/api/publications',
  '/api/team': '/api/team',
  '/api/stats': '/api/stats',
  '/api/team/:slug/featured-publications': '/api/team/nick-ingraham/featured-publications',
}

// Routes that were readable anonymously in prod and are now signed-in only.
const NOW_SIGNED_IN_ONLY = [
  '/api/projects/anon-project',
  '/api/projects/proj_anon1',
  '/api/projects/deleted-since?since=2000-01-01',
  '/api/meetings',
  '/api/meetings/next',
  '/api/team/slugs',
  '/api/team/pulse',
  '/api/citations',
  '/api/activity?limit=50',
  '/api/digest/dates',
  '/api/digest/comment-counts',
  '/api/digest/digest-1/comments',
]

describe('anonymous reads (REQUIRE_AUTH=1)', () => {
  it('every public GET in the registry is exercised here', () => {
    const publicGets = ROUTE_REGISTRY.filter((r) => r.method === 'GET' && r.auth === 'public').map((r) => r.path).sort()
    expect(publicGets).toEqual(Object.keys(PUBLIC_GETS).sort())
  })

  for (const [route, path] of Object.entries(PUBLIC_GETS)) {
    it(`GET ${route}: 200 and no private field`, async () => {
      const { status, text } = await get(path)
      // /api/health answers 503 here (no realtime binding in the test env).
      if (route === '/api/health') expect([200, 503]).toContain(status)
      else expect(status, text).toBe(200)
      expect(text).not.toContain(S)
      expect(text).not.toContain(S.toLowerCase())
    })
  }

  it('the public shapes keep what the website renders', async () => {
    const projects = JSON.parse((await get('/api/projects')).text)
    expect(projects.data).toEqual([{ status: 'active' }, { status: 'active' }])
    const team = JSON.parse((await get('/api/team')).text)
    expect(team.data).toEqual([{ slug: 'nate-mesfin', name: 'Nate Mesfin' }, { slug: 'nick-ingraham', name: 'Nick Ingraham' }])
    const pubs = JSON.parse((await get('/api/publications')).text)
    expect(pubs.data.map((p: { id: string }) => p.id)).toEqual(['pub1'])
    expect(pubs.data[0]).toMatchObject({ id: 'pub1', title: 'A published paper', status: 'Published' })
    expect(pubs.count).toBe(1)
    const featured = JSON.parse((await get('/api/team/nick-ingraham/featured-publications')).text)
    expect(featured.data.map((p: { id: string }) => p.id)).toEqual(['pub1'])
    expect(featured.count).toBe(1)
    // Asking for the unpublished status by name returns nothing, not the rows.
    const review = JSON.parse((await get('/api/publications?status=In%20Review')).text)
    expect(review).toEqual({ data: [], count: 0 })
    const digest = JSON.parse((await get('/api/digest?limit=4')).text)
    expect(digest.data[0]).toEqual({ id: 'digest-1', title: 'A digest paper', journal: 'Lancet', topics: '["sepsis"]', relevance_score: 0.9 })
    const health = JSON.parse((await get('/api/health')).text)
    expect(Object.keys(health).sort()).toEqual(['failures', 'ok', 'timestamp'])
    const me = JSON.parse((await get('/api/auth/me')).text)
    expect(me).toEqual({ authenticated: false })
    // Grants: FUNDED AWARDS ONLY for an anonymous caller (Nick 2026-10-12). The
    // application under review is invisible, rows and all; the live award shows
    // exactly these keys: no stage, dates, money, notes or product title.
    for (const path of ['/api/grants', '/api/grants/timeline']) {
      const grants = JSON.parse((await get(path)).text)
      expect(grants.data).toEqual([{
        id: 'prd_01KXANON0AWARD00000000000A1', venue: 'NHLBI K23', bucket: 'active',
        project_title: 'K23: Provider variation', pi: 'nick-ingraham', pi_name: 'Nick Ingraham',
      }])
      expect(Object.keys(grants.data[0]).sort()).toEqual(['bucket', 'id', 'pi', 'pi_name', 'project_title', 'venue'])
      expect(JSON.stringify(grants)).not.toContain('prd_01KXANON0GRANT0000000000G1')
    }
    // A member reads the rows of the projects they are on, with the private fields
    // (Nate is on proj_anon1: the application, titled, with its stage).
    const member = JSON.parse((await get('/api/grants', 'session')).text)
    expect(member.data).toHaveLength(1)
    expect(member.data[0]).toMatchObject({ id: 'prd_01KXANON0GRANT0000000000G1', title: `${S} proposal title`, stage: 'submitted', bucket: 'proposed' })
  })

  for (const path of NOW_SIGNED_IN_ONLY) {
    it(`GET ${path}: 401 for an anonymous caller`, async () => {
      const { status, text } = await get(path)
      expect(status, text).toBe(401)
      expect(text).not.toContain(S)
    })
  }

  it('every non-public GET route refuses an anonymous caller before its handler', async () => {
    const leaks: string[] = []
    for (const r of ROUTE_REGISTRY) {
      if (r.method !== 'GET' || r.auth === 'public') continue
      const path = r.path.replace(/:[A-Za-z_]+/g, 'x')
      const { status } = await get(path)
      if (status !== 401 && status !== 403) leaks.push(`${r.path} -> ${status}`)
    }
    expect(leaks).toEqual([])
  })
})

describe('signed-in reads are unchanged', () => {
  for (const who of ['session', 'apikey'] as const) {
    it(`${who}: /api/projects carries the private fields`, async () => {
      const { status, text } = await get('/api/projects', who)
      expect(status).toBe(200)
      const row = JSON.parse(text).data.find((p: { id: string }) => p.id === 'proj_anon1')
      expect(row).toMatchObject({ next_action: `${S} next action`, box_url: `https://box.com/${S}` })
      // P7 (2026-10-09): the PI's local-path fields reach the PI / PB sync key
      // only. 'session' here is Nate, a non-PI member.
      if (who === 'apikey') {
        expect(row).toMatchObject({ primary_folder: `C:/${S}/folder`, manuscript_path: `C:/${S}/ms`, analysis_path: `C:/${S}/an` })
      } else {
        expect(row).not.toHaveProperty('primary_folder')
        expect(row).not.toHaveProperty('manuscript_path')
        expect(row).not.toHaveProperty('analysis_path')
        const one = JSON.parse((await get('/api/projects/anon-project', who)).text).data
        expect(one).not.toHaveProperty('primary_folder')
        expect(one.next_action).toBe(`${S} next action`)
      }
    })
    it(`${who}: /api/activity carries descriptions, /api/meetings and /api/team their full rows`, async () => {
      expect((await get('/api/activity?limit=50', who)).text).toContain(`${S} internal progress note`)
      expect((await get('/api/meetings', who)).text).toContain(`${S} notes`)
      expect((await get('/api/meetings/next', who)).text).toContain(`${S} meeting title`)
      expect((await get('/api/team', who)).text).toContain(`${S.toLowerCase()}@umn.edu`)
      expect((await get('/api/projects/anon-project', who)).status).toBe(200)
    })
    it(`${who}: /api/publications and featured-publications keep unpublished work`, async () => {
      const pubs = JSON.parse((await get('/api/publications', who)).text)
      expect(pubs.data.map((p: { id: string }) => p.id).sort()).toEqual(['pub1', 'pub_prep', 'pub_review'])
      expect(pubs.count).toBe(3)
      const featured = JSON.parse((await get('/api/team/nick-ingraham/featured-publications', who)).text)
      expect(featured.data.map((p: { id: string }) => p.id)).toEqual(['pub1', 'pub_review'])
    })
  }
})
