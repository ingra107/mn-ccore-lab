/**
 * api/index.member-gate.test.ts — a signed-in identity is not a member.
 *
 * Cloudflare Access admits any @umn.edu account on /portal/*, and the
 * CF_Authorization cookie identifies it on /api/* too. Until 2026-10-08 the
 * global middleware ran ensureTeamMember on every identified request, which
 * INSERTed an auto_created=1 row for an unknown email and wrote the caller's
 * email onto any row slugged by their email prefix. Every auth: 'authed' route
 * then served that ghost the lab's tasks, projects, meetings and member emails,
 * and accepted its writes.
 *
 * Now membership is a team_members row (or a PI email), checked in one place:
 * the route gate in bindRegistryToHono. This drives the REAL worker
 * (worker.fetch, full middleware stack) over the real migrated schema. Every
 * private value is seeded with SENTINEL; a non-member body must never hold it.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { ROUTE_REGISTRY } from './lib/route-dsl'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'member-gate-test-api-key'
const S = 'SENTINEL'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'eddin022@umn.edu'
// A brand-new UMN NetID: CF Access lets it sign in, no row carries it, and its
// email prefix is the slug of an existing row (the old takeover shape).
const STRANGER = 'jdoe@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

function seed(requireAuth: boolean) {
  db = prodSchemaDb()
  // The chain seeds pi_emails with schema-v44's list; this suite's PI is PI_EMAIL.
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'Co-Director, MN-CCORE', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: MEMBER_EMAIL, bio: `${S} bio` })
  insertRow(db, 'team_members', { id: 'tm-jdoe', name: 'Jane Doe', slug: 'jdoe', role: 'Research Coordinator', member_type: 'research_team', email: 'jane.doe.sentinel@umn.edu' })
  insertRow(db, 'projects', {
    id: 'proj_gate1', title: `${S} project title`, slug: 'gate-project', status: 'active', stage: 'analysis',
    category: 'MNCCORE', pi: 'nick-ingraham', description: `${S} description`, next_action: `${S} next action`,
  })
  insertRow(db, 'tasks', {
    id: 'task_GATE1', title: `${S} task title`, description: `${S} task body`, assignee: 'casey-eddington',
    priority: 'medium', status: 'todo', completed: 0, source: 'manual', project_id: 'proj_gate1',
  })
  insertRow(db, 'publications', { id: 'pub_pub', title: 'A published paper', authors: 'Ingraham N', journal: 'CHEST', year: 2025, status: 'Published', author_slugs: '["nick-ingraham"]' })
  insertRow(db, 'publications', { id: 'pub_rev', title: `${S} paper under review`, authors: 'Ingraham N', journal: 'JAMA', year: 2026, status: 'In Review', author_slugs: '["nick-ingraham"]' })
  insertRow(db, 'publications', { id: 'pub_prep', title: `${S} paper in preparation`, authors: 'Ingraham N', year: 2026, status: 'In Preparation', author_slugs: '["nick-ingraham"]' })
  insertRow(db, 'member_featured_publications', { member_slug: 'nick-ingraham', publication_id: 'pub_pub', sort_order: 0 })
  insertRow(db, 'member_featured_publications', { member_slug: 'nick-ingraham', publication_id: 'pub_rev', sort_order: 1 })
  insertRow(db, 'meetings', { id: 'mtg_gate', date: '2999-01-01', title: `${S} meeting title`, type: 'biweekly', status: 'upcoming', notes: `${S} notes`, owner_slug: 'nick-ingraham', attendees: JSON.stringify(['casey-eddington']) })
  // #145: a meeting Casey is not on. Members read their own meetings only.
  insertRow(db, 'meetings', { id: 'mtg_private', date: '2999-01-02', title: 'PRIVATEMEETING title', type: 'biweekly', status: 'upcoming', owner_slug: 'nick-ingraham' })
  env = {
    DB: d1Adapter(db),
    TEST_MODE_KEY: TEST_KEY,
    PB_API_KEY: API_KEY,
    ...(requireAuth ? { REQUIRE_AUTH: '1' } : {}),
  } as unknown as Env
}

type Who = 'anon' | 'apikey' | string
async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who !== 'anon') { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  const text = await res.text()
  return { status: res.status, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
}

const teamRows = () => db.prepare('SELECT id, slug, email, auto_created FROM team_members ORDER BY id').all()

// A sample of member routes across reads and writes. The registry sweep below
// covers every route; these also check the body.
const MEMBER_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/api/tasks'],
  ['GET', '/api/tasks/task_GATE1'],
  ['GET', '/api/projects/gate-project'],
  ['GET', '/api/meetings'],
  ['GET', '/api/meetings/next'],
  ['GET', '/api/team/slugs'],
  ['GET', '/api/team/pulse'],
  ['GET', '/api/search?q=SENTINEL'],
  ['POST', '/api/tasks', { title: 'ghost wrote this', assignee: 'jdoe' }],
  ['POST', '/api/team/jdoe', { bio: 'ghost bio' }],
  ['POST', '/api/team', { name: 'Ghost Person', email: 'ghost@umn.edu' }],
]

for (const requireAuth of [true, false]) {
  describe(`signed-in non-member (REQUIRE_AUTH=${requireAuth ? '1' : 'unset'})`, () => {
    beforeEach(() => seed(requireAuth))

    for (const [method, path, body] of MEMBER_ROUTES) {
      it(`${method} ${path}: 403 not_a_member, no member data`, async () => {
        const r = await call(method, path, STRANGER, body)
        expect(r.status, r.text).toBe(403)
        expect(r.json).toMatchObject({ code: 'not_a_member' })
        expect(r.text).toContain('ingra107@umn.edu')
        expect(r.text).not.toContain(S)
        expect(r.text).not.toContain(S.toLowerCase())
      })
    }

    it('writes nothing: no team_members row, no claim of the prefix-slug row, no task', async () => {
      const before = teamRows()
      const tasksBefore = db.prepare('SELECT COUNT(*) AS n FROM tasks').get()
      for (const [method, path, body] of MEMBER_ROUTES) await call(method, path, STRANGER, body)
      await call('GET', '/api/auth/me', STRANGER)
      await call('GET', '/api/team', STRANGER)
      expect(teamRows()).toEqual(before)
      expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual(tasksBefore)
    })

    it('/api/auth/me says isMember false and carries no directory or slug', async () => {
      const r = await call('GET', '/api/auth/me', STRANGER)
      expect(r.status).toBe(200)
      expect(r.json).toEqual({ authenticated: true, isMember: false, isPi: false, email: STRANGER, name: 'jdoe' })
    })

    it('publication lists carry only Published rows (the anonRows cut applies to non-members too)', async () => {
      for (const path of ['/api/publications', '/api/team/nick-ingraham/featured-publications']) {
        const r = await call('GET', path, STRANGER)
        expect(r.status, path).toBe(200)
        expect(r.json.data.map((p: { id: string }) => p.id), path).toEqual(['pub_pub'])
        expect(r.json.data.every((p: { status: string }) => p.status === 'Published'), path).toBe(true)
        expect(r.text, path).not.toContain(S)
      }
      // A member still sees every paper.
      const member = await call('GET', '/api/publications', MEMBER_EMAIL)
      expect(member.json.data.map((p: { id: string }) => p.id).sort()).toEqual(['pub_prep', 'pub_pub', 'pub_rev'])
    })

    it('public GETs serve the anonymous shape: no member emails', async () => {
      const team = await call('GET', '/api/team', STRANGER)
      expect(team.status).toBe(200)
      expect(team.text).not.toContain('@umn.edu')
      expect(team.json.data[0]).toEqual({ slug: expect.any(String), name: expect.any(String) })
      const projects = await call('GET', '/api/projects', STRANGER)
      expect(projects.text).not.toContain(S)
    })
  })
}

describe('the gate covers every registered route', () => {
  beforeEach(() => seed(true))

  it('a non-member gets 403 from every route that is not a public GET, and the anon shape from every public GET', async () => {
    const leaks: string[] = []
    for (const route of ROUTE_REGISTRY) {
      const path = route.path.replace(/:[A-Za-z_]+/g, 'gate-x').replace(/\*/g, 'gate-x')
      const r = await call(route.method, path, STRANGER, route.method === 'GET' ? undefined : {})
      const publicGet = route.method === 'GET' && route.auth === 'public'
      if (publicGet) {
        if (r.text.includes(S) || r.text.includes(S.toLowerCase())) leaks.push(`${route.method} ${route.path}: public GET leaked a private value`)
      } else if (route.path.startsWith('/api/pb/')) {
        // The PI-only /api/pb/* middleware answers first (403, PI access only).
        if (r.status !== 403 || r.text.includes(S)) leaks.push(`${route.method} ${route.path}: ${r.status}`)
      } else if (r.status !== 403 || r.json?.code !== 'not_a_member') {
        leaks.push(`${route.method} ${route.path}: ${r.status}`)
      }
    }
    expect(leaks).toEqual([])
    expect(teamRows()).toHaveLength(3)
  })
})

describe('members and service callers are unchanged', () => {
  beforeEach(() => seed(true))

  it('a member reads tasks, projects and meetings in full', async () => {
    const tasks = await call('GET', '/api/tasks', MEMBER_EMAIL)
    expect(tasks.status, tasks.text).toBe(200)
    expect(tasks.text).toContain(`${S} task title`)
    const project = await call('GET', '/api/projects/gate-project', MEMBER_EMAIL)
    expect(project.status).toBe(200)
    expect(project.text).toContain(`${S} next action`)
    const meetings = await call('GET', '/api/meetings', MEMBER_EMAIL)
    expect(meetings.text).toContain(`${S} meeting title`)
    // #145: a meeting that does not name Casey is not hers to read.
    expect(meetings.text).not.toContain('PRIVATEMEETING')
  })

  it('member email match is case-insensitive', async () => {
    expect((await call('GET', '/api/tasks', 'EDDIN022@UMN.EDU')).status).toBe(200)
  })

  it('a member /api/auth/me says isMember true with their slug and the directory', async () => {
    const r = await call('GET', '/api/auth/me', MEMBER_EMAIL)
    expect(r.json).toMatchObject({ authenticated: true, isMember: true, isPi: false, slug: 'casey-eddington' })
    expect(Array.isArray(r.json.directory)).toBe(true)
  })

  it('the PB API key reads and writes', async () => {
    expect((await call('GET', '/api/tasks', 'apikey')).status).toBe(200)
    const all = await call('GET', '/api/meetings', 'apikey')
    expect(all.text).toContain(`${S} meeting title`)
    expect(all.text).toContain('PRIVATEMEETING')
  })

  it('an anonymous caller still gets 401 on a member route', async () => {
    expect((await call('GET', '/api/tasks', 'anon')).status).toBe(401)
    expect((await call('POST', '/api/tasks', 'anon', { title: 'x' })).status).toBe(401)
  })
})

describe('POST /api/team — a PI adds a member', () => {
  beforeEach(() => seed(true))

  it('creates the row with a first-last slug; that email then passes the gate', async () => {
    expect((await call('GET', '/api/tasks', 'newbie001@umn.edu')).status).toBe(403)
    const r = await call('POST', '/api/team', PI_EMAIL, { name: '  José  Q. Newbie ', email: ' NewBie001@UMN.edu ' })
    expect(r.status, r.text).toBe(201)
    expect(r.json.data).toMatchObject({ slug: 'jose-newbie', name: 'José Q. Newbie', email: 'newbie001@umn.edu', member_type: 'research_team', auto_created: 0 })
    expect((await call('GET', '/api/tasks', 'newbie001@umn.edu')).status).toBe(200)
    const me = await call('GET', '/api/auth/me', 'newbie001@umn.edu')
    expect(me.json).toMatchObject({ isMember: true, slug: 'jose-newbie' })
    const logged = db.prepare("SELECT type, description, actor, related_id, related_type FROM activity_log WHERE type = 'member_added'").all()
    expect(logged).toEqual([{ type: 'member_added', description: 'Added José Q. Newbie to the team', actor: 'nick-ingraham', related_id: 'jose-newbie', related_type: 'team_member' }])
  })

  it('409s on an email already on a row, case-insensitively', async () => {
    const r = await call('POST', '/api/team', PI_EMAIL, { name: 'Someone Else', email: 'EDDIN022@umn.edu' })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ code: 'email_taken', slug: 'casey-eddington' })
    expect(teamRows()).toHaveLength(3)
  })

  it('409s on a taken slug; an explicit slug resolves it', async () => {
    const r = await call('POST', '/api/team', PI_EMAIL, { name: 'Casey Eddington', email: 'casey2@umn.edu' })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ code: 'slug_taken', slug: 'casey-eddington' })
    const ok = await call('POST', '/api/team', PI_EMAIL, { name: 'Casey Eddington', email: 'casey2@umn.edu', slug: 'casey-eddington-2' })
    expect(ok.status, ok.text).toBe(201)
  })

  it('400s on a non-UMN email, a blank name or a bad slug', async () => {
    expect((await call('POST', '/api/team', PI_EMAIL, { name: 'A B', email: 'a@gmail.com' })).status).toBe(400)
    expect((await call('POST', '/api/team', PI_EMAIL, { name: '  ', email: 'ab@umn.edu' })).status).toBe(400)
    expect((await call('POST', '/api/team', PI_EMAIL, { name: 'A B', email: 'ab@umn.edu', slug: 'Bad Slug' })).status).toBe(400)
    expect((await call('POST', '/api/team', PI_EMAIL, { name: 'A B', email: 'ab@umn.edu', member_type: 'boss' })).status).toBe(400)
    expect(teamRows()).toHaveLength(3)
  })

  it('accepts a UMN subdomain (Duluth d.umn.edu)', async () => {
    expect((await call('POST', '/api/team', PI_EMAIL, { name: 'Dee Duluth', email: 'dee@d.umn.edu' })).status).toBe(201)
  })

  it('a member who is not a PI gets 403 and nothing is written', async () => {
    const r = await call('POST', '/api/team', MEMBER_EMAIL, { name: 'Sneaky Add', email: 'sneaky@umn.edu' })
    expect(r.status).toBe(403)
    expect(teamRows()).toHaveLength(3)
  })
})
