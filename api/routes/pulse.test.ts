/**
 * pulse.test.ts — the What's new / Lab pulse routes (#156, schema-v148).
 *
 * What is easy to get wrong and invisible in the UI:
 *   - a non-PI member must never see a draft (the TABLE_SCOPE rule, read
 *     through a real viewer handle here, not a stub);
 *   - the API key may write a draft's words but never approve it: approval
 *     is a signed-in PI PERSON (index.ts personPi: not the API key, not the
 *     shared TEST_MODE_KEY identity), handed to the handler as `actor`;
 *   - approve publishes only the words and commits Nick reviewed (409 if a
 *     session or a deploy changed the draft since);
 *   - one pending draft: a second deploy extends it; discarded commits are
 *     never offered again.
 * Auth runs through the real helpers with the TEST_MODE_KEY + X-Test-User
 * bypass, on the migration-chain database.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { labPulseCounts } from '../lib/pulse-aggregates'
import {
  handleGetPulse, handleReleaseIntake, handleUpdateRelease,
  handleCreateAnnouncement, handleDeleteAnnouncement,
} from './pulse'
import type { PulsePayload } from '../../shared/pulse'

const TEST_KEY = 'test-mode-key-156'
const API_KEY = 'pb-key-156'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'eddin022@umn.edu'
const CASEY = personViewer({ slug: 'casey-eddington', email: MEMBER_EMAIL, pi: false })
const NICK = personViewer({ slug: 'nick-ingraham', email: PI_EMAIL, pi: true })

let db: InstanceType<typeof Database>
let raw: D1Database

beforeEach(() => {
  db = prodSchemaDb()
  raw = d1Adapter(db) as unknown as D1Database
  _resetPiEmailsCacheForTests()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  for (const [id, name, slug, email] of [['m1', 'Casey Eddington', 'casey-eddington', MEMBER_EMAIL], ['m2', 'Nick Ingraham', 'nick-ingraham', PI_EMAIL]]) {
    if (!db.prepare('SELECT 1 FROM team_members WHERE slug = ?').get(slug)) insertRow(db, 'team_members', { id, name, slug, email })
  }
})

const envFor = (handle: D1Database): Env => ({ DB: handle, TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY } as unknown as Env)
const asUser = (email: string) => ({ 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': email })
const asKey = { Authorization: `Bearer ${API_KEY}` }
function req(path: string, headers: Record<string, string>, body?: unknown): Request {
  return new Request(`https://mn-ccore-lab.pages.dev${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const counts = (args: { nowIso: string; weekStartIso: string }) => labPulseCounts(raw, args)
async function pulseAs(viewer: typeof CASEY, email: string): Promise<PulsePayload> {
  const res = await handleGetPulse(req('/api/pulse', asUser(email)), envFor(viewerDb(raw, viewer)), counts)
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: PulsePayload }).data
}
const release = (id: string, status: string, from: string, to: string, extra: Record<string, unknown> = {}) =>
  insertRow(db, 'hub_releases', { id, status, commit_from: from, commit_to: to, ...extra })
const row = (id: string) => db.prepare('SELECT * FROM hub_releases WHERE id = ?').get(id) as Record<string, string>
const commits = (...shas: string[]) => shas.map((sha) => ({ sha, subject: `subject ${sha}` }))

const NICK_ACT = { piPerson: true, slug: 'nick-ingraham' as string | null }
const MEMBER_ACT = { piPerson: false, slug: 'casey-eddington' as string | null }
const KEY_ACT = { piPerson: false, slug: null as string | null }
type Act = typeof NICK_ACT

describe('GET /api/pulse', () => {
  it('an empty lab answers nulls and zeros', async () => {
    const p = await pulseAs(CASEY, MEMBER_EMAIL)
    expect(p).toMatchObject({ release: null, pastReleases: [], draft: null, announcement: null, active: [], tasksDone: 0, milestonesHit: 0, newPapers: 0, wins: [] })
  })
  it('a non-PI member never sees the draft; the PI does', async () => {
    release('rel_01A', 'approved', 'a', 'b', { title: 'Old', blurbs_json: '[{"lead":"L","text":"T"}]', approved_at: '2026-10-20T00:00:00.000Z' })
    release('rel_01B', 'approved', 'b', 'c', { title: 'New', blurbs_json: '[{"lead":"L","text":"T"}]', approved_at: '2026-10-25T00:00:00.000Z' })
    release('rel_01C', 'draft', 'c', 'd', { title: 'Draft' })
    const casey = await pulseAs(CASEY, MEMBER_EMAIL)
    expect(casey.draft).toBeNull()
    expect(casey.release?.id).toBe('rel_01B')
    expect(casey.release?.blurbs).toEqual([{ lead: 'L', text: 'T' }])
    expect(casey.pastReleases.map((r) => r.id)).toEqual(['rel_01A'])
    const nick = await pulseAs(NICK, PI_EMAIL)
    expect(nick.draft?.id).toBe('rel_01C')
  })
  it('shows the newest live announcement from the last 14 days', async () => {
    insertRow(db, 'hub_announcements', { id: 'ann_old', body: 'old', author_slug: 'nick-ingraham', created_at: '2020-01-01T00:00:00.000Z' })
    insertRow(db, 'hub_announcements', { id: 'ann_new', body: 'Retreat moved', author_slug: 'nick-ingraham' })
    expect((await pulseAs(CASEY, MEMBER_EMAIL)).announcement).toMatchObject({ id: 'ann_new', body: 'Retreat moved', authorSlug: 'nick-ingraham' })
  })
})

describe('POST /api/releases (deploy intake, API key only)', () => {
  const intake = (body: unknown, headers: Record<string, string> = asKey) => handleReleaseIntake(req('/api/releases', headers, body), envFor(raw))

  it('refuses a signed-in member, even the PI', async () => {
    expect((await intake({ probe: true }, asUser(PI_EMAIL))).status).toBe(403)
  })
  it('creates one draft, then extends it, deduping by sha', async () => {
    const a = await (await intake({ commitTo: 's2', commits: commits('s1', 's2') })).json() as { data: { id: string; created: boolean } }
    expect(a.data.created).toBe(true)
    const b = await (await intake({ commitTo: 's3', commits: commits('s2', 's3') })).json() as { data: { id: string; created: boolean } }
    expect(b.data).toEqual({ id: a.data.id, created: false })
    expect(db.prepare("SELECT COUNT(*) AS n FROM hub_releases WHERE status = 'draft'").get()).toEqual({ n: 1 })
    expect(JSON.parse(row(a.data.id).commits_json).map((c: { sha: string }) => c.sha)).toEqual(['s1', 's2', 's3'])
    expect(row(a.data.id).commit_to).toBe('s3')
    expect(a.data.id).toMatch(/^rel_[0-9A-Z]{26}$/)
  })
  it('after a discard, the next draft starts where the discarded one ended, and probe reports it', async () => {
    release('rel_01X', 'discarded', 'a', 'z9')
    const probe = await (await intake({ probe: true })).json() as { data: { lastCommitTo: string | null } }
    expect(probe.data.lastCommitTo).toBe('z9')
    expect(db.prepare('SELECT COUNT(*) AS n FROM hub_releases').get()).toEqual({ n: 1 })
    const c = await (await intake({ commitTo: 'z10', commits: commits('z10') })).json() as { data: { id: string } }
    expect(row(c.data.id).commit_from).toBe('z9')
  })
  it('writes nothing for an empty commit list', async () => {
    const res = await intake({ commitTo: 'x', commits: [] })
    expect(await res.json()).toEqual({ data: null })
    expect(db.prepare('SELECT COUNT(*) AS n FROM hub_releases').get()).toEqual({ n: 0 })
  })
})

describe('POST /api/releases/:id', () => {
  const update = (id: string, body: unknown, headers: Record<string, string>, actor: Act) =>
    handleUpdateRelease(id, req(`/api/releases/${id}`, headers, body), envFor(raw), actor)
  const blurbs = [{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }]
  /** What Nick's panel sends with Approve: the draft as he read it. */
  const reviewed = (id: string) => {
    const r = row(id)
    return { action: 'approve', reviewed: { commitTo: r.commit_to, title: r.title, blurbs: JSON.parse(r.blurbs_json) } }
  }

  it('the API key can write words but cannot approve or discard', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'Smoother Today', blurbs }, asKey, KEY_ACT)).status).toBe(200)
    expect((await update('rel_01D', reviewed('rel_01D'), asKey, KEY_ACT)).status).toBe(403)
    expect((await update('rel_01D', { action: 'discard' }, asKey, KEY_ACT)).status).toBe(403)
    expect(row('rel_01D').status).toBe('draft')
  })
  it('a non-PI member can do none of it', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs }, asUser(MEMBER_EMAIL), MEMBER_ACT)).status).toBe(403)
  })
  it('approve needs a title and a blurb, then stamps who approved', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    const bad = await update('rel_01D', reviewed('rel_01D'), {}, NICK_ACT)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'needs_blurbs' })
    await update('rel_01D', { action: 'edit', title: 'Smoother Today', blurbs }, {}, NICK_ACT)
    expect((await update('rel_01D', reviewed('rel_01D'), {}, NICK_ACT)).status).toBe(200)
    expect(row('rel_01D')).toMatchObject({ status: 'approved', approved_by: 'nick-ingraham' })
    expect(row('rel_01D').approved_at).toBeTruthy()
  })
  it('approve refuses a draft that changed since Nick read it', async () => {
    release('rel_01D', 'draft', 'a', 'b', { title: 'Smoother Today', blurbs_json: JSON.stringify(blurbs) })
    const asRead = reviewed('rel_01D')
    // a deploy appends commits meanwhile
    await handleReleaseIntake(req('/api/releases', asKey, { commitTo: 'c9', commits: [{ sha: 'c9', subject: 's' }] }), envFor(raw))
    const stale = await update('rel_01D', asRead, {}, NICK_ACT)
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: 'changed_since_review' })
    // a session rewrites a blurb meanwhile
    const asRead2 = reviewed('rel_01D')
    await update('rel_01D', { action: 'edit', title: 'Smoother Today', blurbs: [{ lead: 'Other.', text: 'Words.' }] }, asKey, KEY_ACT)
    expect((await update('rel_01D', asRead2, {}, NICK_ACT)).status).toBe(409)
    // approve without saying what was read is refused outright
    expect((await update('rel_01D', { action: 'approve' }, {}, NICK_ACT)).status).toBe(400)
    expect(row('rel_01D').status).toBe('draft')
  })
  it('edit may save a title before any blurb exists; at most 4 blurbs, a title of at most 80', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs: [] }, asKey, KEY_ACT)).status).toBe(200)
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs: Array(5).fill(blurbs[0]) }, asKey, KEY_ACT)).status).toBe(400)
    expect((await update('rel_01D', { action: 'edit', title: 'x'.repeat(81), blurbs }, asKey, KEY_ACT)).status).toBe(400)
  })
  it('only a draft changes', async () => {
    release('rel_01A', 'approved', 'a', 'b', { title: 't', blurbs_json: JSON.stringify(blurbs) })
    expect((await update('rel_01A', { action: 'discard' }, {}, NICK_ACT)).status).toBe(409)
    expect((await update('rel_none', { action: 'discard' }, {}, NICK_ACT)).status).toBe(404)
  })
  it('the routes hand the handler personPi, which refuses the API key and the TEST_MODE_KEY identity', () => {
    const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
    for (const path of ["'/api/releases/:id'", "'/api/announcements'", "'/api/announcements/:id/delete'"]) {
      const start = src.indexOf(`path: ${path},`)
      expect(start, path).toBeGreaterThan(-1)
      expect(src.slice(start, src.indexOf('defineRoute(', start)), path).toContain('pulseActor(c)')
    }
    expect(src).toContain("const pulseActor = (c: Context<AppEnv>) => ({ piPerson: personPi(c), slug: USER(c)?.slug ?? null })")
    expect(src).toMatch(/const personPi = \(c: Context<AppEnv>\) =>\s*c\.get\('isPi'\) === true && c\.get\('apiKeyValid'\) !== true && !isTestModeRequest/)
  })
})

describe('announcements', () => {
  const post = (body: unknown, actor: Act) => handleCreateAnnouncement(req('/api/announcements', {}, body), envFor(raw), actor)
  it('only a signed-in PI posts, 1-280 chars after trimming', async () => {
    expect((await post({ body: 'hi' }, MEMBER_ACT)).status).toBe(403)
    expect((await post({ body: 'hi' }, KEY_ACT)).status).toBe(403)
    expect((await post({ body: 'x'.repeat(281) }, NICK_ACT)).status).toBe(400)
    expect((await post({ body: '   ' }, NICK_ACT)).status).toBe(400)
    expect((await post({ body: `  ${'x'.repeat(280)}  ` }, NICK_ACT)).status).toBe(200)
    const ok = await post({ body: 'Retreat moved to Nov 14' }, NICK_ACT)
    expect(ok.status).toBe(200)
    const id = ((await ok.json()) as { data: { id: string } }).data.id
    expect(id).toMatch(/^ann_/)
    expect(db.prepare('SELECT author_slug FROM hub_announcements WHERE id = ?').get(id)).toEqual({ author_slug: 'nick-ingraham' })
  })
  it('delete hides it from the pulse', async () => {
    insertRow(db, 'hub_announcements', { id: 'ann_1', body: 'x', author_slug: 'nick-ingraham' })
    expect((await handleDeleteAnnouncement('ann_1', envFor(raw), MEMBER_ACT)).status).toBe(403)
    expect((await handleDeleteAnnouncement('ann_1', envFor(raw), NICK_ACT)).status).toBe(200)
    expect((await pulseAs(CASEY, MEMBER_EMAIL)).announcement).toBeNull()
  })
})

describe('GET /api/pulse wins', () => {
  it('sorts a date-only stamp with the rest instead of scrambling the order', async () => {
    // eslint-disable-next-line local/time-discipline -- fixture writes a stored UTC stamp, as the DB holds it
    insertRow(db, 'publications', { id: 'p1', title: 'Newer paper', authors: 'a', created_at: new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ') })
    // eslint-disable-next-line local/time-discipline -- fixture writes a stored UTC stamp, as the DB holds it
    insertRow(db, 'tasks', { id: 'm1', title: 'Older milestone', assignee: 'casey-eddington', kind: 'milestone', status: 'done', completed: 1, completed_at: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10) })
    const wins = (await pulseAs(CASEY, MEMBER_EMAIL)).wins
    expect(wins.map((w) => w.title)).toEqual(['Newer paper', 'Older milestone'])
  })
})

describe('code-review fixes (#156 session close)', () => {
  const blurbs = [{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }]

  it('approve publishes nothing if the draft changes between its read and its write', async () => {
    release('rel_01D', 'draft', 'a', 'b', { title: 'Smoother Today', blurbs_json: JSON.stringify(blurbs) })
    let raced = false
    const racing = d1Adapter(db, {
      onExec: (sql) => {
        if (!raced && /UPDATE hub_releases SET status = 'approved'/.test(sql)) {
          raced = true
          db.prepare("UPDATE hub_releases SET commit_to = 'c99' WHERE id = 'rel_01D'").run()
        }
      },
    }) as unknown as D1Database
    const res = await handleUpdateRelease('rel_01D', req('/api/releases/rel_01D', {}, {
      action: 'approve', reviewed: { commitTo: 'b', title: 'Smoother Today', blurbs },
    }), envFor(racing), NICK_ACT)
    expect(res.status).toBe(409)
    expect(row('rel_01D').status).toBe('draft')
  })

  it('two deploys racing to open the draft both land in the one draft', async () => {
    let raced = false
    const racing = d1Adapter(db, {
      onExec: (sql) => {
        if (!raced && /INSERT INTO hub_releases/.test(sql)) {
          raced = true
          db.prepare("INSERT INTO hub_releases (id, status, commit_from, commit_to, commits_json) VALUES ('rel_01R', 'draft', 'a', 'r1', ?)").run(JSON.stringify([{ sha: 'r1', subject: 'other deploy' }]))
        }
      },
    }) as unknown as D1Database
    const res = await handleReleaseIntake(req('/api/releases', asKey, { commitTo: 's2', commits: [{ sha: 's2', subject: 'mine' }] }), envFor(racing))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { id: string; created: boolean } }).data).toEqual({ id: 'rel_01R', created: false })
    expect(JSON.parse(row('rel_01R').commits_json).map((c: { sha: string }) => c.sha)).toEqual(['r1', 's2'])
    expect(row('rel_01R').commit_to).toBe('s2')
  })

  it('recent wins leave out a bulk sync, as the papers count does', async () => {
    // eslint-disable-next-line local/time-discipline -- fixture writes a stored UTC stamp, as the DB holds it
    const stamp = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
    for (let i = 0; i < 6; i++) insertRow(db, 'publications', { id: `bulk${i}`, title: `Bulk ${i}`, authors: 'a', created_at: stamp })
    // eslint-disable-next-line local/time-discipline -- fixture writes a stored UTC stamp, as the DB holds it
    insertRow(db, 'publications', { id: 'real', title: 'Real paper', authors: 'a', created_at: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ') })
    const p = await pulseAs(CASEY, MEMBER_EMAIL)
    expect(p.wins.map((w) => w.title)).toEqual(['Real paper'])
    expect(p.newPapers).toBe(1)
  })

  it('pulse writes do not make every open tab refetch the lab', () => {
    const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
    for (const path of ["'/api/releases/:id'", "'/api/announcements'", "'/api/announcements/:id/delete'"]) {
      const start = src.indexOf(`path: ${path},`)
      expect(src.slice(start, src.indexOf('defineRoute(', start)), path).toContain('noVersionBump: true')
    }
  })
})
