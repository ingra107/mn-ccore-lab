/**
 * api/routes/project-join.test.ts -- requests to join a project (schema-v139).
 *
 * Drives the REAL worker (full middleware, viewer-bound handle, migrated
 * schema with the v139 triggers). Nick, 2026-10-13: members "can request to
 * get added to projects where I can [say] yes through a [Telegram] message or
 * on my today page ... but Nate and I need to approve that". Either approver's
 * first answer adds the member; before joining, a member sees only the
 * project's name, a one-line description and its PI. Review rulings the same
 * day: Browse lists "All but Friends + a hide switch"; a Telegram 'Other'
 * "Stays pending".
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { questionRowError, questionConsumedError } from '../lib/task-question'
import { submitJoinRequest } from '../lib/project-join'
import { personViewer, viewerDb } from '../lib/viewer-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'project-join-test-api-key'
const NICK = 'ingra107@umn.edu'
const NATE = 'mesfin@umn.edu'
const CASEY = 'eddin022@umn.edu'

// P_OPEN: Nick is PI and member; Casey is not on it. It carries secrets a
// non-member must never read: its description, next action and a task.
const P_OPEN = 'proj_joinopen'
const P_WAIT = 'proj_joinwait'
const P_CASEY = 'proj_joincasey'
const P_NATE = 'proj_joinnate' // Nate is its PI; Nick is not on it
const P_DONE = 'proj_joindone'
const P_BLOCKED = 'proj_joinblocked'
const P_PB = 'proj_joinpb'
const P_DEL = 'proj_joindel'
const P_FRIENDS = 'proj_joinfriends'

let db: InstanceType<typeof Database>
let env: Env

function seed(recursive = false) {
  db = prodSchemaDb()
  if (recursive) db.pragma('recursive_triggers = ON')
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK, photo_url: 'https://x.test/nick.jpg' })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', role: 'Fellow', member_type: 'director', email: NATE })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: CASEY })
  const proj = (id: string, title: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'projects', { id, slug: id.replace('proj_', ''), title, description: `SECRETDESC ${title}`, category: 'MNCCORE', status: 'active', next_action: 'SECRETNEXT', ...extra })
  proj(P_OPEN, 'Open Study', { pi: 'nick-ingraham', short_name: 'Open' })
  proj(P_WAIT, 'Waiting Study', { status: 'waiting_external' })
  proj(P_CASEY, 'Casey Study')
  proj(P_NATE, 'Nate Study', { pi: 'nate-mesfin' })
  proj(P_DONE, 'Done Study', { status: 'done' })
  proj(P_BLOCKED, 'Blocked Study', { status: 'blocked' })
  proj(P_PB, 'PB Admin', { category: 'Peripheral Brain' })
  proj(P_FRIENDS, 'Friends Study', { type: 'Friends' })
  insertRow(db, 'projects', { id: P_DEL, slug: 'joindel', title: 'Deleted Study', category: 'MNCCORE', status: 'active', deleted_at: '2026-09-01 00:00:00' })
  for (const p of [P_OPEN, P_WAIT, P_CASEY, P_DONE, P_BLOCKED, P_PB, P_FRIENDS]) {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, 'nick-ingraham', 'test')").run(p)
  }
  insertRow(db, 'project_members', { project_id: P_CASEY, member_slug: 'casey-eddington', added_by: 'test' })
  insertRow(db, 'tasks', { id: 'task_secret', project_id: P_OPEN, title: 'SECRETTASK', assignee: 'nick-ingraham' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
}

// The migrated image is built once per worker; on a loaded machine that cold
// build can pass the 10s hook limit, so it is warmed here with room to spare.
beforeAll(() => { prodSchemaDb() }, 120_000)
beforeEach(() => seed())

async function call(method: string, path: string, who: 'apikey' | 'anon' | string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra }
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who !== 'anon') { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, CTX)
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, text, json }
}

const ask = (who: string, projectId: string, note?: string) =>
  call('POST', `/api/projects/${projectId}/join-request`, who, note === undefined ? {} : { note })
const decide = (who: string, id: string, decision: 'approve' | 'decline' | 'close', note?: string) =>
  call('POST', `/api/join-requests/${id}/decision`, who, note === undefined ? { decision } : { decision, note })

const request = (id: string) => db.prepare('SELECT * FROM project_join_requests WHERE id = ?').get(id) as Record<string, any>
/** The request's question row, found by the key the triggers use. */
const question = (requestId: string) => db.prepare(
  "SELECT * FROM tasks WHERE source = 'project_join' AND json_extract(question_spec_json, '$.choices[0].payload.request_id') = ?",
).get(requestId) as Record<string, any> | undefined
const isMember = (p: string, s: string) => !!db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND member_slug = ?').get(p, s)
const notes = (s: string) => db.prepare("SELECT * FROM notifications WHERE recipient_slug = ? AND source_type = 'project_join'").all(s) as Record<string, any>[]
const directoryIds = async (who: string) => ((await call('GET', '/api/project-directory', who)).json.data as any[]).map((e) => e.project_id).sort()

/** PB's Telegram tap: the answer written Hub-first through /api/mutations with the PB key. */
async function telegramAnswer(taskId: string, answer: Record<string, unknown> | null, n = 1) {
  const r = await call('POST', '/api/mutations', 'apikey', {
    mutations: [{
      mutation_id: `mut_tg_${taskId}_${n}`, origin_machine: 'home', table: 'tasks', record_id: taskId, op: 'update',
      base_seq: null, base_row_hash: null, depends_on: null,
      patch: { question_answer_json: answer === null ? null : JSON.stringify(answer) },
      client_ts: '2026-10-13T15:00:00Z', issued_at: '2026-10-13T15:00:00Z',
    }],
  })
  return r.json?.results?.[0] ?? r.json
}

const ENTRY_KEYS = ['blurb', 'decided_at', 'decided_note', 'name', 'pi_name', 'pi_photo', 'pi_slug', 'project_id', 'request_id', 'retry_after', 'state']

describe('the directory: what a member who is not on a project may see', () => {
  it('lists active and waiting projects; not done, blocked, deleted, Peripheral Brain or Friends ones', async () => {
    expect(await directoryIds(CASEY)).toEqual([P_CASEY, P_NATE, P_OPEN, P_WAIT].sort())
  })

  it('a non-member row carries the name, blurb and PI (with photo), and no other field', async () => {
    const r = await call('GET', '/api/project-directory', CASEY)
    for (const e of r.json.data) expect(Object.keys(e).sort(), e.project_id).toEqual(ENTRY_KEYS)
    const open = r.json.data.find((e: any) => e.project_id === P_OPEN)
    expect(open).toMatchObject({ name: 'Open', pi_slug: 'nick-ingraham', pi_name: 'Nick Ingraham', pi_photo: 'https://x.test/nick.jpg', blurb: null, state: 'none' })
    expect(r.json.data.find((e: any) => e.project_id === P_CASEY).state).toBe('member')
    expect(r.text).not.toContain('SECRETDESC')
    expect(r.text).not.toContain('SECRETNEXT')
    expect(r.text).not.toContain('SECRETTASK')
  })

  it('an anonymous caller gets nothing', async () => {
    const r = await call('GET', '/api/project-directory', 'anon')
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.text).not.toContain('Open')
  })
})

describe('the hide switch: Nick or the project PI takes a project out of Browse', () => {
  it('Nick hides a project; it leaves the directory and refuses new requests', async () => {
    const r = await call('PUT', `/api/projects/${P_WAIT}/listing`, NICK, { hidden: true })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ hidden: true, can_hide: true })
    expect(await directoryIds(CASEY)).not.toContain(P_WAIT)
    expect((await ask(CASEY, P_WAIT)).status).toBe(404)
    // Show it again.
    expect((await call('PUT', `/api/projects/${P_WAIT}/listing`, NICK, { hidden: false })).json.data.hidden).toBe(false)
    expect(await directoryIds(CASEY)).toContain(P_WAIT)
  })

  it("the project's PI hides it (Nate on his own project, with Nick not on it)", async () => {
    const r = await call('PUT', `/api/projects/${P_NATE}/listing`, NATE, { hidden: true })
    expect(r.status).toBe(200)
    expect(await directoryIds(CASEY)).not.toContain(P_NATE)
  })

  it('a member who is not the PI may set the blurb but not the switch, by route or by table', async () => {
    const g = await call('GET', `/api/projects/${P_CASEY}/listing`, CASEY)
    expect(g.json.data).toMatchObject({ hidden: false, can_hide: false })
    const r = await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { hidden: true })
    expect(r.status).toBe(403)
    expect(await directoryIds(CASEY)).toContain(P_CASEY)
    expect(() => db.prepare("INSERT INTO project_listing (project_id, hidden, hidden_by, updated_by) VALUES (?, 1, 'casey-eddington', 'x')").run(P_CASEY))
      .toThrow(/listing_hide_forbidden/)
  })
})

describe('asking to join', () => {
  it('creates one pending request and one Telegram question for Nick that the requester cannot read', async () => {
    const r = await ask(CASEY, P_OPEN, 'I can run the models')
    expect(r.status).toBe(201)
    expect(r.json.telegram).toBe('sent')
    const req = request(r.json.data.id)
    expect(req).toMatchObject({ project_id: P_OPEN, requester_slug: 'casey-eddington', status: 'pending', note: 'I can run the models' })
    const q = question(req.id)!
    expect(q).toMatchObject({ kind: 'question', source: 'project_join', assignee: 'nick-ingraham', project_id: null, assigned_by: null, status: 'todo' })
    expect(questionRowError(q)).toBeNull()
    const spec = JSON.parse(q.question_spec_json)
    expect(spec.choices.map((c: any) => c.key)).toEqual(['approve', 'decline', 'other'])
    expect(spec.prompt).toContain('Casey Eddington asks to join Open')
    expect((await call('GET', `/api/tasks/${q.id}`, CASEY)).status).toBe(404)
    expect((await call('GET', '/api/tasks?kind=question', CASEY)).text).not.toContain(q.id)
    expect((await call('GET', `/api/tasks/${q.id}`, NICK)).status).toBe(200)
    expect((await call('GET', `/api/projects/${P_OPEN}`, CASEY)).status).toBe(404)
  })

  it('a duplicate pending request returns the first, with no second row or question', async () => {
    const a = await ask(CASEY, P_OPEN)
    const b = await ask(CASEY, P_OPEN)
    expect(b.status).toBe(200)
    expect(b.json.created).toBe(false)
    expect(b.json.telegram).toBe('exists')
    expect(b.json.data.id).toBe(a.json.data.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_join_requests WHERE project_id = ?').get(P_OPEN)).toEqual({ n: 1 })
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'project_join'").get()).toEqual({ n: 1 })
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('dup', ?, 'casey-eddington')").run(P_OPEN))
      .toThrow(/UNIQUE/)
  })

  it('a failed mint leaves no dangling link; the next ask reissues the question, once', async () => {
    const failing = async () => ({ ok: false as const, reason: 'simulated outage' })
    const asCasey = viewerDb(env.DB, personViewer({ slug: 'casey-eddington', email: CASEY, pi: false }))
    const out = await submitJoinRequest(asCasey, {
      projectId: P_OPEN, requester: { slug: 'casey-eddington', name: 'Casey Eddington' }, note: null,
      user: { email: CASEY, slug: 'casey-eddington' } as never, mint: failing,
    })
    expect(out).toMatchObject({ kind: 'created', telegram: 'failed' })
    const id = (out as { request: { id: string } }).request.id
    expect(request(id).status).toBe('pending')
    expect(question(id)).toBeUndefined()
    const again = await ask(CASEY, P_OPEN)
    expect(again.json).toMatchObject({ created: false, telegram: 'sent' })
    expect(question(id)).toBeDefined()
    expect((await ask(CASEY, P_OPEN)).json.telegram).toBe('exists')
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'project_join'").get()).toEqual({ n: 1 })
  })

  it('a request for a project you are already on is refused, by the route and by the database', async () => {
    const r = await ask(CASEY, P_CASEY)
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('member')
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_join_requests').get()).toEqual({ n: 0 })
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('m', ?, 'casey-eddington')").run(P_CASEY))
      .toThrow(/join_already_member/)
  })

  it('an unlisted project (done, blocked, Peripheral Brain, Friends, deleted, unknown) answers 404 and writes nothing', async () => {
    for (const p of [P_DONE, P_PB, P_DEL, P_BLOCKED, P_FRIENDS, 'proj_nope']) expect((await ask(CASEY, p)).status, p).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_join_requests').get()).toEqual({ n: 0 })
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('x', ?, 'casey-eddington')").run(P_FRIENDS))
      .toThrow(/join_not_listed/)
  })

  it('a note over 280 characters is a 400', async () => {
    expect((await ask(CASEY, P_OPEN, 'x'.repeat(281))).status).toBe(400)
  })
})

describe('deciding: Nick or Nate, first answer wins', () => {
  it("Nate approves on Today: Casey joins, Nick's card says by Nate, a receipt closes it, Casey is notified", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const list = await call('GET', '/api/join-requests', NATE)
    expect(list.status).toBe(200)
    expect(list.json.data).toHaveLength(1)
    expect(list.json.data[0]).toMatchObject({ id, listed: 1, project_name: 'Open', requester_name: 'Casey Eddington', status: 'pending', director_note: null })
    expect(isMember(P_OPEN, 'nate-mesfin')).toBe(false)

    expect((await decide(NATE, id, 'approve')).status).toBe(200)
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nate-mesfin', decided_via: 'hub' })
    expect(db.prepare('SELECT added_by FROM project_members WHERE project_id = ? AND member_slug = ?').get(P_OPEN, 'casey-eddington'))
      .toEqual({ added_by: 'join:nate-mesfin' })
    const q = question(id)!
    expect(q).toMatchObject({ status: 'done', completed: 1, completed_by: 'nate-mesfin' })
    const answer = JSON.parse(q.question_answer_json)
    expect(answer).toMatchObject({ v: 1, choice: 'approve', via: 'hub', text: 'by Nate Mesfin' })
    expect(JSON.parse(q.question_consumed_json)).toMatchObject({ v: 1, consumer: 'project_join', answer_at: answer.at })
    expect(questionConsumedError({ status: 'todo' }, q, { question_consumed_json: q.question_consumed_json }, 'home', true)).toBeNull()
    expect(questionRowError(q)).toBeNull()
    const n = notes('casey-eddington')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ title: 'You joined Open', body: 'Approved by Nate Mesfin', link: '/portal/projects/joinopen' })
    expect((await call('GET', '/api/notifications', CASEY)).text).toContain('You joined Open')
    expect((await call('GET', `/api/projects/${P_OPEN}`, CASEY)).status).toBe(200)
  })

  it('a second answer from the other director is refused and changes nothing', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    expect((await decide(NATE, id, 'approve')).status).toBe(200)
    const second = await decide(NICK, id, 'decline', 'no')
    expect(second.status).toBe(409)
    expect(second.json.code).toBe('decided')
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nate-mesfin', decided_note: null })
    const qid = question(id)!.id
    const before = question(id)!.question_answer_json
    const late = await telegramAnswer(qid, { v: 1, choice: 'decline', via: 'telegram', at: '2026-10-13T16:00:00Z' })
    expect(late).toMatchObject({ status: 'error', code: 'question_rule' })
    expect(late.reason).toMatch(/question_answer_frozen/)
    // Even an 'Other' on a closed question is refused.
    const lateOther = await telegramAnswer(qid, { v: 1, choice: 'other', text: 'hm', via: 'telegram', at: '2026-10-13T16:01:00Z' }, 2)
    expect(lateOther.status).toBe('error')
    expect(question(id)!.question_answer_json).toBe(before)
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'declined', decided_by = 'nick-ingraham' WHERE id = ?").run(id))
      .toThrow(/join_request_decided/)
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(true)
  })

  it("Nick's Telegram path: a tap approves, records nick-ingraham via telegram, and closes the question", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = question(id)!.id
    const at = '2026-10-13T15:00:00.000Z'
    const res = await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at })
    expect(res.status).toBe('accepted')
    expect(res.canonical_payload).toMatchObject({ status: 'done', completed: 1 })
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nick-ingraham', decided_via: 'telegram', decided_at: at })
    expect(db.prepare('SELECT added_by FROM project_members WHERE project_id = ? AND member_slug = ?').get(P_OPEN, 'casey-eddington'))
      .toEqual({ added_by: 'join:nick-ingraham' })
    expect(JSON.parse(question(id)!.question_consumed_json)).toMatchObject({ consumer: 'project_join', answer_at: at })
    expect(notes('casey-eddington')[0].title).toBe('You joined Open')
    const undo = await telegramAnswer(qid, null, 2)
    expect(undo).toMatchObject({ status: 'error', code: 'question_rule' })
    expect(undo.reason).toMatch(/question_answer_frozen/)
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(true)
  })

  it("Telegram 'Other' does not decide: the request stays pending, the text is the approvers' note, Nick can still decide", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = question(id)!.id
    const res = await telegramAnswer(qid, { v: 1, choice: 'other', text: 'Talk to me first', via: 'telegram', at: '2026-10-13T15:00:00Z' })
    expect(res.status).toBe('accepted')
    // The question stays open with no stored answer, so PB's card keeps its buttons.
    expect(res.canonical_payload).toMatchObject({ status: 'todo', question_answer_json: null })
    expect(question(id)).toMatchObject({ status: 'todo', question_answer_json: null, question_consumed_json: null })
    expect(request(id)).toMatchObject({ status: 'pending', decided_by: null, decided_note: null })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
    expect(notes('casey-eddington')).toHaveLength(0)
    // Both approvers see the note on Today; the requester never does.
    for (const who of [NATE, NICK]) {
      expect((await call('GET', '/api/join-requests', who)).json.data[0], who)
        .toMatchObject({ id, status: 'pending', director_note: 'Talk to me first', director_note_by: 'nick-ingraham' })
    }
    expect((await call('GET', '/api/project-directory', CASEY)).text).not.toContain('Talk to me first')
    const asCasey = viewerDb(env.DB, personViewer({ slug: 'casey-eddington', email: CASEY, pi: false }))
    expect((await asCasey.prepare('SELECT * FROM project_join_notes').all()).results).toEqual([])
    // A second 'Other' replaces the note; then Nick approves from Telegram.
    expect((await telegramAnswer(qid, { v: 1, choice: 'other', text: 'OK, she checked in', via: 'telegram', at: '2026-10-13T15:30:00Z' }, 2)).status).toBe('accepted')
    expect((await call('GET', '/api/join-requests', NATE)).json.data[0].director_note).toBe('OK, she checked in')
    expect((await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at: '2026-10-13T16:00:00Z' }, 3)).status).toBe('accepted')
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nick-ingraham' })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(true)
  })

  it("after an 'Other', Nate can still decline on Today", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    await telegramAnswer(question(id)!.id, { v: 1, choice: 'other', text: 'Not sure', via: 'telegram', at: '2026-10-13T15:00:00Z' })
    expect((await decide(NATE, id, 'decline', 'Next cycle')).status).toBe(200)
    expect(request(id)).toMatchObject({ status: 'declined', decided_by: 'nate-mesfin', decided_note: 'Next cycle' })
    expect(JSON.parse(question(id)!.question_answer_json)).toMatchObject({ choice: 'decline', text: 'by Nate Mesfin: Next cycle' })
  })

  it('the Telegram path holds with recursive_triggers on (D1 may run with it on)', async () => {
    seed(true)
    expect(db.pragma('recursive_triggers', { simple: true })).toBe(1)
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = question(id)!.id
    expect((await telegramAnswer(qid, { v: 1, choice: 'other', text: 'wait', via: 'telegram', at: '2026-10-13T14:00:00Z' })).status).toBe('accepted')
    expect(request(id).status).toBe('pending')
    expect((await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at: '2026-10-13T15:00:00Z' }, 2)).status).toBe('accepted')
    expect(request(id).status).toBe('approved')
    expect(question(id)!.status).toBe('done')
    expect(notes('casey-eddington')).toHaveLength(1)
    const id2 = (await ask(CASEY, P_WAIT)).json.data.id
    expect((await decide(NATE, id2, 'approve')).status).toBe(200)
    expect(question(id2)!.status).toBe('done')
  })

  it('a requester cannot answer their own request, through any door', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    expect((await decide(CASEY, id, 'approve')).status).toBe(403)
    const qid = question(id)!.id
    const upd = await call('POST', `/api/tasks/${qid}`, CASEY, { question_answer_json: { v: 1, choice: 'approve', via: 'hub', at: '2026-10-13T15:00:00Z' } })
    expect(upd.status).toBe(404)
    expect(request(id).status).toBe('pending')
    insertRow(db, 'projects', { id: 'proj_nickx', slug: 'nickx', title: 'Nick X', category: 'MNCCORE', status: 'active' })
    db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_nickx', 'nick-ingraham', 'test')").run()
    const nid = (await ask(NATE, 'proj_nickx')).json.data.id
    const self = await decide(NATE, nid, 'approve')
    expect(self.status).toBe(403)
    expect(self.json.error).toMatch(/own request/)
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'approved', decided_by = 'nate-mesfin', decided_via = 'hub', decided_at = 'x' WHERE id = ?").run(nid))
      .toThrow(/CHECK/)
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'approved', decided_by = 'casey-eddington', decided_via = 'hub', decided_at = 'x' WHERE id = ?").run(id))
      .toThrow(/CHECK/)
    expect((await decide(NICK, nid, 'approve')).status).toBe(200)
    expect(isMember('proj_nickx', 'nate-mesfin')).toBe(true)
  })

  it("Nick's own request gets no Telegram question; Nate decides it on Today", async () => {
    db.prepare("DELETE FROM project_members WHERE project_id = ? AND member_slug = 'nick-ingraham'").run(P_WAIT)
    const r = await ask(NICK, P_WAIT)
    expect(r.status).toBe(201)
    expect(r.json.telegram).toBe('none')
    expect(question(r.json.data.id)).toBeUndefined()
    expect((await call('GET', '/api/join-requests', NICK)).json.data).toHaveLength(0)
    expect((await decide(NICK, r.json.data.id, 'approve')).status).toBe(403)
    expect((await decide(NATE, r.json.data.id, 'approve')).status).toBe(200)
    expect(isMember(P_WAIT, 'nick-ingraham')).toBe(true)
  })

  it('decline with a note: no member, the note reaches the requester, and a re-ask waits 7 days', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    expect((await decide(NICK, id, 'decline', 'Not this cycle')).status).toBe(200)
    expect(request(id)).toMatchObject({ status: 'declined', decided_by: 'nick-ingraham', decided_note: 'Not this cycle' })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
    const q = question(id)!
    expect(JSON.parse(q.question_answer_json)).toMatchObject({ choice: 'decline', text: 'by Nick Ingraham: Not this cycle' })
    expect(q.status).toBe('done')
    expect(notes('casey-eddington')[0]).toMatchObject({ title: 'Your request to join Open was declined', body: 'Not this cycle', link: '/portal/projects?view=browse' })
    const entry = (await call('GET', '/api/project-directory', CASEY)).json.data.find((e: any) => e.project_id === P_OPEN)
    expect(entry).toMatchObject({ state: 'declined', decided_note: 'Not this cycle' })
    expect(Date.parse(entry.retry_after) - Date.parse(entry.decided_at)).toBe(7 * 86_400_000)
    // Too soon: refused by the route (429) and the table.
    const soon = await ask(CASEY, P_OPEN, 'Second try')
    expect(soon.status).toBe(429)
    expect(soon.json.code).toBe('too_soon')
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('soon', ?, 'casey-eddington')").run(P_OPEN))
      .toThrow(/join_too_soon/)
    // Eight days later it is allowed (the decision is backdated past the guard that freezes it).
    db.exec('DROP TRIGGER trg_pjr_decided_once')
    db.prepare("UPDATE project_join_requests SET decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days') WHERE id = ?").run(id)
    const later = await ask(CASEY, P_OPEN, 'Second try')
    expect(later.status).toBe(201)
    expect(request(later.json.data.id).status).toBe('pending')
  })

  it('a non-approver gets 403 on the list and the decision', async () => {
    const id = (await ask(NATE, P_OPEN)).json.data.id
    expect((await call('GET', '/api/join-requests', CASEY)).status).toBe(403)
    expect((await decide(CASEY, id, 'approve')).status).toBe(403)
    expect(request(id).status).toBe('pending')
  })
})

describe('a pending request whose project left the directory can only be closed', () => {
  for (const [why, change] of [
    ['marked done', `UPDATE projects SET status = 'done' WHERE id = '${P_OPEN}'`],
    ['deleted', `UPDATE projects SET deleted_at = '2026-10-13 00:00:00' WHERE id = '${P_OPEN}'`],
    ['made Friends', `UPDATE projects SET type = 'Friends' WHERE id = '${P_OPEN}'`],
    ['hidden', `INSERT INTO project_listing (project_id, hidden, hidden_by, updated_by) VALUES ('${P_OPEN}', 1, 'nick-ingraham', 'nick-ingraham')`],
  ] as const) {
    it(`${why}: the card says unlisted, Approve closes it, nobody joins, nobody is told "You joined"`, async () => {
      const id = (await ask(CASEY, P_OPEN)).json.data.id
      db.exec(change)
      expect((await call('GET', '/api/join-requests', NATE)).json.data[0]).toMatchObject({ id, listed: 0, project_name: null })
      const r = await decide(NATE, id, 'approve')
      expect(r.status).toBe(409)
      expect(r.json.code).toBe('not_listed')
      expect(request(id)).toMatchObject({ status: 'expired', decided_by: null })
      expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
      const n = notes('casey-eddington')
      expect(n).toHaveLength(1)
      expect(n[0].title).toMatch(/was closed$/)
      const q = question(id)!
      expect(q.status).toBe('done')
      expect(JSON.parse(q.question_answer_json)).toMatchObject({ choice: 'other' })
      expect(questionRowError(q)).toBeNull()
    })
  }

  it('a Telegram Approve on an unlisted project expires the request, and the card answer says closed, not approved', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    db.exec(`UPDATE projects SET status = 'blocked' WHERE id = '${P_OPEN}'`)
    const tapAt = '2026-10-13T15:00:00.000Z'
    const res = await telegramAnswer(question(id)!.id, { v: 1, choice: 'approve', via: 'telegram', at: tapAt })
    expect(res.status).toBe('accepted')
    expect(request(id)).toMatchObject({ status: 'expired', decided_by: null })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
    const q = question(id)!
    const answer = JSON.parse(q.question_answer_json)
    expect(answer).toMatchObject({ v: 1, choice: 'other', via: 'telegram', text: 'Closed: the project is no longer open to requests' })
    // Newer than the tap, so PB's reconciler re-renders the card the tap drew.
    expect(Date.parse(answer.at)).toBeGreaterThan(Date.parse(tapAt))
    expect(res.canonical_payload.question_answer_json).toBe(q.question_answer_json)
    expect(q.status).toBe('done')
    expect(JSON.parse(q.question_consumed_json)).toMatchObject({ consumer: 'project_join', answer_at: answer.at })
    expect(questionConsumedError({ status: 'todo' }, q, { question_consumed_json: q.question_consumed_json }, 'home', true)).toBeNull()
    expect(notes('casey-eddington')[0].title).toMatch(/was closed$/)
  })

  it('the rewrite to Closed is the only change the frozen rule lets through', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = question(id)!.id
    expect((await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at: '2026-10-13T15:00:00Z' })).status).toBe('accepted')
    // Listed project, approved: a raw writer cannot turn the approval into "Closed".
    expect(() => db.prepare(`UPDATE tasks SET question_answer_json = json_object('v', 1, 'choice', 'other', 'via', 'hub', 'at', 'x', 'text', 'Closed: the project is no longer open to requests') WHERE id = ?`).run(qid))
      .toThrow(/question_answer_frozen/)
  })

  it('the database refuses an approval for an unlisted project whatever the writer', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    db.exec(`UPDATE projects SET status = 'blocked' WHERE id = '${P_OPEN}'`)
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'approved', decided_by = 'nate-mesfin', decided_via = 'hub', decided_at = 'x' WHERE id = ?").run(id))
      .toThrow(/join_not_listed/)
  })

  it('Close is only for a project that left the directory: on a listed one it is refused', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const r = await decide(NATE, id, 'close')
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('listed')
    expect(request(id).status).toBe('pending')
    expect(notes('casey-eddington')).toHaveLength(0)
    // Once it leaves, Close works.
    db.exec(`UPDATE projects SET status = 'done' WHERE id = '${P_OPEN}'`)
    expect((await decide(NATE, id, 'close')).status).toBe(200)
    expect(request(id).status).toBe('expired')
  })
})

describe("the approvers' bell (Nick: \"Bell notification too\")", () => {
  const bell = (slug: string) => db.prepare(
    "SELECT * FROM notifications WHERE recipient_slug = ? AND id LIKE 'ntf_pjq_%' ORDER BY id",
  ).all(slug) as Record<string, any>[]

  it('a new request rings each approver other than the requester, linking to Today', async () => {
    const id = (await ask(CASEY, P_OPEN, 'I can help')).json.data.id
    for (const slug of ['nate-mesfin', 'nick-ingraham']) {
      const n = bell(slug)
      expect(n, slug).toHaveLength(1)
      expect(n[0]).toMatchObject({ source_type: 'project_join', source_id: id, title: 'Casey Eddington asks to join Open', body: 'I can help', link: '/portal/dashboard', read: 0 })
    }
    expect(bell('casey-eddington')).toHaveLength(0)
    // It reaches Nate's bell through the ordinary route.
    expect((await call('GET', '/api/notifications?unread=1', NATE)).text).toContain('Casey Eddington asks to join Open')
    // A repeat ask returns the first request and rings nobody again.
    await ask(CASEY, P_OPEN)
    expect(bell('nate-mesfin')).toHaveLength(1)
  })

  it("an approver's own request rings only the other approver", async () => {
    const nateAsks = (await ask(NATE, P_OPEN)).json.data.id
    expect(bell('nate-mesfin')).toHaveLength(0)
    expect(bell('nick-ingraham').map((n) => n.source_id)).toEqual([nateAsks])
    db.prepare("DELETE FROM project_members WHERE project_id = ? AND member_slug = 'nick-ingraham'").run(P_WAIT)
    const nickAsks = (await ask(NICK, P_WAIT)).json.data.id
    expect(bell('nate-mesfin').map((n) => n.source_id)).toEqual([nickAsks])
  })

  it('the bell is marked read once the request leaves pending, whoever closed it', async () => {
    const a = (await ask(CASEY, P_OPEN)).json.data.id
    const b = (await ask(CASEY, P_WAIT)).json.data.id
    expect((await decide(NATE, a, 'approve')).status).toBe(200)
    const read = (slug: string, id: string) => bell(slug).find((n) => n.source_id === id)!
    for (const slug of ['nate-mesfin', 'nick-ingraham']) {
      expect(read(slug, a)).toMatchObject({ read: 1 })
      expect(read(slug, a).read_at).toBeTruthy()
      expect(read(slug, b)).toMatchObject({ read: 0 })
    }
    // A Telegram decline clears it too.
    await telegramAnswer(question(b)!.id, { v: 1, choice: 'decline', via: 'telegram', at: '2026-10-13T15:00:00Z' })
    expect(read('nate-mesfin', b)).toMatchObject({ read: 1 })
    expect((await call('GET', '/api/notifications?unread=1', NATE)).text).not.toContain('asks to join')
  })
})

describe('the question row cannot be re-pointed or duplicated', () => {
  it('a project_join task with no pending request, one naming anyone else, a changed spec, or a second for one request is refused', async () => {
    const spec = (rid: string) => JSON.stringify({ v: 1, kind: 'project_join', prompt: 'x', choices: [{ key: 'approve', label: 'A', payload: { request_id: rid } }, { key: 'other', label: 'Other' }], rec: 'approve' })
    expect(() => db.prepare("INSERT INTO tasks (id, title, kind, source, assignee, question_spec_json) VALUES ('task_fake', 'fake', 'question', 'project_join', 'nick-ingraham', ?)").run(spec('nope')))
      .toThrow(/project_join_question_shape/)
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    expect(() => db.prepare("INSERT INTO tasks (id, title, kind, source, assignee, question_spec_json) VALUES ('task_dup', 'dup', 'question', 'project_join', 'nick-ingraham', ?)").run(spec(id)))
      .toThrow(/UNIQUE/)
    const qid = question(id)!.id
    for (const sql of [
      "UPDATE tasks SET assignee = 'casey-eddington' WHERE id = ?",
      "UPDATE tasks SET watchers = '[\"casey-eddington\"]' WHERE id = ?",
      `UPDATE tasks SET project_id = '${P_OPEN}' WHERE id = ?`,
      "UPDATE tasks SET assigned_by = 'eddin022@umn.edu' WHERE id = ?",
      "UPDATE tasks SET source = 'manual' WHERE id = ?",
      `UPDATE tasks SET question_spec_json = '${spec('other-id')}' WHERE id = ?`,
    ]) expect(() => db.prepare(sql).run(qid), sql).toThrow(/project_join_question_identity/)
    expect(() => db.prepare("UPDATE tasks SET source = 'project_join' WHERE id = 'task_secret'").run())
      .toThrow(/project_join_question_identity/)
  })
})

describe('the one-line description', () => {
  it('a member sets it, everyone sees it in the directory, and a non-member cannot set it', async () => {
    const r = await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { blurb: '  ICU sedation practice variation  ' })
    expect(r.status).toBe(200)
    expect(r.json.data.blurb).toBe('ICU sedation practice variation')
    const dir = await call('GET', '/api/project-directory', NATE)
    expect(dir.json.data.find((e: any) => e.project_id === P_CASEY).blurb).toBe('ICU sedation practice variation')
    expect((await call('PUT', `/api/projects/${P_OPEN}/listing`, CASEY, { blurb: 'hijack' })).status).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_listing WHERE project_id = ?').get(P_OPEN)).toEqual({ n: 0 })
    expect((await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { blurb: 'Second line' })).json.data.blurb).toBe('Second line')
    expect((await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { blurb: null })).json.data.blurb).toBeNull()
  })

  it('one line, 140 characters at most: refused by the route and by the table', async () => {
    expect((await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { blurb: 'a\nb' })).status).toBe(400)
    expect((await call('PUT', `/api/projects/${P_CASEY}/listing`, CASEY, { blurb: 'x'.repeat(141) })).status).toBe(400)
    expect(() => db.prepare("INSERT INTO project_listing (project_id, blurb, updated_by) VALUES (?, 'a' || char(10) || 'b', 'x')").run(P_CASEY)).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO project_listing (project_id, blurb, updated_by) VALUES (?, '   ', 'x')").run(P_CASEY)).toThrow(/CHECK/)
  })
})
