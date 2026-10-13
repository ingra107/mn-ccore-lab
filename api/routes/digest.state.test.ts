/**
 * digest.state.test.ts — Research Digest reading state per person, notes on
 * the card, and a note becoming a task (schema-v136/137, Nick 2026-10-13).
 *
 * Driven through the REAL worker (worker.fetch), so env.DB is the viewer-bound
 * handle and digest_paper_state's own-rows rule is exercised as prod runs it.
 *
 *   - one member's Save / Dismiss is theirs alone; another member still reads 'new'
 *   - 'new' deletes the row; a status write needs a member
 *   - status=saved with no date lists saves across every digest date, newest first
 *   - a viewer handle cannot read another member's state row
 *   - each paper carries note_count and its newest note
 *   - Make task goes through the task-create path, stamps the note, and is idempotent
 *   - the v136 backfill gives today's lab-wide states to their owner
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { noteTaskTitle } from './digest'
import { viewerDb, personViewer, nobodyViewer, serviceViewer } from '../lib/viewer-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'digest-state-api-key'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  insertRow(db, 'research_digest', { id: 'p-old', title: 'Old paper', pmid: '111', relevance_score: 5, digest_date: '2026-09-01', topics: '["sepsis"]' })
  insertRow(db, 'research_digest', { id: 'p-new', title: 'New paper', journal: 'Lancet', pub_date: '2026-10-01', pmid: '222', relevance_score: 9, digest_date: '2026-10-13' })
  insertRow(db, 'research_digest', { id: 'p-mid', title: 'Mid paper', doi: '10.1/mid', relevance_score: 7, digest_date: '2026-10-13' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

async function call(method: string, path: string, who: 'apikey' | 'anon' | string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who !== 'anon') { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, CTX,
  )
  const text = await res.text()
  return { status: res.status, text, json: text ? JSON.parse(text) : null }
}

const setStatus = (who: string, id: string, status: string) => call('POST', `/api/digest/${id}/status`, who, { status })
const statusOf = async (who: string, id: string, qs = 'limit=50') => {
  const { json } = await call('GET', `/api/digest?${qs}`, who)
  return (json.data as Array<{ id: string; status: string }>).find((p) => p.id === id)?.status
}

describe('per-person reading state', () => {
  it("one member's save is theirs alone", async () => {
    expect((await setStatus(NICK, 'p-new', 'saved')).status).toBe(200)
    expect(await statusOf(NICK, 'p-new')).toBe('saved')
    expect(await statusOf(CASEY, 'p-new')).toBe('new')

    expect((await setStatus(CASEY, 'p-new', 'dismissed')).status).toBe(200)
    expect(await statusOf(NICK, 'p-new')).toBe('saved')
    expect(await statusOf(CASEY, 'p-new')).toBe('dismissed')
  })

  it('a second write changes the status, and new deletes the row', async () => {
    await setStatus(NICK, 'p-new', 'saved')
    await setStatus(NICK, 'p-new', 'dismissed')
    expect(db.prepare('SELECT member_slug, status FROM digest_paper_state').all())
      .toEqual([{ member_slug: 'nick-ingraham', status: 'dismissed' }])
    await setStatus(NICK, 'p-new', 'new')
    expect(db.prepare('SELECT COUNT(*) AS n FROM digest_paper_state').get()).toEqual({ n: 0 })
    expect(await statusOf(NICK, 'p-new')).toBe('new')
  })

  it('status filters are per viewer', async () => {
    await setStatus(NICK, 'p-new', 'saved')
    await setStatus(NICK, 'p-mid', 'dismissed')
    const ids = async (who: string, qs: string) =>
      ((await call('GET', `/api/digest?${qs}`, who)).json.data as Array<{ id: string }>).map((p) => p.id).sort()
    expect(await ids(NICK, 'date=2026-10-13&status=new')).toEqual([])
    expect(await ids(CASEY, 'date=2026-10-13&status=new')).toEqual(['p-mid', 'p-new'])
    expect(await ids(NICK, 'date=2026-10-13&status=dismissed')).toEqual(['p-mid'])
  })

  it('refuses an unknown status, an unknown paper, and a caller with no member', async () => {
    expect((await setStatus(NICK, 'p-new', 'read')).status).toBe(400)
    expect((await setStatus(NICK, 'nope', 'saved')).status).toBe(404)
    expect((await call('GET', '/api/digest?status=read', NICK)).status).toBe(400)
    expect([401, 403]).toContain((await setStatus('anon', 'p-new', 'saved')).status)
    expect(db.prepare('SELECT COUNT(*) AS n FROM digest_paper_state').get()).toEqual({ n: 0 })
  })

  it('the PB key writes and reads as Nick', async () => {
    expect((await setStatus('apikey', 'p-old', 'saved')).status).toBe(200)
    expect(await statusOf(NICK, 'p-old')).toBe('saved')
    expect(await statusOf('apikey', 'p-old')).toBe('saved')
    expect(await statusOf(CASEY, 'p-old')).toBe('new')
  })

  it("a member's viewer handle cannot read another member's state row", async () => {
    await setStatus(NICK, 'p-new', 'saved')
    await setStatus(CASEY, 'p-mid', 'saved')
    // Casey's Saved list holds only her own save, never Nick's.
    const saved = (await call('GET', '/api/digest?status=saved', CASEY)).json.data as Array<{ id: string }>
    expect(saved.map((p) => p.id)).toEqual(['p-mid'])
    // The table rule itself, with no member_slug in the SQL: a bare read of
    // the table through each handle sees only that handle's rows.
    const rows = async (v: Parameters<typeof viewerDb>[1]) =>
      ((await viewerDb(d1Adapter(db), v).prepare('SELECT member_slug FROM digest_paper_state ORDER BY member_slug').all()).results as Array<{ member_slug: string }>)
        .map((r) => r.member_slug)
    expect(await rows(personViewer({ slug: 'casey-eddington', email: CASEY, pi: false }))).toEqual(['casey-eddington'])
    expect(await rows(personViewer({ slug: 'nick-ingraham', email: NICK, pi: true, allProjects: true }))).toEqual(['nick-ingraham'])
    expect(await rows(nobodyViewer())).toEqual([])
    expect(await rows(serviceViewer())).toEqual(['casey-eddington', 'nick-ingraham'])
  })

  it('status=saved with no date lists every save across dates, newest first', async () => {
    await setStatus(NICK, 'p-old', 'saved')
    db.prepare("UPDATE digest_paper_state SET updated_at = '2026-09-02T00:00:00.000Z' WHERE paper_id = 'p-old'").run()
    await setStatus(NICK, 'p-mid', 'saved')
    const saved = (await call('GET', '/api/digest?status=saved&limit=300', NICK)).json.data as Array<{ id: string; status: string }>
    expect(saved.map((p) => p.id)).toEqual(['p-mid', 'p-old'])
    expect(saved.every((p) => p.status === 'saved')).toBe(true)
  })

  it('a re-push of a paper leaves every reader state alone', async () => {
    await setStatus(NICK, 'p-new', 'saved')
    await setStatus(CASEY, 'p-new', 'dismissed')
    expect((await call('POST', '/api/digest', 'apikey', { id: 'p-new', title: 'New paper v2', status: 'new' })).status).toBe(201)
    expect(await statusOf(NICK, 'p-new')).toBe('saved')
    expect(await statusOf(CASEY, 'p-new')).toBe('dismissed')
  })

  it('For you matches every paper, not just the first 20', async () => {
    insertRow(db, 'expertise_tags', { id: 'e1', member_slug: 'casey-eddington', tag: 'Sepsis', source: 'manual', confidence: 1 })
    for (let i = 0; i < 25; i++) {
      insertRow(db, 'research_digest', { id: `bulk-${i}`, title: `Bulk ${i}`, relevance_score: 100 - i, digest_date: '2026-09-01' })
    }
    const data = (await call('GET', '/api/digest?date=2026-09-01&with_relevance=true&limit=100', CASEY)).json.data as Array<{ id: string; relevant_members: string[] }>
    expect(data.find((p) => p.id === 'p-old')?.relevant_members).toEqual(['casey-eddington'])
  })
})

describe('notes on the card', () => {
  it('each paper carries note_count and its newest note', async () => {
    expect((await call('POST', '/api/digest/p-new/comments', NICK, { content: 'first' })).status).toBe(201)
    db.prepare("UPDATE digest_comments SET created_at = '2026-10-01 00:00:00'").run()
    expect((await call('POST', '/api/digest/p-new/comments', CASEY, { content: 'get the full text' })).status).toBe(201)
    const data = (await call('GET', '/api/digest?date=2026-10-13', NICK)).json.data as Array<Record<string, unknown>>
    const p = data.find((x) => x.id === 'p-new')!
    expect(p.note_count).toBe(2)
    expect(p.latest_note).toMatchObject({ author_slug: 'casey-eddington', content: 'get the full text', task_id: null, task_visible: false })
    expect(data.find((x) => x.id === 'p-mid')).toMatchObject({ note_count: 0, latest_note: null })
  })

  it('the public shape still strips everything but the card fields', async () => {
    await setStatus(NICK, 'p-new', 'saved')
    const data = (await call('GET', '/api/digest?limit=4', 'anon')).json.data as Array<Record<string, unknown>>
    expect(Object.keys(data[0]).sort()).toEqual(['id', 'journal', 'relevance_score', 'title', 'topics'])
  })
})

describe('Make task from a note', () => {
  async function noteId(content = 'Get the full text: did the pooled analysis have data?') {
    return (await call('POST', '/api/digest/p-new/comments', CASEY, { content })).json.data.id as string
  }

  it('creates a task for the caller through the task-create path and stamps the note', async () => {
    const id = await noteId()
    const res = await call('POST', `/api/digest/comments/${id}/task`, CASEY)
    expect(res.status, res.text).toBe(201)
    const taskId = res.json.data.task_id as string
    expect(taskId).toMatch(/^task_/)
    const task = db.prepare('SELECT title, description, assignee, source, key_link_1, key_link_1_desc FROM tasks WHERE id = ?').get(taskId)
    expect(task).toMatchObject({
      title: 'Get the full text: did the pooled analysis have data?',
      assignee: 'casey-eddington',
      source: 'digest',
      key_link_1: 'https://pubmed.ncbi.nlm.nih.gov/222/',
      key_link_1_desc: 'Paper: New paper',
    })
    expect((task as { description: string }).description).toContain('From the Research Digest: New paper (Lancet, 2026)')
    // The insert went through applyMutation, which records a receipt.
    expect(db.prepare("SELECT COUNT(*) AS n FROM processed_mutations WHERE table_name = 'tasks' AND record_id = ?").get(taskId)).toEqual({ n: 1 })
    expect(db.prepare('SELECT task_id FROM digest_comments WHERE id = ?').get(id)).toEqual({ task_id: taskId })

    // The card now shows the task, as a link for Casey (she can open it).
    const p = ((await call('GET', '/api/digest?date=2026-10-13', CASEY)).json.data as Array<Record<string, unknown>>).find((x) => x.id === 'p-new')!
    expect(p.latest_note).toMatchObject({ task_id: taskId, task_visible: true })
    const thread = (await call('GET', '/api/digest/p-new/comments', CASEY)).json.data as Array<Record<string, unknown>>
    expect(thread[0]).toMatchObject({ task_id: taskId, task_visible: 1 })
  })

  it('a second tap returns the same task, and makes no other', async () => {
    const id = await noteId()
    const first = await call('POST', `/api/digest/comments/${id}/task`, CASEY)
    const again = await call('POST', `/api/digest/comments/${id}/task`, CASEY)
    expect(again.status).toBe(200)
    expect(again.json.data).toEqual({ task_id: first.json.data.task_id, created: false })
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'digest'").get()).toEqual({ n: 1 })
  })

  it('a deleted task frees the note for a new one', async () => {
    const id = await noteId()
    const first = (await call('POST', `/api/digest/comments/${id}/task`, CASEY)).json.data.task_id as string
    db.prepare("UPDATE tasks SET deleted_at = '2026-10-13T00:00:00Z' WHERE id = ?").run(first)
    const second = await call('POST', `/api/digest/comments/${id}/task`, CASEY)
    expect(second.status).toBe(201)
    expect(second.json.data.task_id).not.toBe(first)
  })

  it('an unknown note is a 404 and makes nothing', async () => {
    expect((await call('POST', '/api/digest/comments/nope/task', CASEY)).status).toBe(404)
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'digest'").get()).toEqual({ n: 0 })
  })

  it('the title is the first line, at most 120 characters', () => {
    expect(noteTaskTitle('  one\ntwo')).toBe('one')
    const long = noteTaskTitle('x'.repeat(200))
    expect(long.length).toBe(120)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('schema-v136 backfill', () => {
  // The INSERT exactly as the migration file holds it, run on rows shaped as
  // prod held them before v136 (the chain image is past v137, so the lab-wide
  // columns are put back for this test).
  const v136 = readFileSync(join(__dirname, '..', 'schema-v136-digest-per-person-state-and-note-task.sql'), 'utf8')
  const backfill = v136.match(/INSERT OR IGNORE INTO digest_paper_state[\s\S]*?;/)![0]

  it('gives each lab-wide status to its owner, and new rows produce nothing', () => {
    db.exec("ALTER TABLE research_digest ADD COLUMN status TEXT DEFAULT 'new'; ALTER TABLE research_digest ADD COLUMN saved_by TEXT;")
    db.prepare("UPDATE research_digest SET status = 'saved', saved_by = ? WHERE id = 'p-old'").run(CASEY)
    db.prepare("UPDATE research_digest SET status = 'dismissed' WHERE id = 'p-mid'").run()
    insertRow(db, 'research_digest', { id: 'p-anon', title: 'Anon', digest_date: '2026-09-01', status: 'dismissed' })
    insertRow(db, 'activity_log', { id: 'al1', type: 'digest', description: 'Dismissed digest paper', actor: 'casey-eddington', related_id: 'p-mid', related_type: 'digest', timestamp: '2026-10-08 10:00:00' })
    insertRow(db, 'activity_log', { id: 'al2', type: 'digest', description: 'Dismissed digest paper', actor: 'anonymous', related_id: 'p-anon', related_type: 'digest', timestamp: '2026-10-01 10:00:00' })
    db.exec(backfill)
    expect(db.prepare('SELECT paper_id, member_slug, status, updated_at FROM digest_paper_state ORDER BY paper_id').all()).toEqual([
      { paper_id: 'p-anon', member_slug: 'nick-ingraham', status: 'dismissed', updated_at: '2026-10-01T10:00:00.000Z' },
      { paper_id: 'p-mid', member_slug: 'casey-eddington', status: 'dismissed', updated_at: '2026-10-08T10:00:00.000Z' },
      { paper_id: 'p-old', member_slug: 'casey-eddington', status: 'saved', updated_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
    ])
  })
})
