// viewer-sweep.test.ts -- #145 Lane A, driven through the REAL worker.
//
// The enumerator is ROUTE_REGISTRY itself, not a list of routes someone
// remembered: every registered route runs through worker.fetch (the full
// middleware stack, so env.DB is the viewer-bound handle) on the migrated
// schema.
//
//   read sweep   Casey is a signed-in member, not a PI. A sentinel meeting she
//                is not on carries SWEEPMARKZ in every column a reader could
//                return, and so do its agenda item, decision, activity entry,
//                file and activity_log row; a pb_session activity_log row
//                carries it too. Every GET, with every :param filled by each
//                sentinel id in turn, must answer without the marker.
//   write sweep  Every non-GET route, aimed at the same ids with a body that
//                names the hidden meeting in every field a handler might read,
//                must leave every row that belongs to the hidden meeting
//                exactly as it was, and add none.
//   controls     the marker IS reachable: Casey reads her own meeting's
//                content, and the PB key and Nick read the sentinel.
//   cron         the Pulse email is built per recipient.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { ROUTE_REGISTRY } from '../lib/route-dsl'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { ctToday } from '../lib/ct-date'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'viewer-sweep-api-key'
const MARK = 'SWEEPMARKZ'
const PI_EMAIL = 'ingra107@umn.edu'
const CASEY_EMAIL = 'eddin022@umn.edu'
const TODAY = ctToday()

const HIDDEN = 'mtg-sweep-hidden'
const MINE = 'mtg-sweep-mine'
const AGENDA = 'ag-sweep-hidden'
const DECISION = 'dec-sweep-hidden'
const ENTRY = 'ae-sweep-hidden'
const FILE_ID = 'file-sweep-hidden'
const FILE_KEY = `meeting/${HIDDEN}/file.pdf`
const FILLS = [HIDDEN, AGENDA, DECISION, ENTRY, FILE_ID, 'sweep-none']

let db: InstanceType<typeof Database>
let env: Env

function seed() {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', member_type: 'director', email: 'mesfin@umn.edu' })
  // The hidden meeting: Nick's, Nate on it, Casey not; same day as hers.
  insertRow(db, 'meetings', {
    id: HIDDEN, date: TODAY, title: `${MARK} title`, type: `${MARK}`, notes: `${MARK} notes`, agenda: `${MARK} agenda`,
    decisions: `${MARK} decisions`, tags: JSON.stringify([`${MARK}-tag`, 'casey-eddington']), status: 'upcoming',
    attendees: JSON.stringify(['nate-mesfin', 'mesfin@umn.edu']), facilitator: 'casey-eddington',
    source_id: 'cal-sweep-src', owner_slug: 'nick-ingraham',
  })
  insertRow(db, 'meetings', {
    id: MINE, date: TODAY, title: 'VISIBLEMARK title', notes: 'VISIBLEMARK notes', owner_slug: 'nick-ingraham',
    attendees: JSON.stringify(['casey-eddington']),
  })
  insertRow(db, 'agenda_items', { id: AGENDA, meeting_id: HIDDEN, content: `${MARK} agenda item`, added_by: PI_EMAIL })
  insertRow(db, 'hub_decisions', { id: DECISION, title: `${MARK} decision`, rationale: `${MARK}`, meeting_id: HIDDEN })
  insertRow(db, 'activity_entries', {
    id: ENTRY, entity_type: 'meeting', entity_id: HIDDEN, kind: 'comment', visibility: 'team', actor_slug: 'nate-mesfin', body: `${MARK} comment`,
  })
  insertRow(db, 'file_attachments', { id: FILE_ID, entity_type: 'meeting', entity_id: HIDDEN, filename: `${MARK}.pdf`, r2_key: FILE_KEY, uploaded_by: 'nate-mesfin' })
  insertRow(db, 'activity_log', { id: 'log-sweep-mtg', type: 'meeting', description: `${MARK} created`, actor: 'nick-ingraham', related_id: HIDDEN, related_type: 'meeting' })
  insertRow(db, 'activity_log', { id: 'log-sweep-pb', type: 'pb_session', description: `${MARK} PB session`, actor: 'nick-ingraham' })
  insertRow(db, 'activity_log', { id: 'log-sweep-sync', type: 'sync', description: `${MARK} sync` })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
}

async function call(method: string, path: string, who: 'apikey' | string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  return { status: res.status, text: await res.text() }
}

function fill(path: string, id: string): string {
  return path.replace(':rest{.+}', id === HIDDEN ? FILE_KEY : id).replace(/:[A-Za-z_]+/g, encodeURIComponent(id))
}

const QUERY = (id: string) => `?id=${id}&meeting_id=${id}&entity_type=meeting&entity_id=${id}&q=SWEEP&query=SWEEP`
  + `&limit=500&days=3650&start=2000-01-01&end=2999-12-31&date=${TODAY}&include_hidden=1&include_fixtures=1`

const hiddenRows = () => JSON.stringify([
  // The hidden row, plus any same-titled row that is not Casey's own: her POST
  // with the hidden meeting's title rightly makes HER meeting; a write into
  // anyone else's is the leak.
  db.prepare("SELECT * FROM meetings WHERE id = ? OR (date = ? AND title LIKE ? AND COALESCE(owner_slug, '') <> 'casey-eddington') ORDER BY id").all(HIDDEN, TODAY, `%${MARK}%`),
  db.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY id').all(HIDDEN),
  db.prepare('SELECT * FROM hub_decisions WHERE meeting_id IN (?, ?) ORDER BY id').all(HIDDEN, 'cal-sweep-src'),
  db.prepare("SELECT * FROM activity_entries WHERE (entity_type = 'meeting' AND entity_id = ?) OR id = ? OR parent_id = ? ORDER BY id").all(HIDDEN, ENTRY, ENTRY),
  db.prepare("SELECT * FROM file_attachments WHERE (entity_type = 'meeting' AND entity_id = ?) OR id = ? ORDER BY id").all(HIDDEN, FILE_ID),
  db.prepare("SELECT id, type, description, related_id FROM activity_log WHERE related_id = ? AND related_type = 'meeting' ORDER BY id").all(HIDDEN),
])

beforeEach(() => {
  seed()
  // No handler may reach the network from a test; anything that tries gets a 503.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('read sweep: a member who is not on a meeting reads nothing of it, on any route', () => {
  it('every GET in ROUTE_REGISTRY, every :param filled with each sentinel id', async () => {
    const gets = ROUTE_REGISTRY.filter((r) => r.method === 'GET')
    expect(gets.length, 'the registry must be populated, or this sweep proves nothing').toBeGreaterThan(100)
    const leaks: string[] = []
    let answered = 0
    for (const route of gets) {
      const fills = route.path.includes(':') ? FILLS : ['']
      for (const id of fills) {
        const path = fill(route.path, id) + QUERY(id || HIDDEN)
        const r = await call('GET', path, CASEY_EMAIL)
        if (r.status === 200) answered++
        if (r.text.toUpperCase().includes(MARK)) leaks.push(`GET ${route.path} [${id}] ${r.status}: ${r.text.slice(0, 160)}`)
      }
    }
    expect(leaks).toEqual([])
    expect(answered, 'most reads must actually answer 200, or the sweep is reading error pages').toBeGreaterThan(150)
  }, 120_000)

  it('controls: Casey reads her own meeting; the PB key and Nick read the hidden one', async () => {
    const mine = await call('GET', '/api/meetings', CASEY_EMAIL)
    expect(mine.status).toBe(200)
    expect(mine.text).toContain('VISIBLEMARK')
    expect(mine.text).not.toContain(MARK)
    const detail = await call('GET', `/api/meetings/${MINE}`, CASEY_EMAIL)
    expect(detail.text).toContain('VISIBLEMARK notes')
    expect((await call('GET', `/api/meetings/${HIDDEN}`, CASEY_EMAIL)).status).toBe(404)
    for (const who of ['apikey', PI_EMAIL]) {
      const all = await call('GET', '/api/meetings', who)
      expect(all.text, who).toContain(`${MARK} title`)
      const act = await call('GET', '/api/activity?limit=500&include_fixtures=1', who)
      expect(act.text, who).toContain(`${MARK} PB session`)
    }
  })

  it('an anonymous caller and a signed-in non-member read no marker from any public GET (the nobody viewer)', async () => {
    const leaks: string[] = []
    for (const route of ROUTE_REGISTRY.filter((r) => r.method === 'GET' && r.auth === 'public')) {
      for (const who of ['anon', 'stranger@umn.edu']) {
        const headers: Record<string, string> = who === 'anon' ? {} : { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who }
        const res = await worker.fetch(new Request(`https://hub.test${fill(route.path, HIDDEN)}${QUERY(HIDDEN)}`, { headers }), env, CTX)
        const text = await res.text()
        if (text.toUpperCase().includes(MARK)) leaks.push(`${who} GET ${route.path} ${res.status}`)
      }
    }
    expect(leaks).toEqual([])
  })

  it('Nate, who is on the hidden meeting by slug, reads it and its children', async () => {
    const r = await call('GET', `/api/meetings/${HIDDEN}`, 'mesfin@umn.edu')
    expect(r.status).toBe(200)
    expect(r.text).toContain(`${MARK} agenda item`)
    const files = await call('GET', `/api/files?entity_type=meeting&entity_id=${HIDDEN}`, 'mesfin@umn.edu')
    expect(files.text).toContain(`${MARK}.pdf`)
  })
})

describe('write sweep: no write route changes or adds a row of a meeting the caller cannot see', () => {
  it('every non-GET in ROUTE_REGISTRY, aimed at each sentinel id', async () => {
    let before = hiddenRows()
    const writes = ROUTE_REGISTRY.filter((r) => r.method !== 'GET')
    expect(writes.length).toBeGreaterThan(100)
    const body = (id: string) => ({
      // The hidden meeting's own date + title: under the pre-#145 dedup this
      // POST /api/meetings answered with (and wrote into) Nick's row.
      date: TODAY, title: `${MARK} title`, notes: 'sweep notes', decisions: 'sweep', tags: ['sweep'],
      attendees: ['casey-eddington'], type: 'sweep', facilitator: 'casey-eddington', source_id: 'cal-sweep-src',
      content: 'sweep', body: 'sweep', hidden: true, ids: [AGENDA], status: 'done',
      meeting_id: HIDDEN, entity_type: 'meeting', entity_id: HIDDEN, entityType: 'meeting', entityId: HIDDEN,
      key: FILE_KEY, filename: 'f.pdf', contentType: 'application/pdf', sizeBytes: 1, context: { type: 'meeting', id: HIDDEN },
      parent_id: ENTRY, id, uid: 'x', start_at: TODAY, day: TODAY, rationale: 'sweep',
    })
    const changed: string[] = []
    for (const route of writes) {
      const fills = route.path.includes(':') ? FILLS : ['']
      for (const id of fills) {
        await call(route.method, fill(route.path, id), CASEY_EMAIL, body(id || HIDDEN))
        const now = hiddenRows()
        if (now !== before) {
          const a = JSON.parse(before) as unknown[]
          const b = JSON.parse(now) as unknown[]
          const parts = ['meetings', 'agenda_items', 'hub_decisions', 'activity_entries', 'file_attachments', 'activity_log']
            .filter((_, k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
          changed.push(`${route.method} ${route.path} [${id}] changed ${parts.join(',')}: ${JSON.stringify(b[parts.length ? ['meetings', 'agenda_items', 'hub_decisions', 'activity_entries', 'file_attachments', 'activity_log'].indexOf(parts[0]) : 0]).slice(0, 300)}`)
          seed() // reset so one leak does not mask the next
          before = hiddenRows()
        }
      }
    }
    expect(changed).toEqual([])
  }, 180_000)

  it('the meeting write handlers answer 404 on the hidden meeting', async () => {
    expect((await call('POST', `/api/meetings/${HIDDEN}/notes`, CASEY_EMAIL, { notes: 'x' })).status).toBe(404)
    expect((await call('POST', `/api/meetings/${HIDDEN}/meta`, CASEY_EMAIL, { title: 'x' })).status).toBe(404)
    expect((await call('POST', `/api/meetings/${HIDDEN}/agenda`, CASEY_EMAIL, { content: 'x' })).status).toBe(404)
    expect((await call('POST', '/api/decisions', CASEY_EMAIL, { title: 'x', meeting_id: HIDDEN })).status).toBe(404)
  })

  it("Casey's POST with the hidden meeting's date and title makes her own row and never returns Nick's", async () => {
    const r = await call('POST', '/api/meetings', CASEY_EMAIL, { date: TODAY, title: `${MARK} title`, notes: 'mine' })
    expect(r.status).toBe(201)
    expect(r.text).not.toContain(`${MARK} notes`)
    const rows = db.prepare('SELECT owner_slug, notes FROM meetings WHERE date = ? AND title = ? ORDER BY owner_slug').all(TODAY, `${MARK} title`)
    expect(rows).toEqual([{ owner_slug: 'casey-eddington', notes: 'mine' }, { owner_slug: 'nick-ingraham', notes: `${MARK} notes` }])
  })
})

describe('Pulse cron: each email is built on its recipient\'s handle', () => {
  it("a member's email carries no Peripheral Brain project update; the PI's does", async () => {
    insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-proj', title: 'PB', category: 'Peripheral Brain', status: 'active', stage: 'writing' })
    insertRow(db, 'projects', { id: 'proj_team', slug: 'team-proj', title: 'Team', category: 'MNCCORE', status: 'active', stage: 'writing' })
    insertRow(db, 'activity_entries', { id: 'ae-pb', entity_type: 'project', entity_id: 'proj_pb', project_id: 'proj_pb', kind: 'update', actor_slug: 'nate-mesfin', body: 'PBUPDATEMARK' })
    insertRow(db, 'activity_entries', { id: 'ae-team', entity_type: 'project', entity_id: 'proj_team', project_id: 'proj_team', kind: 'update', actor_slug: 'nate-mesfin', body: 'TEAMUPDATEMARK' })
    const sent: { to: string; html: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body)) as { personalizations: { to: { email: string }[] }[]; content: { value: string }[] }
      sent.push({ to: b.personalizations[0].to[0].email, html: b.content[0].value })
      return new Response('', { status: 202 })
    }))
    await worker.scheduled({ cron: '0 13 * * 1-5' } as ScheduledEvent, { ...env, SENDGRID_API_KEY: 'k' } as Env, CTX)
    const casey = sent.find((s) => s.to === CASEY_EMAIL)
    const nick = sent.find((s) => s.to === PI_EMAIL)
    expect(casey?.html).toContain('TEAMUPDATEMARK')
    expect(casey?.html).not.toContain('PBUPDATEMARK')
    expect(nick?.html).toContain('PBUPDATEMARK')
  })
})
