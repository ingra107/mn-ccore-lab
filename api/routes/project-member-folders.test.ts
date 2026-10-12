// project-member-folders.test.ts -- GET/POST/DELETE /api/projects/:id/my-folder
// (schema-v127), driven through the REAL worker (worker.fetch: the full
// middleware stack, so env.DB is the viewer-bound handle) on the migrated
// prod-schema database. No hand-built table: project_member_folders is the
// one schema-v127 created.
//
// What must hold:
//   - a member sets, edits and clears their own folder; the row lands under
//     THEIR slug with the project's typed id
//   - a path is checked by shared/localFolderPath.ts: Explorer's "Copy as path"
//     quotes are stripped; a web link, a network share and a relative path are
//     refused, and nothing is written
//   - one person's folder is never read, changed or cleared by another, the PI
//     included, and not with "show all projects" on either
//   - a project the caller cannot see is a 404; a project the admin can see
//     but is not on refuses a folder (the composite FK, not a route check)
//   - removing a member removes their folder (ON DELETE CASCADE)
//   - the PB key has no folder (403)
//   - the schema refuses a bad path from any writer (the CHECKs)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { ALL_PROJECTS_HEADER, viewerDb, personViewer, nobodyViewer, type Viewer } from '../lib/viewer-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'folders-api-key'
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
  member('proj_shared', 'nick-ingraham')
  proj('proj_hidden', 'hidden-proj')
  member('proj_hidden', 'nate-mesfin')
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

async function call(method: string, path: string, who: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra }
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
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
  'SELECT project_id, member_slug, folder_path FROM project_member_folders ORDER BY project_id, member_slug',
).all()

const CASEY_WIN = 'C:\\Users\\casey\\Box\\Sepsis Outcomes'
const NICK_MAC = '/Users/nick/Library/CloudStorage/Box-Box/Sepsis'

describe('a member keeps their own folder for a project', () => {
  it('sets, reads back, edits and clears it, by slug or by typed id', async () => {
    const empty = await call('GET', '/api/projects/shared-proj/my-folder', CASEY_EMAIL)
    expect(empty.status).toBe(200)
    expect(empty.body).toMatchObject({ data: null, can_set: true, project_id: 'proj_shared' })

    const set = await call('POST', '/api/projects/shared-proj/my-folder', CASEY_EMAIL, { folder_path: `"${CASEY_WIN}"` })
    expect(set.status, set.text).toBe(200)
    expect(set.body.data.folder_path).toBe(CASEY_WIN)
    expect(rows()).toEqual([{ project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: CASEY_WIN }])

    const edit = await call('POST', '/api/projects/proj_shared/my-folder', CASEY_EMAIL, { folder_path: 'D:/Work/Sepsis/' })
    expect(edit.status, edit.text).toBe(200)
    expect(edit.body.data.folder_path).toBe('D:/Work/Sepsis')
    expect(rows()).toHaveLength(1)

    const read = await call('GET', '/api/projects/proj_shared/my-folder', CASEY_EMAIL)
    expect(read.body.data.folder_path).toBe('D:/Work/Sepsis')

    const clear = await call('DELETE', '/api/projects/shared-proj/my-folder', CASEY_EMAIL)
    expect(clear.status).toBe(200)
    expect(clear.body).toMatchObject({ data: null, cleared: true })
    expect(rows()).toEqual([])
  })

  it('takes a macOS path', async () => {
    const r = await call('POST', '/api/projects/shared-proj/my-folder', PI_EMAIL, { folder_path: NICK_MAC })
    expect(r.status, r.text).toBe(200)
    expect(rows()).toEqual([{ project_id: 'proj_shared', member_slug: 'nick-ingraham', folder_path: NICK_MAC }])
  })

  for (const [bad, why] of [
    ['https://umn.app.box.com/folder/123', 'link'],
    ['file:///C:/Users/casey/Box', 'link'],
    ['\\\\fs.umn.edu\\share\\x', 'Network'],
    ['//fs.umn.edu/share/x', 'Network'],
    ['Box\\Sepsis', 'full path'],
    ['~/Box/Sepsis', '~'],
    ['C:\\a"&calc', 'double quote'],
    ['C:\\a\nb', 'control'],
    ['', 'Enter'],
    ['/', 'whole disk'],
  ] as const) {
    it(`refuses ${JSON.stringify(bad)} and writes nothing`, async () => {
      const r = await call('POST', '/api/projects/shared-proj/my-folder', CASEY_EMAIL, { folder_path: bad })
      expect(r.status, r.text).toBe(400)
      expect(r.body.code).toBe('invalid_folder_path')
      expect(r.body.error).toContain(why)
      expect(rows()).toEqual([])
    })
  }
})

describe('a folder is private to its owner', () => {
  beforeEach(() => {
    insertRow(db, 'project_member_folders', { project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: CASEY_WIN })
  })

  it('the PI on the same project reads only his own (none), with or without "show all projects"', async () => {
    for (const extra of [{}, { [ALL_PROJECTS_HEADER]: '1' }]) {
      const r = await call('GET', '/api/projects/shared-proj/my-folder', PI_EMAIL, undefined, extra)
      expect(r.status).toBe(200)
      expect(r.body.data).toBeNull()
      expect(r.text).not.toContain('casey')
    }
  })

  it("the PI setting and clearing his own leaves Casey's row exactly as it was", async () => {
    expect((await call('POST', '/api/projects/shared-proj/my-folder', PI_EMAIL, { folder_path: NICK_MAC })).status).toBe(200)
    expect((await call('DELETE', '/api/projects/shared-proj/my-folder', PI_EMAIL)).status).toBe(200)
    expect(rows()).toEqual([{ project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: CASEY_WIN }])
  })

  it('removing Casey from the project removes her folder', async () => {
    db.prepare("DELETE FROM project_members WHERE project_id = 'proj_shared' AND member_slug = 'casey-eddington'").run()
    expect(rows()).toEqual([])
  })
})

describe('who cannot keep a folder', () => {
  it('a project the caller cannot see is a 404 and writes nothing', async () => {
    for (const [m, body] of [['GET', undefined], ['POST', { folder_path: CASEY_WIN }], ['DELETE', undefined]] as const) {
      const r = await call(m, '/api/projects/hidden-proj/my-folder', CASEY_EMAIL, body)
      expect(r.status, `${m} ${r.text}`).toBe(404)
    }
    expect(rows()).toEqual([])
  })

  it('the admin with "show all projects" sees a project he is not on, and cannot keep a folder for it', async () => {
    const extra = { [ALL_PROJECTS_HEADER]: '1' }
    const get = await call('GET', '/api/projects/hidden-proj/my-folder', PI_EMAIL, undefined, extra)
    expect(get.status).toBe(200)
    expect(get.body).toMatchObject({ data: null, can_set: false })
    const set = await call('POST', '/api/projects/hidden-proj/my-folder', PI_EMAIL, { folder_path: NICK_MAC }, extra)
    expect(set.status, set.text).toBe(403)
    expect(set.body.code).toBe('not_a_project_member')
    expect(rows()).toEqual([])
  })

  it('the PB key has no person and no folder', async () => {
    for (const [m, body] of [['GET', undefined], ['POST', { folder_path: CASEY_WIN }], ['DELETE', undefined]] as const) {
      const r = await call(m, '/api/projects/shared-proj/my-folder', 'apikey', body)
      expect(r.status, `${m} ${r.text}`).toBe(403)
    }
    expect(rows()).toEqual([])
  })
})

describe('the schema refuses a bad path from any writer (schema-v127 CHECKs)', () => {
  for (const bad of ['Box\\x', '\\\\host\\share', '//host/share', 'C:\\a"b', 'C:\\a\tb', 'x']) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(() => insertRow(db, 'project_member_folders', { project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: bad }))
        .toThrow(/CHECK constraint failed/)
    })
  }
  it('refuses a folder for a non-member (the composite foreign key)', () => {
    expect(() => insertRow(db, 'project_member_folders', { project_id: 'proj_hidden', member_slug: 'casey-eddington', folder_path: CASEY_WIN }))
      .toThrow(/FOREIGN KEY/)
  })
})

// The route names member_slug itself; this proves the table rule does too, so a
// future route that forgets it still leaks nothing.
describe("the table scope admits only the viewer's own rows", () => {
  const NICK = personViewer({ slug: 'nick-ingraham', email: PI_EMAIL, pi: true })
  const NICK_ALL = personViewer({ slug: 'nick-ingraham', email: PI_EMAIL, pi: true, allProjects: true })
  const CASEY = personViewer({ slug: 'casey-eddington', email: CASEY_EMAIL, pi: false })
  const NATE = personViewer({ slug: 'nate-mesfin', email: NATE_EMAIL, pi: false })
  const handle = (v: Viewer) => viewerDb(d1Adapter(db) as unknown as D1Database, v)
  const all = async (v: Viewer) =>
    (await handle(v).prepare('SELECT member_slug, project_id FROM project_member_folders ORDER BY 1, 2').all()).results

  beforeEach(() => {
    insertRow(db, 'project_member_folders', { project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: CASEY_WIN })
    insertRow(db, 'project_member_folders', { project_id: 'proj_shared', member_slug: 'nick-ingraham', folder_path: NICK_MAC })
    insertRow(db, 'project_member_folders', { project_id: 'proj_hidden', member_slug: 'nate-mesfin', folder_path: '/Users/nate/x' })
  })

  it('an unfiltered SELECT returns each person their own rows only', async () => {
    expect(await all(CASEY)).toEqual([{ member_slug: 'casey-eddington', project_id: 'proj_shared' }])
    expect(await all(NICK)).toEqual([{ member_slug: 'nick-ingraham', project_id: 'proj_shared' }])
    expect(await all(NICK_ALL)).toEqual([{ member_slug: 'nick-ingraham', project_id: 'proj_shared' }])
    expect(await all(NATE)).toEqual([{ member_slug: 'nate-mesfin', project_id: 'proj_hidden' }])
    expect(await all(nobodyViewer())).toEqual([])
  })

  it("an unfiltered UPDATE or DELETE reaches only the viewer's own rows", async () => {
    const h = handle(NICK)
    await h.prepare("UPDATE project_member_folders SET folder_path = 'C:/changed'").run()
    await h.prepare('DELETE FROM project_member_folders WHERE 1 = 1').run()
    expect(rows()).toEqual([
      { project_id: 'proj_hidden', member_slug: 'nate-mesfin', folder_path: '/Users/nate/x' },
      { project_id: 'proj_shared', member_slug: 'casey-eddington', folder_path: CASEY_WIN },
    ])
  })
})
