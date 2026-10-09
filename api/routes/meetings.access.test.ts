// meetings.access.test.ts -- schema-v122 meeting access, through the REAL
// worker (full middleware stack, so env.DB is each caller's viewer-bound
// handle) on the migrated schema.
//
// Nick's rulings, 2026-10-09 (PB Context/Decisions/2026-10-09-hub-meeting-access.md):
//   - a meeting is visible to its owner, its attendees, every member when it is
//     a lab meeting, and members of a project it is GRANTED to;
//   - no PI arm, and his "show all projects" switch does not reach meetings;
//   - only the owner or Nick flips private/lab, and only they grant;
//   - everyone who can see a lab meeting can edit its notes;
//   - Hermes asks the Hub (GET /api/meetings/:id/access) instead of copying the rule.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { personViewer, viewerDb, type Viewer } from '../lib/viewer-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'meeting-access-api-key'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const NATE = 'mesfin@umn.edu'    // a second PI, not the site admin
const DAVE = 'dave@umn.edu'      // a member on no meeting and no project
const STRANGER = 'stranger@umn.edu'
const DAY = '2026-10-06'

const M_PRIV = 'mtg-casey-private'   // Casey's own 1:1 (Prep), no attendees
const M_ATT = 'mtg-nate-attends'     // Nick's, Nate on it
const M_LAB = 'mtg-lab'              // Nick's MNCCORE, audience lab
const M_GRANT = 'mtg-granted'        // Nick's, granted to PROJ_C (Casey a member)
const M_DEL = 'mtg-granted-deleted'  // Nick's, granted to a deleted project Casey is on
const M_TAGGED = 'mtg-tagged'        // Nick's, DISCUSSED adhere-lpv (tags), no grant
const PROJ_C = 'proj_caseyproj'
const PROJ_N = 'proj_nickonly'
const PROJ_DEL = 'proj_deleted'

let db: InstanceType<typeof Database>
let env: Env

function seed() {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK, NATE]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', member_type: 'director', email: NATE })
  insertRow(db, 'team_members', { id: 'tm-dave', name: 'Dave Wacker', slug: 'dave-wacker', member_type: 'research_team', email: DAVE })
  const proj = (id: string, slug: string, title: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'projects', { id, slug, title, short_name: `${slug.toUpperCase()}`, category: 'MNCCORE', status: 'active', ...extra })
  proj(PROJ_C, 'casey-proj', 'Casey project')
  proj(PROJ_N, 'nick-proj', 'Nick project')
  proj(PROJ_DEL, 'gone-proj', 'Gone project')
  const member = (p: string, m: string) => insertRow(db, 'project_members', { project_id: p, member_slug: m, added_by: 'test' })
  member(PROJ_C, 'casey-eddington'); member(PROJ_C, 'nick-ingraham')
  member(PROJ_N, 'nick-ingraham')
  member(PROJ_DEL, 'casey-eddington'); member(PROJ_DEL, 'nick-ingraham')
  db.prepare("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?").run(PROJ_DEL)
  const m = (id: string, extra: Record<string, unknown>) =>
    insertRow(db, 'meetings', { id, date: DAY, title: id, notes: `${id} notes`, owner_slug: 'nick-ingraham', ...extra })
  m(M_PRIV, { owner_slug: 'casey-eddington', title: 'Casey and Nick 1:1' })
  m(M_ATT, { attendees: JSON.stringify(['nate-mesfin']) })
  m(M_LAB, { title: 'MNCCORE', audience: 'lab', source_id: 'cal-lab-1' })
  m(M_GRANT, {})
  m(M_DEL, {})
  m(M_TAGGED, { tags: JSON.stringify(['adhere-lpv', 'casey-proj']) })
  insertRow(db, 'meeting_project_grants', { meeting_id: M_GRANT, project_id: PROJ_C, granted_by: 'nick-ingraham' })
  insertRow(db, 'meeting_project_grants', { meeting_id: M_DEL, project_id: PROJ_DEL, granted_by: 'nick-ingraham' })
  insertRow(db, 'agenda_items', { id: 'ag-lab', meeting_id: M_LAB, content: 'LABAGENDA', added_by: NICK })
  insertRow(db, 'hub_decisions', { id: 'dec-lab', title: 'LABDECISION', meeting_id: M_LAB })
  insertRow(db, 'agenda_items', { id: 'ag-grant', meeting_id: M_GRANT, content: 'GRANTAGENDA', added_by: NICK })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
}

async function call(method: string, path: string, who: 'apikey' | string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra }
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, text, json }
}

const listIds = async (who: string, extra: Record<string, string> = {}) =>
  ((await call('GET', '/api/meetings', who, undefined, extra)).json.data as { id: string }[]).map((r) => r.id).sort()

beforeEach(() => {
  seed()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('who sees which meeting (one rule, every viewer kind)', () => {
  it('owner: Casey sees her own 1:1; attendee, lab, granted arms each admit their meeting', async () => {
    expect(await listIds(CASEY)).toEqual([M_GRANT, M_LAB, M_PRIV].sort())
    expect(await listIds(NATE)).toEqual([M_ATT, M_LAB].sort())
  })

  it('a lab meeting reaches a member on nothing, with its agenda and decisions', async () => {
    expect(await listIds(DAVE)).toEqual([M_LAB])
    const detail = await call('GET', `/api/meetings/${M_LAB}`, DAVE)
    expect(detail.status).toBe(200)
    expect(detail.text).toContain('LABAGENDA')
    const decisions = await call('GET', `/api/decisions?meeting_id=${M_LAB}`, DAVE)
    expect(decisions.text).toContain('LABDECISION')
    expect((await call('GET', `/api/meetings/${M_PRIV}`, DAVE)).status).toBe(404)
  })

  it('a granted project admits its members; revoking hides it again; a deleted project admits no one', async () => {
    expect((await call('GET', `/api/meetings/${M_GRANT}`, CASEY)).text).toContain('GRANTAGENDA')
    expect((await call('GET', `/api/meetings/${M_DEL}`, CASEY)).status).toBe(404)
    const revoke = await call('DELETE', `/api/meetings/${M_GRANT}/projects/${PROJ_C}`, NICK)
    expect(revoke.status).toBe(200)
    expect((await call('GET', `/api/meetings/${M_GRANT}`, CASEY)).status).toBe(404)
    // Nate is on no granted project: never saw it.
    expect((await call('GET', `/api/meetings/${M_GRANT}`, NATE)).status).toBe(404)
  })

  it('a project a meeting only DISCUSSED (tags) confers nothing, even when a member squats the slug', async () => {
    expect(await listIds(CASEY)).not.toContain(M_TAGGED)
    const squat = await call('POST', '/api/projects', CASEY, { title: 'Squat', slug: 'adhere-lpv', category: 'MNCCORE' })
    expect([200, 201]).toContain(squat.status)
    expect((await call('GET', `/api/meetings/${M_TAGGED}`, CASEY)).status).toBe(404)
  })

  it('no PI arm: Nate (a PI) does not see Casey\'s private 1:1', async () => {
    expect((await call('GET', `/api/meetings/${M_PRIV}`, NATE)).status).toBe(404)
  })

  it("Nick's admin switch never reaches meetings: same list on or off, and not Casey's 1:1", async () => {
    const off = await listIds(NICK)
    const on = await listIds(NICK, { 'X-Hub-All-Projects': '1' })
    expect(off).toEqual([M_ATT, M_DEL, M_GRANT, M_LAB, M_TAGGED].sort())
    expect(on).toEqual(off)
    expect((await call('GET', `/api/meetings/${M_PRIV}`, NICK, undefined, { 'X-Hub-All-Projects': '1' })).status).toBe(404)
  })

  it('the PB key sees every meeting; a stranger sees none', async () => {
    expect(await listIds('apikey')).toHaveLength(6)
    expect((await call('GET', '/api/meetings', STRANGER)).status).not.toBe(200)
  })

  it('everyone who can see a lab meeting can edit its notes and agenda', async () => {
    expect((await call('POST', `/api/meetings/${M_LAB}/notes`, DAVE, { notes: 'Dave was here' })).status).toBe(200)
    expect((await call('POST', `/api/meetings/${M_LAB}/agenda`, DAVE, { content: 'Dave item' })).status).toBe(201)
    expect((db.prepare('SELECT notes FROM meetings WHERE id = ?').get(M_LAB) as { notes: string }).notes).toBe('Dave was here')
  })
})

describe('flip private / lab: owner + Nick only', () => {
  const flip = (id: string, who: string, audience: unknown) => call('POST', `/api/meetings/${id}/meta`, who, { audience })
  const audienceOf = (id: string) => (db.prepare('SELECT audience FROM meetings WHERE id = ?').get(id) as { audience: string }).audience

  it('the owner may flip their own meeting, and an activity row says so', async () => {
    expect((await flip(M_PRIV, CASEY, 'lab')).status).toBe(200)
    expect(audienceOf(M_PRIV)).toBe('lab')
    const log = db.prepare("SELECT description FROM activity_log WHERE related_id = ? ORDER BY rowid DESC LIMIT 1").get(M_PRIV) as { description: string }
    expect(log.description).toBe('Marked as lab meeting')
  })

  it('Nick may flip any meeting he can see; nobody else may, the PB key included', async () => {
    expect((await flip(M_ATT, NICK, 'lab')).status).toBe(200)
    expect(audienceOf(M_ATT)).toBe('lab')
    expect((await flip(M_LAB, DAVE, 'private')).status).toBe(403)
    expect((await flip(M_ATT, NATE, 'private')).status).toBe(403)
    expect((await call('POST', `/api/meetings/${M_LAB}/meta`, 'apikey', { audience: 'private' })).status).toBe(403)
    expect(audienceOf(M_LAB)).toBe('lab')
  })

  it('a value outside the vocabulary is 400; a hidden meeting is 404', async () => {
    expect((await flip(M_LAB, NICK, 'public')).status).toBe(400)
    expect((await flip(M_PRIV, NATE, 'lab')).status).toBe(404)
  })

  it('a second lab meeting of one title on one day is 409 (schema-v122 index)', async () => {
    insertRow(db, 'meetings', { id: 'mtg-lab-twin', date: DAY, title: 'MNCCORE', owner_slug: 'casey-eddington', attendees: JSON.stringify(['nick-ingraham']) })
    expect((await flip('mtg-lab-twin', NICK, 'lab')).status).toBe(409)
    expect(audienceOf('mtg-lab-twin')).toBe('private')
  })

  it("a rename onto another of the owner's meetings that day is a per-owner 409, not the lab-title one", async () => {
    insertRow(db, 'meetings', { id: 'mtg-casey-2', date: DAY, title: 'Casey other', owner_slug: 'casey-eddington' })
    const r = await call('POST', '/api/meetings/mtg-casey-2/meta', CASEY, { title: 'Casey and Nick 1:1' })
    expect(r.status).toBe(409)
    expect(r.text).not.toContain('lab meeting')
  })

  it('the column refuses anything but private/lab (CHECK)', () => {
    expect(() => db.prepare("UPDATE meetings SET audience = 'public' WHERE id = ?").run(M_LAB)).toThrow(/CHECK/)
  })
})

describe('attendees decide access, so only the owner or Nick sets them', () => {
  const setAttendees = (id: string, who: string, attendees: string[]) => call('POST', `/api/meetings/${id}/meta`, who, { attendees })
  const attendeesOf = (id: string) => (db.prepare('SELECT attendees FROM meetings WHERE id = ?').get(id) as { attendees: string | null }).attendees

  it('a granted-project member who is not an attendee cannot add one (B1)', async () => {
    expect((await setAttendees(M_GRANT, CASEY, ['outsider@gmail.com'])).status).toBe(403)
    expect(attendeesOf(M_GRANT)).toBeNull()
  })

  it('a lab member cannot add attendees to a lab meeting', async () => {
    expect((await setAttendees(M_LAB, DAVE, ['dave-wacker', 'outsider@gmail.com'])).status).toBe(403)
  })

  it('an attendee may take only themselves off', async () => {
    expect((await setAttendees(M_ATT, NATE, ['nate-mesfin', 'outsider@gmail.com'])).status).toBe(403)
    expect((await setAttendees(M_ATT, NATE, [])).status).toBe(200)
    expect(JSON.parse(attendeesOf(M_ATT)!)).toEqual([])
  })

  it('the owner and Nick may set them', async () => {
    expect((await setAttendees(M_PRIV, CASEY, ['nate-mesfin'])).status).toBe(200)
    expect((await setAttendees(M_GRANT, NICK, ['casey-eddington'])).status).toBe(200)
  })

  it('other fields stay editable by anyone who can see the meeting', async () => {
    expect((await call('POST', `/api/meetings/${M_LAB}/meta`, DAVE, { tags: ['x'] })).status).toBe(200)
  })
})

describe('"belongs to" grants: owner + Nick only, typed project id', () => {
  const grant = (id: string, who: string, project: string) => call('POST', `/api/meetings/${id}/projects`, who, { project })
  const grants = (id: string) => db.prepare('SELECT project_id, granted_by FROM meeting_project_grants WHERE meeting_id = ? ORDER BY project_id').all(id)

  it('the owner grants by slug; the row stores the typed id; a repeat adds nothing', async () => {
    const r = await grant(M_PRIV, CASEY, 'casey-proj')
    expect(r.status).toBe(200)
    expect(r.json.data).toEqual([{ id: PROJ_C, slug: 'casey-proj', short_name: 'CASEY-PROJ', title: 'Casey project' }])
    expect((await grant(M_PRIV, CASEY, PROJ_C)).status).toBe(200)
    expect(grants(M_PRIV)).toEqual([{ project_id: PROJ_C, granted_by: 'casey-eddington' }])
  })

  it('Nick grants on any meeting he can see', async () => {
    expect((await grant(M_ATT, NICK, PROJ_N)).status).toBe(200)
    expect(grants(M_ATT)).toEqual([{ project_id: PROJ_N, granted_by: 'nick-ingraham' }])
  })

  it('another member is 403, the PB key is 403, a hidden meeting is 404, an unknown or unseen project is 404', async () => {
    expect((await grant(M_LAB, DAVE, PROJ_C)).status).toBe(403)
    expect((await grant(M_LAB, 'apikey', PROJ_C)).status).toBe(403)
    expect((await grant(M_ATT, CASEY, PROJ_C)).status).toBe(404)
    expect((await grant(M_PRIV, CASEY, 'no-such-project')).status).toBe(404)
    // Casey owns M_PRIV but is not on Nick's project: it does not resolve for her.
    expect((await grant(M_PRIV, CASEY, PROJ_N)).status).toBe(404)
    expect(grants(M_LAB)).toEqual([])
  })

  it('the table refuses a slug or a missing project (FK)', () => {
    expect(() => db.prepare("INSERT INTO meeting_project_grants (meeting_id, project_id, granted_by) VALUES (?, 'casey-proj', 'x')").run(M_LAB)).toThrow(/FOREIGN KEY/)
  })

  it('revoke: other member 403; owner or Nick removes it', async () => {
    expect((await call('DELETE', `/api/meetings/${M_GRANT}/projects/${PROJ_C}`, DAVE)).status).toBe(404)
    expect((await call('DELETE', `/api/meetings/${M_GRANT}/projects/${PROJ_C}`, CASEY)).status).toBe(403)
    expect(grants(M_GRANT)).toHaveLength(1)
    expect((await call('DELETE', `/api/meetings/${M_GRANT}/projects/${PROJ_C}`, NICK)).status).toBe(200)
    expect(grants(M_GRANT)).toEqual([])
  })

  it('revoking a project the caller cannot see is 404 unless the meeting holds that grant (N5)', async () => {
    expect((await call('DELETE', `/api/meetings/${M_PRIV}/projects/no-such-project`, CASEY)).status).toBe(404)
    expect((await call('DELETE', `/api/meetings/${M_PRIV}/projects/nick-proj`, CASEY)).status).toBe(404)
    // A grant to a project she is not on is still removable by its id.
    insertRow(db, 'meeting_project_grants', { meeting_id: M_PRIV, project_id: PROJ_N, granted_by: 'nick-ingraham' })
    expect((await call('DELETE', `/api/meetings/${M_PRIV}/projects/${PROJ_N}`, CASEY)).status).toBe(200)
    expect(grants(M_PRIV)).toEqual([])
  })

  it('the meeting detail tells the page who may manage access', async () => {
    expect((await call('GET', `/api/meetings/${M_GRANT}`, NICK)).json.data.can_manage_access).toBe(true)
    expect((await call('GET', `/api/meetings/${M_GRANT}`, CASEY)).json.data.can_manage_access).toBe(false)
    expect((await call('GET', `/api/meetings/${M_PRIV}`, CASEY)).json.data.can_manage_access).toBe(true)
  })

  it('a PB re-push that changes the tags leaves the grant alone', async () => {
    const r = await call('POST', '/api/meetings', 'apikey', { date: DAY, title: M_GRANT, tags: ['something-else'], notes: 'n' })
    expect(r.status).toBe(200)
    expect(grants(M_GRANT)).toHaveLength(1)
  })
})

describe('Today payload: the list carries what a meeting card shows', () => {
  it('attendees, granted projects with short names, and the action counts', async () => {
    insertRow(db, 'tasks', { id: 'task-a1', title: 'a1', project_id: PROJ_C, assignee: 'casey-eddington', meeting_id: M_GRANT })
    insertRow(db, 'tasks', { id: 'task-a2', title: 'a2', project_id: PROJ_C, assignee: 'casey-eddington', meeting_id: M_GRANT, completed: 1, status: 'done', completed_at: '2026-10-07 00:00:00' })
    insertRow(db, 'tasks', { id: 'task-a3', title: 'a3', project_id: PROJ_C, assignee: 'casey-eddington', meeting_id: 'cal-lab-1' })
    insertRow(db, 'tasks', { id: 'task-gone', title: 'gone', project_id: PROJ_C, assignee: 'casey-eddington', meeting_id: M_GRANT, deleted_at: '2026-10-07 00:00:00' })
    const rows = (await call('GET', '/api/meetings', CASEY)).json.data as Record<string, unknown>[]
    const g = rows.find((r) => r.id === M_GRANT)!
    expect(JSON.parse(g.granted_projects as string)).toEqual([{ id: PROJ_C, slug: 'casey-proj', short_name: 'CASEY-PROJ', title: 'Casey project' }])
    expect(g.action_count).toBe(2)
    expect(g.open_action_count).toBe(1)
    const lab = rows.find((r) => r.id === M_LAB)!
    expect(lab.audience).toBe('lab')
    expect(JSON.parse(lab.granted_projects as string)).toEqual([])
    expect(lab.action_count).toBe(1) // counted through PB's source_id
    expect(rows.find((r) => r.id === M_PRIV)).toHaveProperty('attendees')
  })

  it('a granted project the caller is not on keeps its id and hides its names', async () => {
    insertRow(db, 'meeting_project_grants', { meeting_id: M_LAB, project_id: PROJ_N, granted_by: 'nick-ingraham' })
    const lab = ((await call('GET', '/api/meetings', DAVE)).json.data as Record<string, unknown>[]).find((r) => r.id === M_LAB)!
    expect(JSON.parse(lab.granted_projects as string)).toEqual([{ id: PROJ_N, slug: null, short_name: null, title: null }])
  })
})

describe('lab series dedup on write (upsertMeeting)', () => {
  it('a member prepping the series meeting lands on the lab row, not a second one', async () => {
    const r = await call('POST', '/api/meetings', CASEY, { date: DAY, title: 'mnccore' })
    expect(r.status).toBe(200)
    expect(r.json.data.id).toBe(M_LAB)
    expect(db.prepare("SELECT COUNT(*) AS n FROM meetings WHERE date = ? AND lower(title) = 'mnccore'").get(DAY)).toEqual({ n: 1 })
  })

  it('a new series row is born lab; any other title is born private, with no "biweekly" type', async () => {
    const lab = await call('POST', '/api/meetings', CASEY, { date: '2026-10-08', title: 'Pulmonary HSR Group Meeting' })
    expect(lab.status).toBe(201)
    expect(lab.json.data.audience).toBe('lab')
    const priv = await call('POST', '/api/meetings', CASEY, { date: '2026-10-08', title: 'Journal club' })
    expect(priv.json.data.audience).toBe('private')
    expect(priv.json.data.type).toBeNull()
    expect((await listIds(DAVE))).toContain(lab.json.data.id)
  })

  it("a member's private non-series meeting never merges into a lab meeting of the same title", async () => {
    insertRow(db, 'meetings', { id: 'mtg-jc-lab', date: DAY, title: 'Journal club', owner_slug: 'nick-ingraham', audience: 'lab' })
    const r = await call('POST', '/api/meetings', CASEY, { date: DAY, title: 'Journal club', notes: 'my private notes' })
    expect(r.status).toBe(201)
    expect(r.json.data.id).not.toBe('mtg-jc-lab')
    expect(r.json.data.audience).toBe('private')
    expect((db.prepare('SELECT notes FROM meetings WHERE id = ?').get('mtg-jc-lab') as { notes: string | null }).notes).toBeNull()
  })

  it("the PB debrief onto a lab row a member prepped fills its notes, takes ownership, and rings Nick, not the member", async () => {
    insertRow(db, 'meetings', { id: 'mtg-hsr-prep', date: '2026-10-09', title: 'Pulmonary HSR Group Meeting', owner_slug: 'casey-eddington', audience: 'lab' })
    const r = await call('POST', '/api/meetings', 'apikey', { date: '2026-10-09', title: 'Pulmonary HSR Group Meeting', notes: 'debrief', source_id: 'cal-hsr-9' })
    expect(r.json.data.id).toBe('mtg-hsr-prep')
    expect(r.json.data.notes).toBe('debrief')
    // Nick, 2026-10-09: "You own every series row: your PB debrief takes ownership of a series row".
    expect(r.json.data.owner_slug).toBe('nick-ingraham')
    const bell = db.prepare("SELECT recipient_slug FROM notifications WHERE type = 'meeting_debrief' AND source_id = ?").all('mtg-hsr-prep')
    expect(bell).toEqual([{ recipient_slug: 'nick-ingraham' }])
    expect((await call('POST', '/api/meetings/mtg-hsr-prep/meta', CASEY, { audience: 'private' })).status).toBe(403)
  })

  it('a re-push never re-derives a hand-flipped audience', async () => {
    expect((await call('POST', `/api/meetings/${M_LAB}/meta`, NICK, { audience: 'private' })).status).toBe(200)
    await call('POST', '/api/meetings', 'apikey', { date: DAY, title: 'MNCCORE', notes: 'again', source_id: 'cal-lab-1' })
    expect((db.prepare('SELECT audience FROM meetings WHERE id = ?').get(M_LAB) as { audience: string }).audience).toBe('private')
  })

  it('a racing INSERT of the same lab meeting lands on the winner instead of failing', async () => {
    // Make both lookups miss once (the race window: the lab-row match and the
    // series owner's own rows), so the INSERT hits an index.
    const real = env.DB
    let missed = false
    let missedOwn = false
    env = {
      ...env,
      DB: {
        ...real,
        prepare: (sql: string) => {
          if (!missed && sql.includes("audience = 'lab' ORDER BY created_at")) {
            missed = true
            return real.prepare(sql.replace("audience = 'lab'", "audience = 'lab' AND 0"))
          }
          if (!missedOwn && sql.includes('owner_slug IS ? OR')) {
            missedOwn = true
            return real.prepare(sql.replace('WHERE date = ?', 'WHERE 0 AND date = ?'))
          }
          return real.prepare(sql)
        },
        batch: real.batch.bind(real),
      } as unknown as D1Database,
    } as Env
    const r = await call('POST', '/api/meetings', CASEY, { date: DAY, title: 'MNCCORE', attendees: ['casey-eddington'] })
    expect(missed).toBe(true)
    expect(missedOwn).toBe(true)
    expect(r.status).toBe(200)
    expect(r.json.data.id).toBe(M_LAB)
  })

  it("a series row a member creates is Nick's from its first write; the member cannot flip or grant it", async () => {
    const r = await call('POST', '/api/meetings', CASEY, { date: '2026-10-20', title: 'CLIF WG Weekly' })
    expect(r.status).toBe(201)
    expect(r.json.data.owner_slug).toBe('nick-ingraham')
    expect(r.json.data.audience).toBe('lab')
    const id = r.json.data.id as string
    expect((await call('GET', `/api/meetings/${id}`, CASEY)).json.data.can_manage_access).toBe(false)
    expect((await call('POST', `/api/meetings/${id}/meta`, CASEY, { audience: 'private' })).status).toBe(403)
    expect((await call('POST', `/api/meetings/${id}/projects`, CASEY, { project: PROJ_C })).status).toBe(403)
    expect((await call('POST', `/api/meetings/${id}/meta`, NICK, { audience: 'private' })).status).toBe(200)
  })

  it('a series row still owned by a member (written before the ruling) is Nick\'s alone by its title', async () => {
    insertRow(db, 'meetings', { id: 'mtg-old-prep', date: '2026-09-01', title: 'MNCCORE', owner_slug: 'casey-eddington', audience: 'lab' })
    expect((await call('GET', '/api/meetings/mtg-old-prep', CASEY)).json.data.can_manage_access).toBe(false)
    expect((await call('POST', '/api/meetings/mtg-old-prep/meta', CASEY, { audience: 'private' })).status).toBe(403)
    expect((await call('GET', '/api/meetings/mtg-old-prep', NICK)).json.data.can_manage_access).toBe(true)
  })

  it("a member's create POST onto Nick's series row fills only what is empty and never sets attendees", async () => {
    db.prepare("UPDATE meetings SET decisions = NULL, attendees = NULL WHERE id = ?").run(M_LAB)
    const r = await call('POST', '/api/meetings', CASEY, {
      date: DAY, title: 'MNCCORE', notes: 'casey overwrite', decisions: 'casey decision', attendees: ['outsider@gmail.com'],
    })
    expect(r.status).toBe(200)
    expect(r.json.data.id).toBe(M_LAB)
    const row = db.prepare('SELECT notes, decisions, attendees, owner_slug FROM meetings WHERE id = ?').get(M_LAB) as Record<string, string | null>
    expect(row.notes).toBe(`${M_LAB} notes`)        // Nick's debrief survives
    expect(row.decisions).toBe('casey decision')     // an empty field is filled
    expect(row.attendees).toBeNull()                 // no access handed out by a merge
    expect(row.owner_slug).toBe('nick-ingraham')
    // The PB debrief (Nick, the owner) still refreshes its own notes.
    await call('POST', '/api/meetings', 'apikey', { date: DAY, title: 'MNCCORE', notes: 'debrief v2', source_id: 'cal-lab-1' })
    expect((db.prepare('SELECT notes FROM meetings WHERE id = ?').get(M_LAB) as { notes: string }).notes).toBe('debrief v2')
  })

  it("a member writing a series title Nick made private that day gets 409, not a twin and not a 500", async () => {
    db.prepare("UPDATE meetings SET audience = 'private' WHERE id = ?").run(M_LAB)
    const r = await call('POST', '/api/meetings', CASEY, { date: DAY, title: 'MNCCORE' })
    expect(r.status).toBe(409)
    expect(db.prepare("SELECT COUNT(*) AS n FROM meetings WHERE date = ? AND title = 'MNCCORE'").get(DAY)).toEqual({ n: 1 })
  })

  it('the index makes two lab rows of one title on one day unrepresentable', () => {
    expect(() => insertRow(db, 'meetings', { id: 'x', date: DAY, title: ' mnccore ', audience: 'lab' })).toThrow(/UNIQUE/)
  })
})

describe('GET /api/meetings/:id/access (Hermes asks the Hub)', () => {
  const access = (id: string, member: string, who: string = 'apikey') => call('GET', `/api/meetings/${id}/access?member=${member}`, who)

  it('names the arm that admits the member', async () => {
    expect((await access(M_PRIV, 'casey-eddington')).json.data).toMatchObject({ visible: true, arms: ['owner'] })
    expect((await access(M_ATT, 'nate-mesfin')).json.data).toMatchObject({ visible: true, arms: ['attendee'] })
    expect((await access(M_LAB, 'dave-wacker')).json.data).toMatchObject({ visible: true, arms: ['lab'] })
    expect((await access(M_GRANT, 'casey-eddington')).json.data).toMatchObject({ visible: true, arms: ['project'] })
    expect((await access(M_PRIV, 'nick-ingraham')).json.data).toMatchObject({ visible: false, arms: [] })
    expect((await access(M_TAGGED, 'casey-eddington')).json.data).toMatchObject({ visible: false, arms: [] })
    expect((await access(M_PRIV, 'nobody-here')).json.data).toMatchObject({ visible: false })
  })

  it('agrees with the viewer-bound handle for every meeting and member', async () => {
    const people: [string, string][] = [['nick-ingraham', NICK], ['casey-eddington', CASEY], ['nate-mesfin', NATE], ['dave-wacker', DAVE]]
    for (const [slug, email] of people) {
      const v: Viewer = personViewer({ slug, email, pi: false })
      const seen = await viewerDb(env.DB as unknown as D1Database, v).prepare('SELECT id FROM meetings').all<{ id: string }>()
      const ids = new Set((seen.results ?? []).map((r) => r.id))
      for (const id of [M_PRIV, M_ATT, M_LAB, M_GRANT, M_DEL, M_TAGGED]) {
        expect((await access(id, slug)).json.data.visible, `${slug} ${id}`).toBe(ids.has(id))
      }
    }
  })

  it('is the PB key only: a signed-in person, Nick included, is 403; a missing meeting is 404', async () => {
    expect((await access(M_LAB, 'casey-eddington', NICK)).status).toBe(403)
    expect((await access(M_LAB, 'casey-eddington', CASEY)).status).toBe(403)
    expect((await access('mtg-none', 'casey-eddington')).status).toBe(404)
    expect((await call('GET', `/api/meetings/${M_LAB}/access`, 'apikey')).status).toBe(400)
  })
})

describe('thread read markers (cross-device "New")', () => {
  beforeEach(() => {
    insertRow(db, 'activity_entries', { id: 'ae-root', entity_type: 'meeting', entity_id: M_LAB, kind: 'comment', actor_slug: 'nick-ingraham', body: 'root' })
    insertRow(db, 'activity_entries', { id: 'ae-reply', entity_type: 'meeting', entity_id: M_LAB, kind: 'comment', actor_slug: 'nick-ingraham', body: 'reply', parent_id: 'ae-root' })
    insertRow(db, 'activity_entries', { id: 'ae-hidden-root', entity_type: 'meeting', entity_id: M_PRIV, kind: 'comment', actor_slug: 'casey-eddington', body: 'private' })
  })
  const mark = (who: string, root: string, ts: string) => call('POST', '/api/thread-seen', who, { root_id: root, read_up_to: ts })
  const mine = async (who: string) => (await call('GET', '/api/thread-seen', who)).json.data

  it('records how far a reader has read, and only moves forward', async () => {
    expect((await mark(DAVE, 'ae-root', '2026-10-09 10:00:00')).status).toBe(200)
    expect(await mine(DAVE)).toEqual([{ root_id: 'ae-root', read_up_to: '2026-10-09 10:00:00' }])
    await mark(DAVE, 'ae-root', '2026-10-09 09:00:00')
    expect(await mine(DAVE)).toEqual([{ root_id: 'ae-root', read_up_to: '2026-10-09 10:00:00' }])
    await mark(DAVE, 'ae-root', '2026-10-09 11:00:00')
    expect((await mine(DAVE))[0].read_up_to).toBe('2026-10-09 11:00:00')
  })

  it("compares one timestamp form: a 'T' marker never beats a later ' ' one (N4)", async () => {
    await mark(DAVE, 'ae-root', '2026-10-09 10:00:00')
    await mark(DAVE, 'ae-root', '2026-10-09T09:00:00')
    expect((await mine(DAVE))[0].read_up_to).toBe('2026-10-09 10:00:00')
    await mark(DAVE, 'ae-root', '2026-10-09T11:00:00Z')
    expect((await mine(DAVE))[0].read_up_to).toBe('2026-10-09 11:00:00')
  })

  it("is per reader: another member's markers never show", async () => {
    await mark(DAVE, 'ae-root', '2026-10-09 10:00:00')
    expect(await mine(CASEY)).toEqual([])
  })

  it('refuses a thread the reader cannot see, a reply, and a non-timestamp', async () => {
    expect((await mark(DAVE, 'ae-hidden-root', '2026-10-09 10:00:00')).status).toBe(404)
    expect((await mark(DAVE, 'ae-reply', '2026-10-09 10:00:00')).status).toBe(404)
    expect((await mark(DAVE, 'ae-root', 'yesterday')).status).toBe(400)
    expect(db.prepare('SELECT COUNT(*) AS n FROM activity_thread_seen').get()).toEqual({ n: 0 })
  })

  it('goes with its thread (FK cascade)', async () => {
    await mark(DAVE, 'ae-root', '2026-10-09 10:00:00')
    db.prepare("DELETE FROM activity_entries WHERE id IN ('ae-reply', 'ae-root')").run()
    expect(db.prepare('SELECT COUNT(*) AS n FROM activity_thread_seen').get()).toEqual({ n: 0 })
  })
})
