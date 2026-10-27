/**
 * pulse.test.ts — the What's new / Lab pulse routes (#156, schema-v148).
 *
 * What is easy to get wrong and invisible in the UI:
 *   - a non-PI member must never see a draft (the TABLE_SCOPE rule, read
 *     through a real viewer handle here, not a stub);
 *   - the API key may write a draft's words but never approve it: approval
 *     is a signed-in PI identity (isPiIdentity), not isPiRequest;
 *   - one pending draft: a second deploy extends it; discarded commits are
 *     never offered again.
 * Auth runs through the real helpers with the TEST_MODE_KEY + X-Test-User
 * bypass, on the migration-chain database.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Env } from '../helpers'
import { isPiIdentity, _resetPiEmailsCacheForTests } from '../helpers'
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

describe('isPiIdentity', () => {
  it('is false for the API key alone and true for a signed-in PI', async () => {
    const env = envFor(raw)
    expect(await isPiIdentity(req('/x', asKey), env)).toBe(false)
    expect(await isPiIdentity(req('/x', asUser(PI_EMAIL)), env)).toBe(true)
    expect(await isPiIdentity(req('/x', asUser(MEMBER_EMAIL)), env)).toBe(false)
  })
})

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
  const update = (id: string, body: unknown, headers: Record<string, string>) => handleUpdateRelease(id, req(`/api/releases/${id}`, headers, body), envFor(raw))
  const blurbs = [{ lead: 'One collapse per meeting.', text: 'The caret folds action items too.' }]

  it('the API key can write words but cannot approve or discard', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'Smoother Today', blurbs }, asKey)).status).toBe(200)
    expect((await update('rel_01D', { action: 'approve' }, asKey)).status).toBe(403)
    expect((await update('rel_01D', { action: 'discard' }, asKey)).status).toBe(403)
    expect(row('rel_01D').status).toBe('draft')
  })
  it('a non-PI member can do none of it', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs }, asUser(MEMBER_EMAIL))).status).toBe(403)
  })
  it('approve needs a title and a blurb, then stamps who approved', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    const bad = await update('rel_01D', { action: 'approve' }, asUser(PI_EMAIL))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'needs_blurbs' })
    await update('rel_01D', { action: 'edit', title: 'Smoother Today', blurbs }, asUser(PI_EMAIL))
    expect((await update('rel_01D', { action: 'approve' }, asUser(PI_EMAIL))).status).toBe(200)
    expect(row('rel_01D')).toMatchObject({ status: 'approved', approved_by: 'nick-ingraham' })
    expect(row('rel_01D').approved_at).toBeTruthy()
  })
  it('validates the words: 1-4 blurbs, a title of at most 80', async () => {
    release('rel_01D', 'draft', 'a', 'b')
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs: [] }, asKey)).status).toBe(400)
    expect((await update('rel_01D', { action: 'edit', title: 'x', blurbs: Array(5).fill(blurbs[0]) }, asKey)).status).toBe(400)
    expect((await update('rel_01D', { action: 'edit', title: 'x'.repeat(81), blurbs }, asKey)).status).toBe(400)
  })
  it('only a draft changes', async () => {
    release('rel_01A', 'approved', 'a', 'b', { title: 't', blurbs_json: JSON.stringify(blurbs) })
    expect((await update('rel_01A', { action: 'discard' }, asUser(PI_EMAIL))).status).toBe(409)
    expect((await update('rel_none', { action: 'discard' }, asUser(PI_EMAIL))).status).toBe(404)
  })
})

describe('announcements', () => {
  const post = (body: unknown, headers: Record<string, string>) => handleCreateAnnouncement(req('/api/announcements', headers, body), envFor(raw))
  it('only a signed-in PI posts, 1-280 chars', async () => {
    expect((await post({ body: 'hi' }, asUser(MEMBER_EMAIL))).status).toBe(403)
    expect((await post({ body: 'hi' }, asKey)).status).toBe(403)
    expect((await post({ body: 'x'.repeat(281) }, asUser(PI_EMAIL))).status).toBe(400)
    expect((await post({ body: '   ' }, asUser(PI_EMAIL))).status).toBe(400)
    const ok = await post({ body: 'Retreat moved to Nov 14' }, asUser(PI_EMAIL))
    expect(ok.status).toBe(200)
    const id = ((await ok.json()) as { data: { id: string } }).data.id
    expect(id).toMatch(/^ann_/)
    expect(db.prepare('SELECT author_slug FROM hub_announcements WHERE id = ?').get(id)).toEqual({ author_slug: 'nick-ingraham' })
  })
  it('delete hides it from the pulse', async () => {
    insertRow(db, 'hub_announcements', { id: 'ann_1', body: 'x', author_slug: 'nick-ingraham' })
    expect((await handleDeleteAnnouncement('ann_1', req('/api/announcements/ann_1/delete', asUser(MEMBER_EMAIL), {}), envFor(raw))).status).toBe(403)
    expect((await handleDeleteAnnouncement('ann_1', req('/api/announcements/ann_1/delete', asUser(PI_EMAIL), {}), envFor(raw))).status).toBe(200)
    expect((await pulseAs(CASEY, MEMBER_EMAIL)).announcement).toBeNull()
  })
})
