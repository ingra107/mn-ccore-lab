// pins.test.ts -- GET/POST/DELETE /api/pins, driven through the REAL worker
// (worker.fetch: the full middleware stack, so env.DB is the viewer-bound
// handle) on the migrated prod-schema database. No hand-built tables: the
// watchlist table is the one schema-v49 created.
//
// What must hold:
//   - a member pins and unpins a project they can see; the row lands in
//     watchlist under THEIR slug with the project's typed id (never a slug)
//   - a project the member cannot see answers 404 on pin and unpin, and no
//     row is written
//   - one person's pins are never read or removed by another (the watchlist
//     scope rule limits by entity visibility only, so the route must name the
//     caller's slug itself)
//   - a pin on a project the caller later loses access to stops coming back
//   - an older row that holds a slug still reads back and still unpins

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const CASEY_EMAIL = 'eddin022@umn.edu'
const NATE_EMAIL = 'mesfin@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', member_type: 'director', email: NATE_EMAIL })
  const proj = (id: string, slug: string) =>
    insertRow(db, 'projects', { id, slug, title: slug, category: 'MNCCORE', status: 'active' })
  const member = (project_id: string, member_slug: string) =>
    insertRow(db, 'project_members', { project_id, member_slug, added_by: 'test' })
  proj('proj_shared', 'shared-proj')
  member('proj_shared', 'casey-eddington')
  member('proj_shared', 'nate-mesfin')
  proj('proj_caseyonly', 'casey-only')
  member('proj_caseyonly', 'casey-eddington')
  proj('proj_hidden', 'hidden-proj')
  member('proj_hidden', 'nate-mesfin')
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

async function call(method: string, path: string, who: string | null, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  const text = await res.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body: parsed, text }
}

const rows = () => db.prepare(
  "SELECT member_slug, entity_type, entity_id FROM watchlist WHERE entity_type = 'project' ORDER BY member_slug, entity_id",
).all()
const pinnedSlugs = async (who: string) =>
  ((await call('GET', '/api/pins', who)).body.data as Array<{ slug: string }>).map((p) => p.slug).sort()

describe('/api/pins through the real worker', () => {
  it('a member pins a visible project by slug; the row holds their slug and the typed id', async () => {
    const r = await call('POST', '/api/pins', CASEY_EMAIL, { project: 'shared-proj' })
    expect(r.status).toBe(201)
    expect(r.body.data).toMatchObject({ project_id: 'proj_shared', slug: 'shared-proj', pinned: true })
    expect(rows()).toEqual([{ member_slug: 'casey-eddington', entity_type: 'project', entity_id: 'proj_shared' }])
    expect(await pinnedSlugs(CASEY_EMAIL)).toEqual(['shared-proj'])
  })

  it('pinning twice is one row', async () => {
    await call('POST', '/api/pins', CASEY_EMAIL, { project: 'proj_shared' })
    await call('POST', '/api/pins', CASEY_EMAIL, { project: 'shared-proj' })
    expect(rows()).toHaveLength(1)
  })

  it('a project the member cannot see answers 404 and writes nothing', async () => {
    for (const ref of ['proj_hidden', 'hidden-proj', 'proj_nope']) {
      const r = await call('POST', '/api/pins', CASEY_EMAIL, { project: ref })
      expect(r.status, ref).toBe(404)
    }
    expect(rows()).toEqual([])
  })

  it("one person's pins are never read or removed by another", async () => {
    await call('POST', '/api/pins', NATE_EMAIL, { project: 'shared-proj' })
    await call('POST', '/api/pins', NATE_EMAIL, { project: 'hidden-proj' })
    // Casey can see shared-proj, but Nate's pin on it is not hers.
    expect(await pinnedSlugs(CASEY_EMAIL)).toEqual([])
    const del = await call('DELETE', '/api/pins/shared-proj', CASEY_EMAIL)
    expect(del.status).toBe(200)
    expect((await call('DELETE', '/api/pins/hidden-proj', CASEY_EMAIL)).status).toBe(404)
    expect(await pinnedSlugs(NATE_EMAIL)).toEqual(['hidden-proj', 'shared-proj'])
  })

  it('unpin removes the row; unpinning again is still 200', async () => {
    await call('POST', '/api/pins', CASEY_EMAIL, { project: 'casey-only' })
    expect((await call('DELETE', '/api/pins/casey-only', CASEY_EMAIL)).status).toBe(200)
    expect(rows()).toEqual([])
    expect((await call('DELETE', '/api/pins/proj_caseyonly', CASEY_EMAIL)).status).toBe(200)
  })

  it('a pin on a project the caller later leaves stops coming back', async () => {
    await call('POST', '/api/pins', CASEY_EMAIL, { project: 'casey-only' })
    db.prepare("DELETE FROM project_members WHERE project_id = 'proj_caseyonly' AND member_slug = 'casey-eddington'").run()
    expect(await pinnedSlugs(CASEY_EMAIL)).toEqual([])
  })

  it('an older row holding a slug reads back and unpins', async () => {
    insertRow(db, 'watchlist', { id: 'w-legacy', member_slug: 'casey-eddington', entity_type: 'project', entity_id: 'shared-proj' })
    expect(await pinnedSlugs(CASEY_EMAIL)).toEqual(['shared-proj'])
    await call('DELETE', '/api/pins/proj_shared', CASEY_EMAIL)
    expect(rows()).toEqual([])
  })

  it('an anonymous caller and a signed-in non-member are refused', async () => {
    expect((await call('GET', '/api/pins', null)).status).toBe(401)
    expect((await call('POST', '/api/pins', null, { project: 'shared-proj' })).status).toBe(401)
    expect((await call('GET', '/api/pins', 'stranger@umn.edu')).status).toBe(403)
    expect((await call('POST', '/api/pins', 'stranger@umn.edu', { project: 'shared-proj' })).status).toBe(403)
    expect(rows()).toEqual([])
  })

  it('a missing project field is a 400', async () => {
    expect((await call('POST', '/api/pins', CASEY_EMAIL, {})).status).toBe(400)
  })
})
