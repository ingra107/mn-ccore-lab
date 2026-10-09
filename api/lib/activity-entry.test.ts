// activity-entry.test.ts — contract tests for the unified-timeline write
// primitive (postActivityEntry) + read projections (Design C, schema-v77).
//
// Covers:
//   - @me prefix strips + visibility gate (author sees own, other doesn't, API-key/PI sees all)
//   - kind / update_type validation rejects
//   - idempotent re-insert returns existing (no dup)
//   - projection shapes match the old endpoint field names byte-for-byte
//   - task delete cascade removes activity_entries rows
//   - Hermes placeholder lands as an activity entry
//   - project feed includes task rows by project_id
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The old fixture was a ~430-line SQL interpreter: it matched each statement
// by regex, re-implemented the visibility gate, the feed filters, the thread
// transcript, the hide cascade and the delete cascades in JS, and answered
// every unmatched read with null. Its own comments record that a transcript
// query once fell through to the empty default and every transcript assertion
// passed against zero rows. Now every handler runs its real SQL against real
// rows (activity_entries with its partial UNIQUE on (source_table, source_id),
// notifications, ai_requests, tasks' key_link slots, meetings, artifacts), and
// the assertions read the stored rows back through `ae`, `notifications` and
// `aiRequests`, which are live views of those tables.
//
// The one thing the fixture still supplies is a CLOCK. activity_entries
// stamps created_at with datetime('now'), one-second resolution, and every
// feed orders by (created_at, id) with a random hex id, so two rows written in
// the same second would order at random. makeEnv gives each new row its own
// later second, after the statement that wrote it, the way the old fixture's
// counter did; ordering assertions then test the SQL's ORDER BY, not luck.

import { describe, it, expect } from 'vitest'
import type { AuthUser, Env } from '../helpers'
import { postActivityEntry } from './activity-entry'
import {
  handleGetTaskComments,
  handleAddTaskComment,
  handlePostTaskUpdate,
  handleDeleteTask,
  handleGetTaskActivity,
} from '../routes/tasks'
import { handleGetProjectActivity, handleAddComment, handlePostProjectUpdate, handleGetComments, handleGetProjectUpdates } from '../routes/projects'
import { handleDeleteActivityEntry, handleEditActivityEntry, handleSetActivityHidden } from '../routes/activity'
import { handleGetDayActivity, handlePostDayActivity } from '../routes/days'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const TEST_MODE_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const NON_PI_EMAIL = 'nate@umn.edu'
const NICK: AuthUser = { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }
const NATE: AuthUser = { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }

// ── Fixture ────────────────────────────────────────────────────────────────────

interface AERow {
  id: string
  entity_type: string
  entity_id: string
  project_id: string | null
  kind: string
  visibility: string
  actor_slug: string
  body: string
  mentions_json: string | null
  update_type: string | null
  metadata_json: string | null
  source_table: string | null
  source_id: string | null
  parent_id: string | null
  hidden_at: string | null
  hidden_by: string | null
  created_at: string
}

interface Fixtures {
  tasks: Record<string, {
    project_id: string | null; deleted_at?: string | null; title?: string; assignee?: string
    key_link_1?: string | null; key_link_2?: string | null; key_link_3?: string | null
    key_link_1_desc?: string | null; key_link_2_desc?: string | null; key_link_3_desc?: string | null
  }>
  projects: Record<string, { id: string; slug: string | null; category: string | null }>
  // artifacts keyed by art_ id → { title } for the key_link desc lookup.
  artifacts: Record<string, { title: string }>
  // #124: meetings keyed by mtg- id.
  meetings: Record<string, {
    date: string; title: string; notes?: string | null; decisions?: string | null
    attendees?: string | null; tags?: string | null; agenda?: string | null; source_id?: string | null
  }>
  teamSlugs: Set<string>
}

/** A live, read-only array view of a table: every access re-reads the stored rows. */
function liveRows<T>(read: () => T[]): T[] {
  return new Proxy([] as T[], {
    get(_target, prop) {
      const rows = read()
      const v = Reflect.get(rows, prop)
      return typeof v === 'function' ? v.bind(rows) : v
    },
  })
}

function makeEnv(fx: Partial<Fixtures> = {}, hooks: Parameters<typeof d1Adapter>[1] = {}) {
  const db = prodSchemaDb()

  // The chain's seeded pi_emails list does not name ingra107@umn.edu; the PI
  // gate reads this row (getPiEmails caches it per module, and every makeEnv
  // writes the same value).
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  // #8945: the login email on the row is what resolves a caller to a slug.
  const loginEmail: Record<string, string> = { 'nick-ingraham': PI_EMAIL, 'nate-mesfin': NON_PI_EMAIL }
  for (const slug of fx.teamSlugs ?? new Set(['nick-ingraham', 'nate-mesfin'])) {
    insertRow(db, 'team_members', { id: `tm_${slug}`, name: slug, slug, email: loginEmail[slug] ?? null })
  }
  for (const p of Object.values(fx.projects ?? {})) {
    insertRow(db, 'projects', { id: p.id, slug: p.slug, title: p.slug ?? p.id, category: p.category })
  }
  for (const [id, t] of Object.entries(fx.tasks ?? {})) {
    insertRow(db, 'tasks', {
      id, title: t.title ?? '', project_id: t.project_id, assignee: t.assignee ?? 'nick-ingraham',
      ...(t.deleted_at ? { deleted_at: t.deleted_at, status: 'deleted' } : {}),
      key_link_1: t.key_link_1 ?? null, key_link_2: t.key_link_2 ?? null, key_link_3: t.key_link_3 ?? null,
      key_link_1_desc: t.key_link_1_desc ?? null, key_link_2_desc: t.key_link_2_desc ?? null, key_link_3_desc: t.key_link_3_desc ?? null,
    })
  }
  for (const [id, a] of Object.entries(fx.artifacts ?? {})) {
    insertRow(db, 'artifacts', { id, title: a.title, body_md: '# x', created_by: 'nick-ingraham' })
  }
  for (const [id, m] of Object.entries(fx.meetings ?? {})) {
    insertRow(db, 'meetings', {
      id, date: m.date, title: m.title, notes: m.notes ?? null, decisions: m.decisions ?? null,
      attendees: m.attendees ?? null, tags: m.tags ?? null, agenda: m.agenda ?? null, source_id: m.source_id ?? null,
    })
  }

  // The clock (see the header): each activity row gets the next second, in
  // insertion (rowid) order, once the statement that wrote it has returned.
  // Unix seconds, an hour back; SQLite formats each stamp itself (datetime(?, 'unixepoch')),
  // the same 'YYYY-MM-DD HH:MM:SS' shape datetime('now') writes in prod.
  const base = Math.floor(Date.now() / 1000) - 60 * 60
  let tick = 0
  const stamped = new Set<string>()
  const stamp = () => {
    for (const { id } of db.prepare('SELECT id FROM activity_entries ORDER BY rowid').all() as Array<{ id: string }>) {
      if (stamped.has(id)) continue
      stamped.add(id)
      db.prepare("UPDATE activity_entries SET created_at = datetime(?, 'unixepoch') WHERE id = ?").run(base + tick++, id)
    }
  }
  // Stamping runs before every statement the code under test PREPARES and
  // before every read of the live views below, so a row is dated before
  // anything can read it. batch() is the adapter's own, untouched.
  const adapter = d1Adapter(db, hooks)
  const env = {
    TEST_MODE_KEY,
    PB_API_KEY: 'valid-test-api-key',
    DB: { ...adapter, prepare: (sql: string) => { stamp(); return adapter.prepare(sql) } },
  } as unknown as Env

  const ae = liveRows(() => { stamp(); return db.prepare('SELECT * FROM activity_entries ORDER BY rowid').all() as AERow[] })
  const notifications = liveRows(() => db.prepare('SELECT * FROM notifications ORDER BY rowid').all() as Array<Record<string, unknown>>)
  const aiRequests = liveRows(() => db.prepare('SELECT * FROM ai_requests ORDER BY rowid').all() as Array<Record<string, unknown>>)
  const taskRow = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  /** Delete the "Thinking…" placeholders a dispatch left, so a thread reads clean. */
  const dropPlaceholders = () => { db.prepare("DELETE FROM activity_entries WHERE body LIKE 'Thinking about this%'").run() }

  return { env, db, ae, notifications, aiRequests, taskRow, dropPlaceholders }
}

type Ctx = ReturnType<typeof makeEnv>

// Auth helpers — PI via test headers, non-PI via test headers, API-key via Bearer.
function piReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': PI_EMAIL } })
}
function natePostReq(bodyObj: unknown): Request {
  return new Request('https://x/api/test', { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NON_PI_EMAIL, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) })
}
function nateReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NON_PI_EMAIL } })
}
function apiKeyReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { Authorization: 'Bearer valid-test-api-key' } })
}

const FX: Partial<Fixtures> = {
  tasks: { 't1': { project_id: 'proj_a', title: 'Task One' } },
  projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
  teamSlugs: new Set(['nick-ingraham', 'nate-mesfin']),
}

// ── @me policy + visibility ─────────────────────────────────────────────────────

describe('postActivityEntry — @me policy strips prefix + sets author visibility', () => {
  it("'@me secret' → visibility=author, body stripped to 'secret'", async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me secret note', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(true)
    expect(ae[0].visibility).toBe('author')
    expect(ae[0].body).toBe('secret note')
  })

  it('explicit visibility=author works without the prefix', async () => {
    const { env, ae } = makeEnv(FX)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'private', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(ae[0].visibility).toBe('author')
    expect(ae[0].body).toBe('private')
  })

  it('team body stays team', async () => {
    const { env, ae } = makeEnv(FX)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'hello team', actorSlug: 'nate-mesfin' })
    expect(ae[0].visibility).toBe('team')
  })
})

// ── artifact key_link at-source hook (comment path) ─────────────────────────────
// A comment posted on a TASK whose body carries an artifact portal URL links the
// artifact into a free key_link slot in the SAME batch as the comment insert —
// mirroring the CREATE path (routes/artifacts.ts). Closes the residual the PB
// /process _capture_artifacts band-aid was covering.
describe('postActivityEntry — artifact key_link at source (task comment path)', () => {
  // A fresh fixture per test (the hook mutates task slots).
  function ctxWithArtifact(taskSlots: Partial<Record<'key_link_1' | 'key_link_2' | 'key_link_3', string | null>> = {}) {
    return makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One', ...taskSlots } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'Sepsis lit review' } },
      teamSlugs: new Set(['nick-ingraham', 'nate-mesfin']),
    })
  }
  const URL_ABC = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_abc123'
  /** The task's three slots as stored: [url, desc] per slot. */
  const slotsOf = (ctx: Ctx) => {
    const t = ctx.taskRow('t1')!
    return [1, 2, 3].map((n) => [t[`key_link_${n}`] ?? null, t[`key_link_${n}_desc`] ?? null])
  }

  it('comment with an artifact URL → links into the first free slot, comment still posts', async () => {
    const ctx = ctxWithArtifact()
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `Full write-up: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    // Comment landed.
    expect(ctx.ae.some(e => e.entity_id === 't1' && e.kind === 'comment')).toBe(true)
    // No linkSkipped flag (a fresh link was written), and slot 1 holds it.
    expect((r as { linkSkipped?: string }).linkSkipped).toBeUndefined()
    expect(slotsOf(ctx)[0][0]).toBe(URL_ABC)
  })

  it('links the artifact title as `Hermes: <title>` description', async () => {
    const ctx = ctxWithArtifact()
    await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `here: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(slotsOf(ctx)).toEqual([[URL_ABC, 'Hermes: Sepsis lit review'], [null, null], [null, null]])
  })

  it('falls back to a generic desc when the artifact row is not found', async () => {
    const ctx = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: {}, // no artifact row for the URL's id
      teamSlugs: new Set(['nick-ingraham']),
    })
    await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `see ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(slotsOf(ctx)[0]).toEqual([URL_ABC, 'Hermes: artifact'])
  })

  it('idempotent — URL already in a slot → slots unchanged, linkSkipped=already_linked', async () => {
    const ctx = ctxWithArtifact({ key_link_1: URL_ABC })
    const before = ctx.taskRow('t1')
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `again: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(ctx.taskRow('t1')).toEqual(before)
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('already_linked')
  })

  it('all 3 slots full → no link, linkSkipped=slots_full, comment still posts', async () => {
    const ctx = ctxWithArtifact({
      key_link_1: 'https://x/1', key_link_2: 'https://x/2', key_link_3: 'https://x/3',
    })
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `won't fit: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('slots_full')
    expect(slotsOf(ctx).map(s => s[0])).toEqual(['https://x/1', 'https://x/2', 'https://x/3'])
    // Comment still posted.
    expect(ctx.ae.some(e => e.entity_id === 't1' && e.kind === 'comment')).toBe(true)
  })

  it('two artifact URLs in one comment fill two distinct slots, left-to-right', async () => {
    const ctx = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'First' }, art_def456: { title: 'Second' } },
      teamSlugs: new Set(['nick-ingraham']),
    })
    const url2 = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_def456'
    await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `two: ${URL_ABC} and ${url2}`, actorSlug: 'nick-ingraham',
    })
    expect(slotsOf(ctx)).toEqual([[URL_ABC, 'Hermes: First'], [url2, 'Hermes: Second'], [null, null]])
  })

  it('partial fit: 1 free slot + 2 URLs → links 1, linkSkipped=slots_full', async () => {
    const ctx = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One', key_link_1: 'https://x/1', key_link_2: 'https://x/2' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'First' }, art_def456: { title: 'Second' } },
      teamSlugs: new Set(['nick-ingraham']),
    })
    const url2 = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_def456'
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `${URL_ABC} ${url2}`, actorSlug: 'nick-ingraham',
    })
    expect(slotsOf(ctx).map(s => s[0])).toEqual(['https://x/1', 'https://x/2', URL_ABC])
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('slots_full')
  })

  it('comment on a PROJECT entity → no link attempt', async () => {
    const ctx = ctxWithArtifact()
    const before = ctx.taskRow('t1')
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'project', entityId: 'proj_a', kind: 'comment',
      body: `project note with ${URL_ABC}`, actorSlug: 'nick-ingraham', projectSlug: 'alpha',
    })
    expect(r.ok).toBe(true)
    expect(ctx.taskRow('t1')).toEqual(before)
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM projects WHERE key_link_1 IS NOT NULL OR key_link_2 IS NOT NULL OR key_link_3 IS NOT NULL").get()).toEqual({ n: 0 })
  })

  it('task UPDATE (kind=update) with an artifact URL → no link attempt (comment-path only)', async () => {
    const ctx = ctxWithArtifact()
    const before = ctx.taskRow('t1')
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', updateType: 'progress',
      body: `progress: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(ctx.taskRow('t1')).toEqual(before)
  })

  it('comment with a non-artifact URL → ignored, no link attempt', async () => {
    const ctx = ctxWithArtifact()
    const before = ctx.taskRow('t1')
    const r = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'see https://docs.google.com/document/d/abc for the draft', actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(ctx.taskRow('t1')).toEqual(before)
    expect((r as { linkSkipped?: string }).linkSkipped).toBeUndefined()
  })

  it('posting the same artifact-URL comment twice → exactly one key_link', async () => {
    const ctx = ctxWithArtifact()
    const first = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `first: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    const second = await postActivityEntry({
      env: ctx.env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `second: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(first.ok && second.ok).toBe(true)
    expect(slotsOf(ctx).filter(s => s[0] === URL_ABC)).toHaveLength(1) // only the first wrote a slot
    expect((second as { linkSkipped?: string }).linkSkipped).toBe('already_linked')
    expect(ctx.ae.filter(e => e.entity_id === 't1' && e.kind === 'comment')).toHaveLength(2)
  })

  // End-to-end through the actual route: linkSkipped surfaces on the response.
  it('route handleAddTaskComment surfaces linkSkipped=slots_full on the response', async () => {
    const ctx = ctxWithArtifact({
      key_link_1: 'https://x/1', key_link_2: 'https://x/2', key_link_3: 'https://x/3',
    })
    const res = await handleAddTaskComment('t1', natePostReq({ content: `won't fit: ${URL_ABC}` }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const payload = await res.json() as { data: unknown; linkSkipped?: string }
    expect(payload.linkSkipped).toBe('slots_full')
    expect(payload.data).toBeTruthy() // comment still created
    expect(ctx.ae.filter(e => e.entity_id === 't1' && e.actor_slug === 'nate-mesfin')).toHaveLength(1)
  })

  it('route handleAddTaskComment: clean link → no linkSkipped on the response', async () => {
    const ctx = ctxWithArtifact()
    const res = await handleAddTaskComment('t1', natePostReq({ content: `here: ${URL_ABC}` }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const payload = await res.json() as { linkSkipped?: string }
    expect(payload.linkSkipped).toBeUndefined()
    expect(slotsOf(ctx)[0][0]).toBe(URL_ABC)
  })
})

describe('read visibility gate — author-only rows hidden from other actors', () => {
  async function seed() {
    const ctx = makeEnv(FX)
    // Nate's author-only note + a team comment.
    await postActivityEntry({ env: ctx.env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me natesecret', actorSlug: 'nate-mesfin' })
    await postActivityEntry({ env: ctx.env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'shared', actorSlug: 'nate-mesfin' })
    return ctx
  }

  it('author (Nate) sees own author-only row', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', nateReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })

  it('a different non-PI actor does NOT see the author-only row', async () => {
    const ctx = await seed()
    // Use a non-PI request whose actor differs from the author. nick is PI, so
    // make a fresh non-PI user identity that is NOT nate-mesfin.
    const otherReq = new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': 'collins@umn.edu' } })
    const res = await handleGetTaskComments('t1', otherReq, ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content)).toEqual(['shared'])
  })

  it('API-key caller sees ALL rows including author-only', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', apiKeyReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })

  it('PI (Nick) sees ALL rows including others author-only', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', piReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })
})

// ── validation ──────────────────────────────────────────────────────────────────

describe('owner re-notification — activity on YOUR task re-lights the bell (2026-06-11)', () => {
  const OWNED = { tasks: { t1: { project_id: 'proj_a', title: 'Task One', assignee: 'nick-ingraham' } }, projects: FX.projects, teamSlugs: FX.teamSlugs } as Partial<Fixtures>

  it('team comment by another actor notifies the assignee with a portal deep-link', async () => {
    const { env, notifications } = makeEnv(OWNED)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'made progress on this', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(true)
    const owner = notifications.find(n => n.recipient_slug === 'nick-ingraham')
    expect(owner).toBeTruthy()
    expect(owner!.type).toBe('update')
    expect(owner!.link).toBe('/portal/my-tasks?open=t1')     // direct editor deep-link
    expect(owner!.source_id).toBe('t1')
  })

  it('author-only (@me) entries notify NO ONE', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me private thought', actorSlug: 'nate-mesfin' })
    expect(notifications.length).toBe(0)
  })

  it('self-activity (actor == assignee) does not notify', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment', body: 'note to self, team-visible', actorSlug: 'nick-ingraham' })
    expect(notifications.length).toBe(0)
  })

  it('assignee already @mentioned gets ONLY the richer mention notification (no dup)', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'hey @nick-ingraham look at this', actorSlug: 'nate-mesfin' })
    const toNick = notifications.filter(n => n.recipient_slug === 'nick-ingraham')
    expect(toNick.length).toBe(1)
    expect(toNick[0].type).toBe('mention')
  })
})

describe('postActivityEntry — validation', () => {
  it('rejects an unknown kind', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'bogus' as any, body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects an unknown update_type for kind=update', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', updateType: 'nope', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('defaults update_type to progress for kind=update', async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(true)
    expect(ae[0].update_type).toBe('progress')
  })

  it('rejects update_type on a non-update kind', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment', updateType: 'progress', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown entity_type', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'widget' as any, entityId: 'w1', kind: 'comment', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('404s when the task entity does not exist', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 'ghost', kind: 'comment', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })
})

// ── idempotency ──────────────────────────────────────────────────────────────────

describe('postActivityEntry — source_table/source_id idempotency', () => {
  it('a second insert with the same source returns the existing row, no dup', async () => {
    const { env, ae } = makeEnv(FX)
    const first = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'migrated', actorSlug: 'nick-ingraham', sourceTable: 'task_updates', sourceId: 'tu-1' })
    expect(first.ok).toBe(true)
    const before = ae.length
    const second = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'migrated', actorSlug: 'nick-ingraham', sourceTable: 'task_updates', sourceId: 'tu-1' })
    expect(second.ok).toBe(true)
    expect(ae.length).toBe(before) // no duplicate row
    if (first.ok && second.ok) expect(second.row.id).toBe(first.row.id)
  })
})

// ── projection shapes ────────────────────────────────────────────────────────────

describe('projection shapes match the legacy endpoints', () => {
  it('GET /comments returns id, task_id, author_slug, content, created_at', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'a comment' }), NATE, ctx.env)
    const res = await handleGetTaskComments('t1', piReq(), ctx.env)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author_slug', 'content', 'created_at', 'id', 'task_id'])
    expect(body.data[0].content).toBe('a comment')
    expect(body.data[0].author_slug).toBe('nate-mesfin')
    expect(body.data[0].task_id).toBe('t1')
  })
})

// ── unified feed + project feed ───────────────────────────────────────────────────

describe('handleGetTaskActivity — unified feed', () => {
  it('returns comments + updates together, newest-first', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'first' }), NATE, ctx.env)
    await handlePostTaskUpdate('t1', natePostReq({ content: 'second', update_type: 'progress' }), NATE, ctx.env)
    const res = await handleGetTaskActivity('t1', piReq(), ctx.env)
    const body = await res.json() as { data: { kind: string; body: string }[] }
    expect(body.data.length).toBe(2)
    // newest-first: 'second' (update) before 'first' (comment)
    expect(body.data[0].body).toBe('second')
    expect(body.data.map(d => d.kind).sort()).toEqual(['comment', 'update'])
  })
})

describe('handleGetProjectActivity — whole-picture feed', () => {
  it('includes task rows rolled up by project_id', async () => {
    const ctx = makeEnv(FX)
    // A task comment on t1 (project proj_a) + a direct project entry.
    await handleAddTaskComment('t1', natePostReq({ content: 'task-level' }), NATE, ctx.env)
    await postActivityEntry({ env: ctx.env, user: NICK, entityType: 'project', entityId: 'proj_a', kind: 'update', body: 'project-level', actorSlug: 'nick-ingraham' })
    const res = await handleGetProjectActivity('alpha', piReq(), ctx.env)
    const body = await res.json() as { data: { entity_type: string; body: string; task_title?: string | null }[] }
    const bodies = body.data.map(d => d.body).sort()
    expect(bodies).toEqual(['project-level', 'task-level'])
    expect(body.data.some(d => d.entity_type === 'task')).toBe(true)
    expect(body.data.some(d => d.entity_type === 'project')).toBe(true)
    // task rows carry the joined display title; project rows don't.
    expect(body.data.find(d => d.entity_type === 'task')?.task_title).toBe('Task One')
    expect(body.data.find(d => d.entity_type === 'project')?.task_title ?? null).toBeNull()
  })
})

// ── P2-A: project composer retarget + legacy-shape projections ───────────────────

describe('P2-A — project composers write activity_entries; old reads are projections', () => {
  it('handleAddComment lands in activity_entries and round-trips through handleGetComments', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddComment('alpha', natePostReq({ content: 'hello project' }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'comment')
    expect(row).toBeDefined()
    expect(row!.entity_id).toBe('proj_a')
    expect(row!.actor_slug).toBe('nate-mesfin')

    const read = await handleGetComments('alpha', piReq(), ctx.env)
    const body = await read.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author_id', 'author_name', 'author_slug', 'content', 'created_at', 'id'])
    expect(body.data[0].content).toBe('hello project')
    expect(body.data[0].author_slug).toBe('nate-mesfin')
  })

  it('handlePostProjectUpdate lands in activity_entries; response + projection keep the legacy slug-keyed shape', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostProjectUpdate('alpha', natePostReq({ content: 'a note', update_type: 'blocker' }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const created = await res.json() as { data: Record<string, unknown> }
    expect(created.data.project_id).toBe('alpha') // slug echo, not the typed id
    expect(created.data.author).toBe('nate-mesfin')
    expect(created.data.update_type).toBe('blocker')

    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.entity_id).toBe('proj_a') // stored against the canonical typed id

    const read = await handleGetProjectUpdates('alpha', piReq(), ctx.env)
    const body = await read.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author', 'content', 'created_at', 'id', 'project_id', 'update_type'])
    expect(body.data[0].project_id).toBe('alpha')
    expect(body.data[0].update_type).toBe('blocker')
  })

  it('project comment + update roll into the whole-picture project feed', async () => {
    const ctx = makeEnv(FX)
    await handleAddComment('alpha', natePostReq({ content: 'c1' }), NATE, ctx.env)
    await handlePostProjectUpdate('alpha', natePostReq({ content: 'u1' }), NATE, ctx.env)
    const res = await handleGetProjectActivity('alpha', piReq(), ctx.env)
    const body = await res.json() as { data: { kind: string }[] }
    expect(body.data.map(d => d.kind).sort()).toEqual(['comment', 'update'])
  })

  // PB session-close capture (2026-06-23): the route forwards source_table /
  // source_id from the request body to postActivityEntry, so a re-post with the
  // SAME key (session-close + overnight Inbox flush) is INSERT-OR-IGNORE'd.
  it('handlePostProjectUpdate forwards source_table/source_id; a second post with the same key is deduped to ONE row', async () => {
    const ctx = makeEnv(FX)
    const post = () => handlePostProjectUpdate(
      'alpha',
      natePostReq({
        content: 'progress: shipped the capture pass',
        source_table: 'pb_progress_note',
        source_id: 'abc123def456abc123def456abc12300',
      }),
      NATE,
      ctx.env,
    )

    const first = await post()
    expect(first.status).toBe(201)
    const firstRow = ctx.ae.find(r => r.entity_type === 'project' && r.source_table === 'pb_progress_note')
    expect(firstRow).toBeDefined()
    expect(firstRow!.source_table).toBe('pb_progress_note')
    expect(firstRow!.source_id).toBe('abc123def456abc123def456abc12300')
    const after1 = ctx.ae.length

    // Second identical post — INSERT OR IGNORE drops it; no new row.
    const second = await post()
    expect(second.status).toBe(201) // route still returns the canonical (pre-existing) row
    expect(ctx.ae.length).toBe(after1) // NO duplicate
    expect(ctx.ae.filter(r => r.source_table === 'pb_progress_note').length).toBe(1)
  })

  // Half-set source params must NOT store a non-NULL source_table with a NULL
  // source_id (outside the partial UNIQUE index's intent). The route requires
  // the pair or neither.
  it('handlePostProjectUpdate ignores a half-set source key (source_table without source_id)', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostProjectUpdate(
      'alpha',
      natePostReq({ content: 'no key', source_table: 'pb_progress_note' }),
      NATE,
      ctx.env,
    )
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.source_table).toBeNull()
    expect(row!.source_id).toBeNull()
  })

  // #103: the TASK lane needs the same idempotency contract the project lane
  // has had since 2026-06-23. Without it PB could only write per-PROJECT
  // session summaries — session-close and the overnight Inbox backstop both
  // emit the note, so a task note would have duplicated on every close.
  it('handlePostTaskUpdate forwards source_table/source_id; a second post with the same key is deduped to ONE row', async () => {
    const ctx = makeEnv(FX)
    const post = () => handlePostTaskUpdate(
      't1',
      natePostReq({
        content: 'progress: wired the day-scoped transcript',
        source_table: 'pb_progress_note',
        source_id: 'feedfacefeedfacefeedfacefeedfa00',
      }),
      NATE,
      ctx.env,
    )

    const first = await post()
    expect(first.status).toBe(201)
    const firstRow = ctx.ae.find(r => r.entity_type === 'task' && r.source_table === 'pb_progress_note')
    expect(firstRow).toBeDefined()
    expect(firstRow!.source_id).toBe('feedfacefeedfacefeedfacefeedfa00')
    const after1 = ctx.ae.length

    const second = await post()
    expect(second.status).toBe(201)
    expect(ctx.ae.length).toBe(after1)
    expect(ctx.ae.filter(r => r.source_table === 'pb_progress_note').length).toBe(1)
  })

  it('handlePostTaskUpdate ignores a half-set source key (source_table without source_id)', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostTaskUpdate(
      't1',
      natePostReq({ content: 'no key', source_table: 'pb_progress_note' }),
      NATE,
      ctx.env,
    )
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'task' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.source_table).toBeNull()
    expect(row!.source_id).toBeNull()
  })

  // A project note and a task note with the SAME body on the same day are
  // DIFFERENT rows — Nick wants the task summary even when it duplicates the
  // project one. The two lanes must therefore key into different namespaces
  // (PB prefixes the task key), or one would silently swallow the other.
  it('a task note and a project note with distinct keys both land', async () => {
    const ctx = makeEnv(FX)
    const shared = 'Shipped the transcript fix.'
    await handlePostProjectUpdate('alpha', natePostReq({
      content: shared, source_table: 'pb_progress_note', source_id: 'a'.repeat(32),
    }), NATE, ctx.env)
    await handlePostTaskUpdate('t1', natePostReq({
      content: shared, source_table: 'pb_progress_note', source_id: 'b'.repeat(32),
    }), NATE, ctx.env)
    const notes = ctx.ae.filter(r => r.source_table === 'pb_progress_note')
    expect(notes.map(r => r.entity_type).sort()).toEqual(['project', 'task'])
  })
})

// ── Hermes placeholder ────────────────────────────────────────────────────────────

describe('Hermes — @hermes lands a placeholder activity entry + ai_request', () => {
  it('creates a claude-ai comment placeholder and an ai_request', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@hermes please summarize the task context' }), NATE, ctx.env)
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai' && r.body.includes('Thinking about'))
    expect(placeholder).toBeDefined()
    expect(placeholder!.kind).toBe('comment')
    expect(ctx.aiRequests.length).toBe(1)
    expect(ctx.aiRequests[0].source_type).toBe('task_comment')
    expect(ctx.aiRequests[0].status).toBe('pending')
  })

  it('a Hermes placeholder for an @me question inherits author visibility', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@me @hermes is this private analysis right' }), NATE, ctx.env)
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai')
    expect(placeholder).toBeDefined()
    expect(placeholder!.visibility).toBe('author')
  })

  // Phase 5 (the typed-prefix writer flip): SmartCompose + TaskDetailPanel post
  // the body verbatim (@hermes token intact) with an explicit visibility:'author'
  // field — NOT the @me prefix. The ask AND Hermes's answer must both stay
  // author-only; a revert to team here republishes every private typed ask.
  it("Phase 5: explicit visibility='author' + @hermes body keeps the ask AND the placeholder private", async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@hermes draft a reply to the reviewer', visibility: 'author' }), NATE, ctx.env)
    const root = ctx.ae.find(r => r.actor_slug === 'nate-mesfin')
    expect(root).toBeDefined()
    expect(root!.visibility).toBe('author')
    expect(root!.body).toBe('@hermes draft a reply to the reviewer') // token kept → Hermes fires
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai')
    expect(placeholder).toBeDefined()
    expect(placeholder!.visibility).toBe('author')
    expect(ctx.aiRequests.length).toBe(1) // dispatched as a task_comment
  })

  // A short but real question used to be silently dropped by a `<= 5` guard; the
  // composer still said "Asked Hermes". Now it dispatches and reports it.
  it('a short @hermes question dispatches and reports dispatched:true', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddTaskComment('t1', natePostReq({ content: '@hermes fix?' }), NATE, ctx.env)
    expect(ctx.aiRequests.length).toBe(1)
    const out = await res.json() as { hermes?: { dispatched: boolean } }
    expect(out.hermes?.dispatched).toBe(true)
  })

  // A bare @hermes with no question must NOT read as success — no dispatch, and
  // the outcome is reported so the composer can say "add a question".
  it('a bare @hermes does not dispatch and reports reason:empty', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddTaskComment('t1', natePostReq({ content: '@hermes' }), NATE, ctx.env)
    expect(ctx.aiRequests.length).toBe(0)
    const out = await res.json() as { hermes?: { dispatched: boolean; reason?: string } }
    expect(out.hermes).toEqual({ dispatched: false, reason: 'empty' })
  })
})

// ── delete cascade ────────────────────────────────────────────────────────────────

describe('task delete cascades activity_entries', () => {
  const delReq = () => new Request('https://x/api/test', { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': PI_EMAIL } })

  it('soft-deletes the task and removes its entries, in the same write', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'to be deleted' }), NATE, ctx.env)
    expect(ctx.ae.filter(r => r.entity_id === 't1').length).toBeGreaterThan(0)
    const res = await handleDeleteTask('t1', delReq(), NICK, ctx.env)
    expect(res.status).toBe(200)
    expect(ctx.taskRow('t1')).toMatchObject({ status: 'deleted' })
    expect(ctx.taskRow('t1')?.deleted_at).not.toBeNull()
    expect(ctx.ae.filter(r => r.entity_type === 'task' && r.entity_id === 't1').length).toBe(0)
    const receipt = ctx.db.prepare("SELECT outcome FROM processed_mutations WHERE table_name = 'tasks' AND record_id = 't1'").get()
    expect(receipt).toEqual({ outcome: 'accepted' })
  })

  it('a soft-delete that does not land leaves the task AND its entries in place', async () => {
    // #8875: the route used to delete the children itself, before the
    // soft-delete and with the failure swallowed, so this left a live task
    // with no timeline. The cascade now rides the soft-delete's batch.
    const ctx = makeEnv(FX, { failSql: /^UPDATE tasks SET deleted_at/, failTimes: 99 })
    await handleAddTaskComment('t1', natePostReq({ content: 'must survive' }), NATE, ctx.env)
    const before = ctx.ae.filter(r => r.entity_id === 't1').map(r => r.id)
    expect(before.length).toBeGreaterThan(0)
    const outcome = await handleDeleteTask('t1', delReq(), NICK, ctx.env).then(r => r.status, (e: Error) => `threw: ${e.message}`)
    expect(outcome).not.toBe(200)
    expect(ctx.taskRow('t1')).toMatchObject({ deleted_at: null })
    expect(ctx.ae.filter(r => r.entity_id === 't1').map(r => r.id)).toEqual(before)
  })
})

// ── Manual activity deletion (author or PI) — POST /api/activity/:id/delete ──

describe('handleDeleteActivityEntry — author-or-PI manual delete', () => {
  async function seed(env: Env, actorSlug: string): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({ env, user, entityType: 'task', entityId: 't1', kind: 'comment', body: 'to be deleted', actorSlug })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id
  }

  it('author deletes their own entry (hard delete)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleDeleteActivityEntry(id, nateReq(), NATE, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { deleted: boolean; idempotent: boolean } }
    expect(body.data.deleted).toBe(true)
    expect(body.data.idempotent).toBe(false)
    expect(ae.find(r => r.id === id)).toBeUndefined()
  })

  it("non-PI cannot delete someone else's entry (403, row intact)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nick-ingraham')
    const res = await handleDeleteActivityEntry(id, nateReq(), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)).toBeDefined()
  })

  it("PI deletes anyone's entry", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleDeleteActivityEntry(id, piReq(), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)).toBeUndefined()
  })

  it('missing row is idempotent (200, idempotent:true)', async () => {
    const { env } = makeEnv(FX)
    const res = await handleDeleteActivityEntry('ae_missing', piReq(), NICK, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { idempotent: boolean } }
    expect(body.data.idempotent).toBe(true)
  })
})

describe('handleEditActivityEntry — author-or-PI edit', () => {
  async function seed(env: Env, actorSlug: string, kind: 'comment' | 'update' = 'comment'): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({
      env, user, entityType: 'task', entityId: 't1', kind, body: 'original body', actorSlug,
      ...(kind === 'update' ? { updateType: 'progress' } : {}),
    })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id as string
  }
  function editReq(email: string, body: unknown): Request {
    return new Request('https://x/api/test', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('author edits their own comment (body updated + edited flag)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: 'revised body' }), NATE, env)
    expect(res.status).toBe(200)
    const row = ae.find(r => r.id === id)!
    expect(row.body).toBe('revised body')
    expect(JSON.parse(row.metadata_json!).edited).toBe(true)
  })

  it("non-PI cannot edit someone else's comment (403, body intact)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nick-ingraham')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: 'hijack' }), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)!.body).toBe('original body')
  })

  it("PI edits anyone's comment", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(PI_EMAIL, { body: 'pi fix' }), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.body).toBe('pi fix')
  })

  it('empty body is rejected (400)', async () => {
    const { env } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: '   ' }), NATE, env)
    expect(res.status).toBe(400)
  })

  it('missing row is 404', async () => {
    const { env } = makeEnv(FX)
    const res = await handleEditActivityEntry('ae_missing', editReq(PI_EMAIL, { body: 'x' }), NICK, env)
    expect(res.status).toBe(404)
  })
})

// ── hide / dismiss (v102, Hermes wave Phase 2) ──────────────────────────────────
// "Dismiss" hides a thread from feeds but RETAINS the rows. The subtle correctness
// bit is INHERITANCE: a reply posted AFTER a root is dismissed must be born hidden,
// or it leaks the thread back into the feed (§2.2). Exercised end-to-end through the
// real endpoint + the real write primitive, not a stub.
describe('handleSetActivityHidden — dismiss/restore a thread root (v102)', () => {
  function hideReq(email: string, body: unknown): Request {
    return new Request('https://x/api/test', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  async function seedRoot(env: Env, actorSlug = 'nate-mesfin'): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({ env, user, entityType: 'task', entityId: 't1', kind: 'comment', body: 'root', actorSlug })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id as string
  }
  async function reply(env: Env, parentId: string, actorSlug = 'nate-mesfin') {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    return postActivityEntry({ env, user, entityType: 'task', entityId: '', parentId, kind: 'comment', body: 'child', actorSlug })
  }

  it('author dismisses own root → 200 and hidden_at is set', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.hidden_at).toBeTruthy()
  })

  it('a reply posted AFTER the dismiss is born hidden (inheritance — no leak)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    const r = await reply(env, id)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; row: Record<string, unknown> }).row.hidden_at).toBeTruthy()
    expect(ae.find(x => x.parent_id === id)!.hidden_at).toBeTruthy()
  })

  it('dismiss cascades to a reply that already existed', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await reply(env, id)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(ae.filter(r => r.id === id || r.parent_id === id).every(r => r.hidden_at)).toBe(true)
  })

  it('unhide clears hidden_at on root + replies', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await reply(env, id)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: false }), NATE, env)
    expect(ae.filter(r => r.id === id || r.parent_id === id).every(r => r.hidden_at == null)).toBe(true)
  })

  it('hiding a REPLY is a 400 (only roots dismissible)', async () => {
    const { env } = makeEnv(FX)
    const id = await seedRoot(env)
    const r = await reply(env, id)
    const replyId = (r as { ok: true; row: Record<string, unknown> }).row.id as string
    const res = await handleSetActivityHidden(replyId, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(400)
  })

  it("non-PI cannot dismiss someone else's root (403, stays visible)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env, 'nick-ingraham')
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)!.hidden_at ?? null).toBeNull()
  })

  it('PI dismisses anyone\'s root', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env, 'nate-mesfin')
    const res = await handleSetActivityHidden(id, hideReq(PI_EMAIL, { hidden: true }), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.hidden_at).toBeTruthy()
  })

  it('non-boolean hidden is rejected (400)', async () => {
    const { env } = makeEnv(FX)
    const id = await seedRoot(env)
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: 'yes' }), NATE, env)
    expect(res.status).toBe(400)
  })

  it('missing row is 404', async () => {
    const { env } = makeEnv(FX)
    const res = await handleSetActivityHidden('ae_missing', hideReq(PI_EMAIL, { hidden: true }), NICK, env)
    expect(res.status).toBe(404)
  })
})

// ── the `day` entity (Hermes wave Phase 3) ──────────────────────────────────────
// A day is a civil-date bucket with NO table: the shape check IS the existence
// check, project_id is always NULL, and a @hermes ask reuses the listener-safe
// 'daily_thought' source_type with context=NULL. Day threads default PRIVATE.
function dayPostReq(email: string, body: unknown): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function userGetReq(email: string): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email } })
}

describe('postActivityEntry — day entity', () => {
  it('accepts a valid civil date, project_id is NULL', async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: '2026-07-22', kind: 'comment', body: 'a private thought', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(r.ok).toBe(true)
    expect(ae[0].entity_type).toBe('day')
    expect(ae[0].project_id).toBeNull()
  })

  it('rejects a non-date entity_id (400) — no entity namespace by invention', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: 'whatever', kind: 'comment', body: 'x', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('@hermes on a day dispatches source_type=daily_thought with context=NULL (listener-safe)', async () => {
    const { env, aiRequests } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: '2026-07-22', kind: 'comment', body: '@hermes what should I focus on today', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(r.ok).toBe(true)
    expect(aiRequests.length).toBe(1)
    expect(aiRequests[0].source_type).toBe('daily_thought')
    expect(aiRequests[0].context).toBeNull() // NEVER "day: <date>"
  })
})

// ── #124: the meeting entity ─────────────────────────────────────────────────
//
// Nick could read a debrief and ask nothing about it. A meeting becomes an
// entity_type on the same store, so the conversation, the privacy rules and the
// Hermes dispatch are the ones that already exist. Two things are load-bearing
// and both are asserted below: project_id must stay NULL (a meeting spans
// projects, so charging its talk to one would move that project's health for a
// discussion it never had), and the Hermes prompt must carry the meeting's own
// facts, because the deployed PB listener cannot resolve a `meeting:` token and
// would otherwise answer with no idea what the meeting was.
const MTG_FX: Partial<Fixtures> = {
  meetings: {
    'mtg-2026-09-08-abc': {
      date: '2026-09-08',
      title: '2nd CLIF Senior Advisory Meeting',
      notes: '## Summary\nThe board reviewed consortium growth.',
      decisions: '["A CLIF Foundation nonprofit has been established."]',
      attendees: '["dudley@umn.edu","ingra107@umn.edu"]',
      tags: '["clif-steering-committee"]',
      source_id: 'cal-20260908T1200-2nd-clif-senior-advisory',
    },
  },
}

describe('postActivityEntry — meeting entity (#124)', () => {
  it('accepts an existing meeting; project_id is NULL even when the meeting tags projects', async () => {
    const { env, ae } = makeEnv(MTG_FX)
    const r = await postActivityEntry({
      env, user: NATE, entityType: 'meeting', entityId: 'mtg-2026-09-08-abc',
      kind: 'comment', body: 'what did we agree on the Flare license?', actorSlug: 'nate-mesfin',
    })
    expect(r.ok).toBe(true)
    expect(ae[0].entity_type).toBe('meeting')
    expect(ae[0].entity_id).toBe('mtg-2026-09-08-abc')
    expect(ae[0].project_id).toBeNull()
  })

  it('rejects an unknown meeting (404) — a real table means a real existence check', async () => {
    const { env } = makeEnv(MTG_FX)
    const r = await postActivityEntry({
      env, user: NATE, entityType: 'meeting', entityId: 'mtg-does-not-exist',
      kind: 'comment', body: 'x', actorSlug: 'nate-mesfin',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })

  it('defaults team-visible — a meeting page is a shared surface', async () => {
    const { env, ae } = makeEnv(MTG_FX)
    await postActivityEntry({
      env, user: NATE, entityType: 'meeting', entityId: 'mtg-2026-09-08-abc',
      kind: 'comment', body: 'notes look right to me', actorSlug: 'nate-mesfin',
    })
    expect(ae[0].visibility).toBe('team')
  })

  it('@hermes dispatches source_type=meeting_comment with the meeting facts in the PROMPT', async () => {
    const { env, aiRequests } = makeEnv(MTG_FX)
    const r = await postActivityEntry({
      env, user: NATE, entityType: 'meeting', entityId: 'mtg-2026-09-08-abc',
      kind: 'comment', body: '@hermes what did I say we had to answer before the next meeting?',
      actorSlug: 'nate-mesfin',
    })
    expect(r.ok).toBe(true)
    expect(aiRequests.length).toBe(1)
    const req = aiRequests[0]
    expect(req.source_type).toBe('meeting_comment')          // its own lane in the listener log
    expect(req.project_slug).toBeNull()                       // NULL, same reason project_id is
    expect(req.context).toBe('meeting: mtg-2026-09-08-abc')   // context keeps the grammar
    const prompt = req.prompt as string
    // The block is what makes the ask answerable at all: the fenced model cannot
    // resolve an opaque mtg- id, and the listener has no `meeting:` resolver.
    expect(prompt).toContain('<meeting_context version="1"')
    expect(prompt).toContain('2nd CLIF Senior Advisory Meeting')
    expect(prompt).toContain('date: 2026-09-08')
    expect(prompt).toContain('A CLIF Foundation nonprofit has been established.')
    expect(prompt).toContain('clif-steering-committee')
    // The verbatim transcript is NOT in D1 — the block must name where PB put it,
    // with the slug derived the way meeting_debrief.py derives it.
    expect(prompt).toContain('Context/Meetings/2026-09-08_2nd-clif-senior-advisory-meeting.transcript.vtt')
    // The question itself survives the envelope.
    expect(prompt).toContain('what did I say we had to answer before the next meeting?')
  })

  it('a failed context build still asks the question — context is an enhancement', async () => {
    // A meeting row that exists for the check but whose context read throws.
    const { env, aiRequests } = makeEnv(MTG_FX)
    const realPrepare = env.DB.prepare.bind(env.DB)
    env.DB.prepare = ((sql: string) => {
      if (/SELECT id, date, title, type, status/.test(sql)) throw new Error('boom')
      return realPrepare(sql)
    }) as typeof env.DB.prepare
    const r = await postActivityEntry({
      env, user: NATE, entityType: 'meeting', entityId: 'mtg-2026-09-08-abc',
      kind: 'comment', body: '@hermes summarise this', actorSlug: 'nate-mesfin',
    })
    expect(r.ok).toBe(true)
    expect(aiRequests.length).toBe(1)
    const prompt = aiRequests[0].prompt as string
    expect(prompt).not.toContain('<meeting_context')
    expect(prompt).toContain('summarise this')
  })
})

// ── #98 multi-turn: the thread transcript Hermes gets in its prompt ───────────
//
// Nick's ask: "if I wanted it to do something different with the email, it would
// have the context of what it did in the prior post." The transcript therefore
// has to include HERMES'S OWN prior answers, not just the user's questions.
// Since @hermes threads went private-by-default, those answers are
// visibility='author' with actor_slug='claude-ai' — neither team-visible nor
// the requester's — so a two-arm gate dropped every one of them and Hermes
// answered each follow-up with no memory of what it had just written.
describe('dispatchHermes — thread transcript (#98)', () => {
  /** Prompt of the Nth stored ai_requests row. */
  const promptOf = (aiRequests: Array<Record<string, unknown>>, n: number) =>
    aiRequests[n].prompt as string

  async function privateThreadWithAnswer({ env, dropPlaceholders }: Ctx) {
    const root = await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes draft an email to Will about the cohort', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    if (!root.ok) throw new Error('root failed')
    const rootId = root.row.id as string
    // Stand in for the listener's answer: claude-ai reply, private by inheritance.
    const answer = await postActivityEntry({
      env, user: { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' }, entityType: 'task', entityId: 't1',
      kind: 'comment', body: 'Draft: Hi Will, the cohort is 4,812 encounters.',
      actorSlug: 'claude-ai', visibility: 'author', parentId: rootId, fireSideEffects: false,
    })
    if (!answer.ok) throw new Error('answer failed')
    // Drop the "Thinking…" placeholder the root's dispatch left behind so the
    // assertions below read a clean two-message thread.
    dropPlaceholders()
    return rootId
  }

  it("carries Hermes's own prior answer into the follow-up prompt", async () => {
    const ctx = makeEnv(FX)
    const { env, aiRequests } = ctx
    const rootId = await privateThreadWithAnswer(ctx)
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes make it shorter', actorSlug: 'nate-mesfin', visibility: 'author', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('<activity_thread_context')
    expect(prompt).toContain('4,812')                    // what Hermes said last time
    expect(prompt).toContain('draft an email to Will')   // the original question
    expect(prompt).toContain('<current_request>')
    expect(prompt).not.toContain('Thinking about this')  // placeholders carry no content
  })

  it('labels the assistant turns so the model can tell who said what', async () => {
    const ctx = makeEnv(FX)
    const { env, aiRequests } = ctx
    const rootId = await privateThreadWithAnswer(ctx)
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes shorter', actorSlug: 'nate-mesfin', visibility: 'author', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('assistant hermes')
    expect(prompt).toContain('user nate-mesfin')
  })

  // LEAK CLASS. The root arm must admit a private child only when the child's
  // OWN root is author-private AND authored by the requester. A private reply
  // under someone else's TEAM root fails all three arms and must stay invisible.
  it("does NOT leak another member's private reply under a shared team root", async () => {
    const { env, aiRequests } = makeEnv(FX)
    const root = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'team-visible kickoff', actorSlug: 'nick-ingraham',
    })
    if (!root.ok) throw new Error('root failed')
    const rootId = root.row.id as string
    await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'SECRET salary figure', actorSlug: 'nick-ingraham', visibility: 'author', parentId: rootId,
    })
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes summarise this thread', actorSlug: 'nate-mesfin', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('team-visible kickoff')
    expect(prompt).not.toContain('SECRET salary figure')
  })

  it("does NOT leak another member's private day thread into a day-scoped transcript", async () => {
    const { env, aiRequests } = makeEnv(FX)
    await postActivityEntry({
      env, user: NICK, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: 'SECRET morning thought', actorSlug: 'nick-ingraham', visibility: 'author',
    })
    await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes what did we talk about today', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).not.toContain('SECRET morning thought')
  })

  it("day scope DOES recall the requester's own earlier private exchange", async () => {
    const { env, aiRequests, dropPlaceholders } = makeEnv(FX)
    const first = await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes remind me to email Will', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    if (!first.ok) throw new Error('first failed')
    await postActivityEntry({
      env, user: { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' }, entityType: 'day', entityId: '2026-07-24',
      kind: 'comment', body: 'Noted — email Will about the cohort.', actorSlug: 'claude-ai',
      visibility: 'author', parentId: first.row.id as string, fireSideEffects: false,
    })
    dropPlaceholders()
    await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes what was that again', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('email Will about the cohort')
  })
})

describe('handlePostDayActivity — private by default', () => {
  it('a day post defaults to visibility=author (preserves pre-wave privacy)', async () => {
    const { env, ae } = makeEnv(FX)
    const res = await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'plan the morning' }), NATE, env)
    expect(res.status).toBe(201)
    expect(ae[0].visibility).toBe('author')
  })

  it('an explicit share opts into team visibility', async () => {
    const { env, ae } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'team FYI', visibility: 'team' }), NATE, env)
    expect(ae[0].visibility).toBe('team')
  })

  it('rejects a malformed date (400)', async () => {
    const { env } = makeEnv(FX)
    const res = await handlePostDayActivity('2026-7-2', dayPostReq(NON_PI_EMAIL, { content: 'x' }), NATE, env)
    expect(res.status).toBe(400)
  })
})

describe('handleGetDayActivity — private day feed', () => {
  it('rejects a malformed date (400)', async () => {
    const { env } = makeEnv(FX)
    const res = await handleGetDayActivity('not-a-date', userGetReq(NON_PI_EMAIL), env)
    expect(res.status).toBe(400)
  })

  it("the author sees their private day thread; a different non-PI actor does not", async () => {
    const { env } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'my private morning note' }), NATE, env)

    const mine = await handleGetDayActivity('2026-07-22', userGetReq(NON_PI_EMAIL), env)
    const mineBody = await mine.json() as { data: Array<{ body: string }> }
    expect(mineBody.data.some(r => r.body.includes('private morning note'))).toBe(true)

    const theirs = await handleGetDayActivity('2026-07-22', userGetReq('someone-else@umn.edu'), env)
    const theirsBody = await theirs.json() as { data: Array<{ body: string }> }
    expect(theirsBody.data.some(r => r.body.includes('private morning note'))).toBe(false)
  })

  it('the PI sees everyone\'s day threads (Rule 70)', async () => {
    const { env } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'natems private note' }), NATE, env)
    const res = await handleGetDayActivity('2026-07-22', piReq(), env)
    const body = await res.json() as { data: Array<{ body: string }> }
    expect(body.data.some(r => r.body.includes('natems private note'))).toBe(true)
  })
})
