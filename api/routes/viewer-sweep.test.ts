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
// Lane B sentinels. PROJ: Nick and Nate are members, Casey is not. TASK sits
// in it, assigned to Nate. NATE_ONLY / NICK_ONLY have one member each.
// CASEY_PROJ is Casey's own (the control).
const PROJ = 'proj_sweephidden'
const PROJ_SLUG = 'sweep-hidden-proj'
const TASK = 'task_sweephidden'
const TASK_ENTRY = 'ae-sweep-task'
const PROJ_ENTRY = 'ae-sweep-proj'
const PROJ_FILE = 'file-sweep-proj'
const REVISION = 'rev-sweep-hidden'
const QUESTION = 'lq-sweep-hidden'
const ARTIFACT = 'art-sweep-hidden'
const NATE_ONLY = 'proj_nateonly'
const NICK_ONLY = 'proj_nickonly'
const CASEY_PROJ = 'proj_caseyown'
const LOOSE = 'task_sweeploose' // Nick's own project-less task
const FILLS = [HIDDEN, AGENDA, DECISION, ENTRY, FILE_ID, PROJ, PROJ_SLUG, TASK, TASK_ENTRY, PROJ_ENTRY, PROJ_FILE, REVISION, QUESTION, ARTIFACT, LOOSE, 'cm-sweep', 'sweep-none']

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
  seedLaneB()
  env ={ DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
}

const member = (project_id: string, member_slug: string) =>
  insertRow(db, 'project_members', { project_id, member_slug, added_by: 'test' })

function seedLaneB() {
  const proj = (id: string, slug: string, title: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'projects', { id, slug, title, description: title, category: 'MNCCORE', status: 'active', stage: 'writing', ...extra })
  proj(PROJ, PROJ_SLUG, `${MARK} project`, { next_action: `${MARK} next`, stage_notes: `${MARK}` })
  member(PROJ, 'nick-ingraham')
  member(PROJ, 'nate-mesfin')
  proj(NATE_ONLY, 'nate-only', 'NATEONLYMARK project')
  member(NATE_ONLY, 'nate-mesfin')
  proj(NICK_ONLY, 'nick-only', 'NICKONLYMARK project')
  member(NICK_ONLY, 'nick-ingraham')
  proj(CASEY_PROJ, 'casey-own', 'CASEYPROJMARK project')
  member(CASEY_PROJ, 'casey-eddington')
  member(CASEY_PROJ, 'nick-ingraham')
  insertRow(db, 'tasks', {
    id: TASK, project_id: PROJ, title: `${MARK} task`, description: `${MARK} body`, assignee: 'nate-mesfin',
    assigned_by: PI_EMAIL, notes: `${MARK}`, watchers: JSON.stringify(['nick-ingraham']), meeting_id: HIDDEN,
  })
  insertRow(db, 'tasks', { id: 'task_natesown', project_id: NATE_ONLY, title: 'NATEONLYMARK task', assignee: 'nate-mesfin' })
  insertRow(db, 'tasks', { id: 'task_nicksown', project_id: NICK_ONLY, title: 'NICKONLYMARK task', assignee: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_caseyown', project_id: CASEY_PROJ, title: 'CASEYTASKMARK task', assignee: 'casey-eddington' })
  insertRow(db, 'tasks', { id: LOOSE, title: `${MARK} loose task`, description: `${MARK}`, assignee: 'nick-ingraham', assigned_by: PI_EMAIL })
  insertRow(db, 'activity_entries', { id: TASK_ENTRY, entity_type: 'task', entity_id: TASK, project_id: PROJ, kind: 'comment', actor_slug: 'nate-mesfin', body: `${MARK} task comment` })
  insertRow(db, 'activity_entries', { id: PROJ_ENTRY, entity_type: 'project', entity_id: PROJ, project_id: PROJ, kind: 'update', actor_slug: 'nate-mesfin', body: `${MARK} project update` })
  insertRow(db, 'activity_entries', { id: 'ae-sweep-loose', entity_type: 'task', entity_id: LOOSE, kind: 'comment', actor_slug: 'nick-ingraham', body: `${MARK} loose comment` })
  insertRow(db, 'reactions', { id: 'rx-sweep', target_type: 'comment', target_id: TASK_ENTRY, user_slug: 'nate-mesfin', emoji: MARK })
  insertRow(db, 'file_attachments', { id: PROJ_FILE, entity_type: 'project', entity_id: PROJ, filename: `${MARK}-proj.pdf`, r2_key: `project/${PROJ}/f.pdf`, uploaded_by: 'nate-mesfin' })
  insertRow(db, 'file_attachments', { id: 'file-sweep-task', entity_type: 'task', entity_id: TASK, filename: `${MARK}-task.pdf`, r2_key: `task/${TASK}/f.pdf`, uploaded_by: 'nate-mesfin' })
  insertRow(db, 'activity_log', { id: 'log-sweep-proj', type: 'project', description: `${MARK} project log`, actor: 'nate-mesfin', related_id: PROJ, related_type: 'project' })
  insertRow(db, 'activity_log', { id: 'log-sweep-task', type: 'task', description: `${MARK} task log`, actor: 'nate-mesfin', related_id: TASK, related_type: 'task' })
  insertRow(db, 'task_subtasks', { id: 'st-sweep', task_id: TASK, title: `${MARK} subtask` })
  insertRow(db, 'task_files', { id: 'tf-sweep', task_id: TASK, filename: `${MARK} file`, url: 'https://x.test/a' })
  insertRow(db, 'task_handoffs', { id: 'th-sweep', task_id: TASK, from_slug: 'nate-mesfin', to_slug: 'nick-ingraham', situation: `${MARK} handoff` })
  insertRow(db, 'links', { id: 'lnk-sweep-task', owner_table: 'tasks', owner_id: TASK, type: 'doc', canonical_url: 'https://x.test/t', short_title: `${MARK} link` })
  insertRow(db, 'links', { id: 'lnk-sweep-proj', owner_table: 'projects', owner_id: PROJ, type: 'doc', canonical_url: 'https://x.test/p', short_title: `${MARK} plink` })
  insertRow(db, 'milestones', { id: 'ms-sweep', project_id: PROJ, title: `${MARK} milestone`, target_date: TODAY })
  insertRow(db, 'project_documents', { id: 'pd-sweep', project_id: PROJ, title: `${MARK} doc`, url: 'https://x.test/d' })
  insertRow(db, 'regulatory_items', { id: 'reg-sweep', project_id: PROJ, item_type: 'irb', title: `${MARK} irb`, renewal_due: TODAY, expiration_date: TODAY })
  insertRow(db, 'manuscript_revisions', { id: REVISION, project_id: PROJ, journal: `${MARK} journal`, notes: `${MARK}` })
  insertRow(db, 'reviewer_comments', { id: 'rc-sweep', revision_id: REVISION, comment_text: `${MARK} reviewer` })
  insertRow(db, 'submission_events', { id: 'se-sweep', project_id: PROJ, event_type: 'submitted', event_date: TODAY, journal: `${MARK}` })
  insertRow(db, 'conference_submissions', { id: 'cs-sweep', project_id: PROJ, conference: `${MARK} conf`, submission_type: 'abstract', title: `${MARK} abstract` })
  insertRow(db, 'ideas', { id: 'idea-sweep', title: `${MARK} idea`, submitted_by: 'nate-mesfin', project_id: PROJ })
  insertRow(db, 'inbox', { id: 'inbox-sweep', text: `${MARK} inbox`, project_id: PROJ, author: 'nate-mesfin' })
  insertRow(db, 'contributions', { id: 'contrib-sweep', member_slug: 'nate-mesfin', type: 'analysis', description: `${MARK} contrib`, project_slug: PROJ_SLUG })
  insertRow(db, 'lab_questions', { id: QUESTION, question: `${MARK} question`, asked_by: 'nate-mesfin', project_slug: PROJ_SLUG })
  insertRow(db, 'lab_answers', { id: 'la-sweep', question_id: QUESTION, content: `${MARK} answer`, author_slug: 'nate-mesfin' })
  insertRow(db, 'hub_decisions', { id: 'dec-sweep-proj', title: `${MARK} proj decision`, project_slug: PROJ_SLUG })
  insertRow(db, 'artifacts', { id: ARTIFACT, title: `${MARK} artifact`, body_md: `${MARK}`, task_id: TASK, project_id: PROJ, created_by: 'nate-mesfin' })
  insertRow(db, 'commitments', { id: 'cm-sweep', commitment: `${MARK} commitment`, to_whom: 'x', project: PROJ, task_id: TASK })
  insertRow(db, 'ai_requests', { id: 'ai-sweep', source_type: 'task', source_id: TASK, project_slug: PROJ_SLUG, prompt: `${MARK} prompt`, response: `${MARK}` })
  insertRow(db, 'project_state_log', { project_id: PROJ, new_state: 'active', reason: `${MARK} state` })
  insertRow(db, 'file_activity_daily', { id: 'fad-sweep', date: TODAY, project_id: PROJ, project_name: `${MARK} name`, file_count: 1 })
  insertRow(db, 'hub_pomodoro_slots', { id: 'pom-sweep', task_id: TASK, plan_date: TODAY, slot_type: `${MARK}`, started_at: TODAY })
  // PB-internal tables stay lab (PI-gated routes): a leak here shows the route is not.
  insertRow(db, 'dispatch_queue', { id: 'dq-sweep', task_id: TASK, task_title: `${MARK} dq`, comment: `${MARK}` })
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
  return { status: res.status, text: await res.text() }
}

function fill(path: string, id: string): string {
  return path.replace(':rest{.+}', id === HIDDEN ? FILE_KEY : id).replace(/:[A-Za-z_]+/g, encodeURIComponent(id))
}

const entityTypeOf = (id: string) => (id.startsWith('proj') || id === PROJ_SLUG ? 'project' : id.startsWith('task') ? 'task' : 'meeting')
const QUERY = (id: string) => `?id=${id}&meeting_id=${id}&entity_type=${entityTypeOf(id)}&entity_id=${id}&q=SWEEP&query=SWEEP`
  + `&project_id=${id}&project=${id}&project_slug=${id}&slug=${id}&task_id=${id}&target_type=comment&target_id=${TASK_ENTRY}`
  + `&owner_table=${id.startsWith('task') ? 'tasks' : 'projects'}&owner_id=${id}&revision_id=${REVISION}&question_id=${QUESTION}`
  + `&limit=500&days=3650&start=2000-01-01&end=2999-12-31&date=${TODAY}&include_hidden=1&include_fixtures=1&include_deleted=1&status=all`

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
  // Lane B: the hidden project, its members, its tasks and everything under them.
  db.prepare('SELECT * FROM projects WHERE id IN (?, ?) OR slug = ? ORDER BY id').all(PROJ, NICK_ONLY, PROJ_SLUG),
  db.prepare('SELECT project_id, member_slug FROM project_members WHERE project_id IN (?, ?) ORDER BY 1, 2').all(PROJ, NICK_ONLY),
  db.prepare('SELECT * FROM tasks WHERE id IN (?, ?) OR project_id IN (?, ?) ORDER BY id').all(TASK, LOOSE, PROJ, PROJ_SLUG),
  db.prepare("SELECT * FROM activity_entries WHERE (entity_type IN ('task','project') AND entity_id IN (?, ?, ?)) OR project_id = ? OR parent_id IN (?, ?) ORDER BY id").all(TASK, PROJ, LOOSE, PROJ, TASK_ENTRY, PROJ_ENTRY),
  ...([
    ['task_subtasks', 'task_id', TASK], ['task_files', 'task_id', TASK], ['task_handoffs', 'task_id', TASK],
    ['hub_pomodoro_slots', 'task_id', TASK], ['commitments', 'task_id', TASK], ['artifacts', 'task_id', TASK],
    ['milestones', 'project_id', PROJ], ['project_documents', 'project_id', PROJ], ['regulatory_items', 'project_id', PROJ],
    ['manuscript_revisions', 'project_id', PROJ], ['submission_events', 'project_id', PROJ],
    ['conference_submissions', 'project_id', PROJ], ['ideas', 'project_id', PROJ], ['inbox', 'project_id', PROJ],
    ['contributions', 'project_slug', PROJ_SLUG], ['lab_questions', 'project_slug', PROJ_SLUG], ['hub_decisions', 'project_slug', PROJ_SLUG],
    ['reviewer_comments', 'revision_id', REVISION], ['lab_answers', 'question_id', QUESTION], ['reactions', 'target_id', TASK_ENTRY],
    ['links', 'owner_id', TASK], ['links', 'owner_id', PROJ], ['file_attachments', 'entity_id', PROJ], ['file_attachments', 'entity_id', TASK],
    ['project_state_log', 'project_id', PROJ], ['file_activity_daily', 'project_id', PROJ], ['ai_requests', 'project_slug', PROJ_SLUG],
  ] as const).map(([t, col, v]) => db.prepare(`SELECT * FROM ${t} WHERE ${col} = ? ORDER BY 1`).all(v)),
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
      // Lane B: name the hidden project and task in every field a handler might read.
      project_id: PROJ, project_slug: PROJ_SLUG, project: PROJ, task_id: TASK, slug: 'casey-eddington',
      assignee: 'casey-eddington', revision_id: REVISION, question_id: QUESTION, target_type: 'comment', target_id: TASK_ENTRY,
      owner_table: 'tasks', owner_id: TASK, url: 'https://x.test/sweep', emoji: 'x', situation: 'sweep',
      from_project_id: CASEY_PROJ, to_project_id: PROJ, commitment: 'sweep', to_whom: 'x',
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
          const diff = a.map((_, k) => k).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
          changed.push(`${route.method} ${route.path} [${id}] changed section(s) ${diff.join(',')}: ${JSON.stringify(b[diff[0] ?? 0]).slice(0, 300)}`)
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

describe('Lane B: projects are channels, membership is the one default rule', () => {
  const ALL = { 'X-Hub-All-Projects': '1' }
  const texts = async (who: string, extra: Record<string, string> = {}) =>
    (await Promise.all(['/api/projects', '/api/tasks?limit=500', '/api/activity?limit=500'].map((p) => call('GET', p, who, undefined, extra))))
      .map((r) => r.text).join('\n')

  it('Casey (not on the project) reads none of its tasks, comments or activity; her own project she reads', async () => {
    const t = await texts(CASEY_EMAIL)
    expect(t.toUpperCase()).not.toContain(MARK)
    expect(t).toContain('CASEYPROJMARK')
    expect(t).toContain('CASEYTASKMARK')
    for (const p of [`/api/projects/${PROJ}`, `/api/tasks/${TASK}`, `/api/projects/${PROJ}/members`]) {
      const r = await call('GET', p, CASEY_EMAIL)
      expect([403, 404], p).toContain(r.status)
    }
  })

  it('Nick without the switch does not see a project he is not on; with it on he does; his own he always does', async () => {
    const off = await texts(PI_EMAIL)
    expect(off).not.toContain('NATEONLYMARK')
    expect(off).toContain('NICKONLYMARK')
    expect(off).toContain(`${MARK} loose task`) // his project-less task, as assignee
    expect((await call('GET', `/api/projects/${NATE_ONLY}`, PI_EMAIL)).status).not.toBe(200)
    const on = await texts(PI_EMAIL, ALL)
    expect(on).toContain('NATEONLYMARK project')
    expect(on).toContain('NATEONLYMARK task')
    expect((await call('GET', `/api/projects/${NATE_ONLY}`, PI_EMAIL, undefined, ALL)).status).toBe(200)
  })

  it('the switch is server-side and Nick-only: Nate and Casey sending it see nothing more', async () => {
    expect(await texts('mesfin@umn.edu', ALL)).not.toContain('NICKONLYMARK')
    expect(await texts(CASEY_EMAIL, ALL)).not.toContain('NATEONLYMARK')
    const me = JSON.parse((await call('GET', '/api/auth/me', PI_EMAIL)).text) as { canShowAllProjects: boolean }
    expect(me.canShowAllProjects).toBe(true)
    const nate = JSON.parse((await call('GET', '/api/auth/me', 'mesfin@umn.edu')).text) as { canShowAllProjects: boolean }
    expect(nate.canShowAllProjects).toBe(false)
  })

  it('Nate does not see Nick-only projects; he sees the one he is on', async () => {
    const t = await texts('mesfin@umn.edu')
    expect(t).not.toContain('NICKONLYMARK')
    expect(t).toContain(`${MARK} project`)
    expect(t).toContain('NATEONLYMARK')
  })

  it('the PB key sees everything, switch or not', async () => {
    const t = await texts('apikey')
    for (const m of [`${MARK} project`, 'NATEONLYMARK', 'NICKONLYMARK', 'CASEYPROJMARK', `${MARK} task`]) expect(t).toContain(m)
  })

  it('a project Nate creates alone is his alone (and Nick\'s only with the switch)', async () => {
    const r = await call('POST', '/api/projects', 'mesfin@umn.edu', { title: 'NATENEWMARK study' })
    expect(r.status).toBe(201)
    const id = (JSON.parse(r.text) as { data: { id: string } }).data.id
    expect(db.prepare('SELECT member_slug, added_by FROM project_members WHERE project_id = ?').all(id))
      .toEqual([{ member_slug: 'nate-mesfin', added_by: 'pi' }]) // pi defaults to the creator; the pi trigger lands first
    expect(await texts('mesfin@umn.edu')).toContain('NATENEWMARK')
    expect(await texts(PI_EMAIL)).not.toContain('NATENEWMARK')
    expect(await texts(CASEY_EMAIL)).not.toContain('NATENEWMARK')
    expect(await texts(PI_EMAIL, ALL)).toContain('NATENEWMARK')
  })

  it('a project the PB key creates is Nick\'s', async () => {
    const r = await call('POST', '/api/projects', 'apikey', { title: 'PBNEWMARK project' })
    expect(r.status).toBe(201)
    expect(await texts(PI_EMAIL)).toContain('PBNEWMARK')
  })

  it('a slug taken by a project Casey cannot see gets the next suffix, not a 409', async () => {
    const r = await call('POST', '/api/projects', CASEY_EMAIL, { title: 'x', slug: PROJ_SLUG })
    expect(r.status).toBe(201)
    expect((JSON.parse(r.text) as { data: { slug: string } }).data.slug).toBe(`${PROJ_SLUG}-2`)
    expect(r.text.toUpperCase()).not.toContain(MARK)
  })

  it('assigning Casey a task joins him to the project, and then he reads it', async () => {
    const r = await call('POST', '/api/tasks', PI_EMAIL, { title: 'casey joins', description: 'casey joins', project_id: PROJ, assignee: 'casey-eddington' })
    expect([200, 201]).toContain(r.status)
    expect(db.prepare('SELECT added_by FROM project_members WHERE project_id = ? AND member_slug = ?').get(PROJ, 'casey-eddington'))
      .toEqual({ added_by: 'assignment' })
    expect(await texts(CASEY_EMAIL)).toContain(`${MARK} task`)
    // Reassigning an existing task joins too (the UPDATE trigger).
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND member_slug = ?').run(NICK_ONLY, 'casey-eddington')
    db.prepare("UPDATE tasks SET assignee = 'casey-eddington' WHERE id = 'task_nicksown'").run()
    expect(db.prepare('SELECT 1 AS x FROM project_members WHERE project_id = ? AND member_slug = ?').get(NICK_ONLY, 'casey-eddington')).toEqual({ x: 1 })
  })

  it('an unknown assignee does not join anyone and does not roll back the task write', async () => {
    insertRow(db, 'tasks', { id: 'task_unknown', project_id: PROJ, title: 'unknown assignee', assignee: 'not_a_real_person' })
    expect(db.prepare("SELECT 1 AS x FROM tasks WHERE id = 'task_unknown'").get()).toEqual({ x: 1 })
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_members WHERE member_slug = 'not_a_real_person'").get()).toEqual({ n: 0 })
  })

  it('a task in a Peripheral Brain project does not join its assignee', async () => {
    insertRow(db, 'projects', { id: 'proj_pbx', slug: 'pbx', title: 'PB', category: 'Peripheral Brain', status: 'active', stage: 'idea' })
    insertRow(db, 'tasks', { id: 'task_pbx', project_id: 'proj_pbx', title: 'pb task', assignee: 'casey-eddington' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_members WHERE project_id = 'proj_pbx'").get()).toEqual({ n: 0 })
  })

  it("a project-less task titled like one Casey cannot see is refused cleanly, never adopted, never a 500", async () => {
    const before = JSON.stringify(db.prepare('SELECT * FROM tasks WHERE id = ?').get(LOOSE))
    const r = await call('POST', '/api/tasks', CASEY_EMAIL, { title: `${MARK} loose task`, description: 'mine', assignee: 'casey-eddington' })
    // The title index is lab-wide for project-less tasks; Nick's row is hidden
    // from Casey, so the INSERT is refused (409) instead of adopting his task
    // (the pre-#145 dedup answered with Nick's row). See RULINGS in the lane report.
    expect(r.status, r.text).toBe(409)
    expect(r.text.toUpperCase()).not.toContain(MARK)
    expect(JSON.stringify(db.prepare('SELECT * FROM tasks WHERE id = ?').get(LOOSE))).toBe(before)
  })

  it('members: a member adds, a non-member cannot see the list, only a PI or the member removes', async () => {
    const list = await call('GET', `/api/projects/${PROJ}/members`, 'mesfin@umn.edu')
    expect(list.status).toBe(200)
    expect(JSON.parse(list.text).data.map((m: { slug: string }) => m.slug).sort()).toEqual(['nate-mesfin', 'nick-ingraham'])
    expect((await call('POST', `/api/projects/${PROJ}/members`, CASEY_EMAIL, { slug: 'casey-eddington' })).status).toBe(404)
    const add = await call('POST', `/api/projects/${PROJ}/members`, 'mesfin@umn.edu', { slug: 'casey-eddington' })
    expect(add.status).toBe(201)
    expect((await call('POST', `/api/projects/${PROJ}/members`, 'mesfin@umn.edu', { slug: 'nobody-here' })).status).toBe(400)
    // Casey (now a member, not a PI) cannot remove Nate; he can remove himself; Nick (PI) can remove anyone.
    expect((await call('DELETE', `/api/projects/${PROJ}/members/nate-mesfin`, CASEY_EMAIL)).status).toBe(403)
    expect((await call('DELETE', `/api/projects/${PROJ}/members/casey-eddington`, CASEY_EMAIL)).status).toBe(200)
    expect((await call('GET', `/api/projects/${PROJ}`, CASEY_EMAIL)).status).not.toBe(200)
    expect((await call('DELETE', `/api/projects/${PROJ}/members/nate-mesfin`, PI_EMAIL)).status).toBe(200)
    const projects = JSON.parse((await call('GET', '/api/team/nate-mesfin/projects', CASEY_EMAIL)).text).data
    expect(projects).toEqual([]) // Casey sees none of Nate's projects
  })
})

describe('Pulse cron: each email is built on its recipient\'s handle', () => {
  it("a member's email carries no Peripheral Brain project update; the PI's does", async () => {
    insertRow(db, 'projects', { id: 'proj_pb', slug: 'pb-proj', title: 'PB', category: 'Peripheral Brain', status: 'active', stage: 'writing' })
    insertRow(db, 'projects', { id: 'proj_team', slug: 'team-proj', title: 'Team', category: 'MNCCORE', status: 'active', stage: 'writing' })
    member('proj_pb', 'nick-ingraham')
    member('proj_team', 'nick-ingraham')
    member('proj_team', 'casey-eddington')
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
