/**
 * api/routes/project-join.test.ts -- requests to join a project (schema-v139).
 *
 * Drives the REAL worker (full middleware, viewer-bound handle, migrated
 * schema with the v139 triggers). Nick, 2026-10-13: members "can request to
 * get added to projects where I can [say] yes through a [Telegram] message or
 * on my today page ... but Nate and I need to approve that". Either approver's
 * first answer adds the member; before joining, a member sees only the
 * project's name, a one-line description and its PI.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { questionRowError, questionConsumedError } from '../lib/task-question'

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
const P_NATE = 'proj_joinnate' // Nate's alone: Nick is not on it
const P_DONE = 'proj_joindone'
const P_BLOCKED = 'proj_joinblocked'
const P_PB = 'proj_joinpb'
const P_DEL = 'proj_joindel'

let db: InstanceType<typeof Database>
let env: Env

function seed(recursive = false) {
  db = prodSchemaDb()
  if (recursive) db.pragma('recursive_triggers = ON')
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  // The receipt rule ON, as prod runs it: the trigger's close must carry one.
  db.prepare("UPDATE lab_settings SET value = '1' WHERE key = 'hub_validate_question_consumed'").run()
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
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
  insertRow(db, 'projects', { id: P_DEL, slug: 'joindel', title: 'Deleted Study', category: 'MNCCORE', status: 'active', deleted_at: '2026-09-01 00:00:00' })
  for (const p of [P_OPEN, P_WAIT, P_CASEY, P_DONE, P_BLOCKED, P_PB]) {
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

async function call(method: string, path: string, who: 'apikey' | 'anon' | string, body?: unknown) {
  const headers: Record<string, string> = {}
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
const decide = (who: string, id: string, decision: 'approve' | 'decline', note?: string) =>
  call('POST', `/api/join-requests/${id}/decision`, who, note === undefined ? { decision } : { decision, note })

const request = (id: string) => db.prepare('SELECT * FROM project_join_requests WHERE id = ?').get(id) as Record<string, any>
const task = (id: string) => db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, any>
const isMember = (p: string, s: string) => !!db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND member_slug = ?').get(p, s)
const notes = (s: string) => db.prepare("SELECT * FROM notifications WHERE recipient_slug = ? AND source_type = 'project_join'").all(s) as Record<string, any>[]

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

const ENTRY_KEYS = ['blurb', 'decided_at', 'decided_note', 'name', 'pi_name', 'pi_slug', 'project_id', 'request_id', 'state']

describe('the directory: what a member who is not on a project may see', () => {
  it('lists active and waiting projects, not done, blocked, deleted or Peripheral Brain ones', async () => {
    const r = await call('GET', '/api/project-directory', CASEY)
    expect(r.status).toBe(200)
    const ids = r.json.data.map((e: any) => e.project_id).sort()
    expect(ids).toEqual([P_CASEY, P_NATE, P_OPEN, P_WAIT].sort())
  })

  it('a non-member row carries the name, blurb and PI, and no other field', async () => {
    const r = await call('GET', '/api/project-directory', CASEY)
    for (const e of r.json.data) expect(Object.keys(e).sort(), e.project_id).toEqual(ENTRY_KEYS)
    const open = r.json.data.find((e: any) => e.project_id === P_OPEN)
    expect(open).toMatchObject({ name: 'Open', pi_slug: 'nick-ingraham', pi_name: 'Nick Ingraham', blurb: null, state: 'none' })
    expect(r.json.data.find((e: any) => e.project_id === P_CASEY).state).toBe('member')
    // Nothing internal: not the description, the next action, a task or the full title.
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

describe('asking to join', () => {
  it('creates one pending request and one Telegram question for Nick that the requester cannot read', async () => {
    const r = await ask(CASEY, P_OPEN, 'I can run the models')
    expect(r.status).toBe(201)
    expect(r.json.telegram).toBe('sent')
    const req = request(r.json.data.id)
    expect(req).toMatchObject({ project_id: P_OPEN, requester_slug: 'casey-eddington', status: 'pending', note: 'I can run the models' })
    const q = task(req.question_task_id)
    expect(q).toMatchObject({ kind: 'question', source: 'project_join', assignee: 'nick-ingraham', project_id: null, assigned_by: null, status: 'todo' })
    expect(questionRowError(q)).toBeNull()
    const spec = JSON.parse(q.question_spec_json)
    expect(spec.choices.map((c: any) => c.key)).toEqual(['approve', 'decline', 'other'])
    expect(spec.rec).toBe('approve')
    expect(spec.prompt).toContain('Casey Eddington asks to join Open')
    // The requester can neither read nor list it.
    expect((await call('GET', `/api/tasks/${q.id}`, CASEY)).status).toBe(404)
    expect((await call('GET', '/api/tasks?kind=question', CASEY)).text).not.toContain(q.id)
    // Nick can.
    expect((await call('GET', `/api/tasks/${q.id}`, NICK)).status).toBe(200)
    // Casey still cannot see the project itself: asking is not joining.
    expect((await call('GET', `/api/projects/${P_OPEN}`, CASEY)).status).toBe(404)
  })

  it('a duplicate pending request returns the first, with no second row or question', async () => {
    const a = await ask(CASEY, P_OPEN)
    const b = await ask(CASEY, P_OPEN)
    expect(b.status).toBe(200)
    expect(b.json.created).toBe(false)
    expect(b.json.data.id).toBe(a.json.data.id)
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_join_requests WHERE project_id = ?").get(P_OPEN)).toEqual({ n: 1 })
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'project_join'").get()).toEqual({ n: 1 })
    // And the database refuses a second pending row whatever the route does.
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('dup', ?, 'casey-eddington')").run(P_OPEN))
      .toThrow(/UNIQUE/)
  })

  it('a request for a project you are already on is refused, by the route and by the database', async () => {
    const r = await ask(CASEY, P_CASEY)
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('member')
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_join_requests').get()).toEqual({ n: 0 })
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('m', ?, 'casey-eddington')").run(P_CASEY))
      .toThrow(/join_already_member/)
  })

  it('an unlisted project (done, Peripheral Brain, deleted, unknown) answers 404 and writes nothing', async () => {
    for (const p of [P_DONE, P_PB, P_DEL, P_BLOCKED, 'proj_nope']) expect((await ask(CASEY, p)).status, p).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_join_requests').get()).toEqual({ n: 0 })
    expect(() => db.prepare("INSERT INTO project_join_requests (id, project_id, requester_slug) VALUES ('x', ?, 'casey-eddington')").run(P_DONE))
      .toThrow(/join_not_listed/)
  })

  it('a note over 280 characters is a 400', async () => {
    expect((await ask(CASEY, P_OPEN, 'x'.repeat(281))).status).toBe(400)
  })
})

describe('deciding: Nick or Nate, first answer wins', () => {
  it("Nate approves on Today: Casey joins, the question closes with a receipt, Casey is notified", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = request(id).question_task_id
    // Nate's Today card lists it, though he is not on the project.
    const list = await call('GET', '/api/join-requests', NATE)
    expect(list.status).toBe(200)
    expect(list.json.data).toHaveLength(1)
    expect(list.json.data[0]).toMatchObject({ id, project_name: 'Open', requester_name: 'Casey Eddington', status: 'pending' })
    expect(isMember(P_OPEN, 'nate-mesfin')).toBe(false)

    const r = await decide(NATE, id, 'approve')
    expect(r.status).toBe(200)
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nate-mesfin', decided_via: 'hub' })
    expect(db.prepare('SELECT added_by FROM project_members WHERE project_id = ? AND member_slug = ?').get(P_OPEN, 'casey-eddington'))
      .toEqual({ added_by: 'join:nate-mesfin' })
    const q = task(qid)
    expect(q).toMatchObject({ status: 'done', completed: 1, completed_by: 'nate-mesfin' })
    const answer = JSON.parse(q.question_answer_json)
    expect(answer).toMatchObject({ v: 1, choice: 'approve', via: 'hub' })
    const receipt = JSON.parse(q.question_consumed_json)
    expect(receipt).toMatchObject({ v: 1, consumer: 'project_join', answer_at: answer.at })
    // The receipt passes the Hub's own receipt rule, as PB's question_state will read it.
    expect(questionConsumedError({ status: 'todo' }, q, { question_consumed_json: q.question_consumed_json }, 'home', true)).toBeNull()
    expect(questionRowError(q)).toBeNull()
    // Casey is told, and can now open the project.
    const n = notes('casey-eddington')
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ title: 'You joined Open', body: 'Approved by Nate Mesfin', link: '/portal/projects/joinopen' })
    const feed = await call('GET', '/api/notifications', CASEY)
    expect(feed.text).toContain('You joined Open')
    expect((await call('GET', `/api/projects/${P_OPEN}`, CASEY)).status).toBe(200)
  })

  it('a second answer from the other director is refused and changes nothing', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    expect((await decide(NATE, id, 'approve')).status).toBe(200)
    const second = await decide(NICK, id, 'decline', 'no')
    expect(second.status).toBe(409)
    expect(second.json.code).toBe('decided')
    expect(second.json.data.decided_by).toBe('nate-mesfin')
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nate-mesfin', decided_note: null })
    // A late Telegram tap on Nick's card: refused quietly, the answer stands.
    const qid = request(id).question_task_id
    const before = task(qid).question_answer_json
    const late = await telegramAnswer(qid, { v: 1, choice: 'decline', via: 'telegram', at: '2026-10-13T16:00:00Z' })
    expect(late.status).toBe('error')
    expect(late.code).toBe('question_rule')
    expect(late.reason).toMatch(/question_answer_frozen/)
    expect(task(qid).question_answer_json).toBe(before)
    // And the database refuses a second decision whatever the writer.
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'declined', decided_by = 'nick-ingraham' WHERE id = ?").run(id))
      .toThrow(/join_request_decided/)
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(true)
  })

  it("Nick's Telegram path: a tap approves, records nick-ingraham via telegram, and closes the question", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = request(id).question_task_id
    const at = '2026-10-13T15:00:00.000Z'
    const res = await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at })
    expect(res.status).toBe('accepted')
    // The ack PB mirrors into its cache already shows the closed row.
    expect(res.canonical_payload).toMatchObject({ status: 'done', completed: 1 })
    expect(request(id)).toMatchObject({ status: 'approved', decided_by: 'nick-ingraham', decided_via: 'telegram', decided_at: at })
    expect(db.prepare('SELECT added_by FROM project_members WHERE project_id = ? AND member_slug = ?').get(P_OPEN, 'casey-eddington'))
      .toEqual({ added_by: 'join:nick-ingraham' })
    const q = task(qid)
    expect(JSON.parse(q.question_consumed_json)).toMatchObject({ consumer: 'project_join', answer_at: at })
    expect(notes('casey-eddington')[0].title).toBe('You joined Open')
    // Undo from the card is refused: the decision is final.
    const undo = await telegramAnswer(qid, null, 2)
    expect(undo.status).toBe('error')
    expect(undo.code).toBe('question_rule') // quiet in PB: not an alert
    expect(undo.reason).toMatch(/question_answer_frozen/)
    expect(task(qid).question_answer_json).not.toBeNull()
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(true)
  })

  it('the Telegram path holds with recursive_triggers on (D1 may run with it on)', async () => {
    seed(true)
    expect(db.pragma('recursive_triggers', { simple: true })).toBe(1)
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = request(id).question_task_id
    const res = await telegramAnswer(qid, { v: 1, choice: 'approve', via: 'telegram', at: '2026-10-13T15:00:00Z' })
    expect(res.status).toBe('accepted')
    expect(request(id).status).toBe('approved')
    expect(task(qid).status).toBe('done')
    expect(notes('casey-eddington')).toHaveLength(1)
    // And the Hub path too.
    const id2 = (await ask(CASEY, P_WAIT)).json.data.id
    expect((await decide(NATE, id2, 'approve')).status).toBe(200)
    expect(task(request(id2).question_task_id).status).toBe('done')
  })

  it("a requester cannot answer their own request, through any door", async () => {
    // Casey: not an approver.
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const r = await decide(CASEY, id, 'approve')
    expect(r.status).toBe(403)
    // Casey cannot reach the question row to answer it.
    const qid = request(id).question_task_id
    const upd = await call('POST', `/api/tasks/${qid}`, CASEY, { question_answer_json: { v: 1, choice: 'approve', via: 'hub', at: '2026-10-13T15:00:00Z' } })
    expect(upd.status).toBe(404)
    expect(request(id).status).toBe('pending')
    // Nate asks to join a project he is not on; he cannot approve it himself.
    insertRow(db, 'projects', { id: 'proj_nickx', slug: 'nickx', title: 'Nick X', category: 'MNCCORE', status: 'active' })
    db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_nickx', 'nick-ingraham', 'test')").run()
    const nid = (await ask(NATE, 'proj_nickx')).json.data.id
    const self = await decide(NATE, nid, 'approve')
    expect(self.status).toBe(403)
    expect(self.json.error).toMatch(/own request/)
    // The CHECK holds below the route.
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'approved', decided_by = 'nate-mesfin', decided_via = 'hub', decided_at = 'x' WHERE id = ?").run(nid))
      .toThrow(/CHECK/)
    // Nobody outside the two named approvers can be stored as the decider.
    expect(() => db.prepare("UPDATE project_join_requests SET status = 'approved', decided_by = 'casey-eddington', decided_via = 'hub', decided_at = 'x' WHERE id = ?").run(id))
      .toThrow(/CHECK/)
    // Nick decides Nate's.
    expect((await decide(NICK, nid, 'approve')).status).toBe(200)
    expect(isMember('proj_nickx', 'nate-mesfin')).toBe(true)
  })

  it("Nick's own request gets no Telegram question; Nate decides it on Today", async () => {
    const r = await ask(NICK, P_NATE)
    expect(r.status).toBe(201)
    expect(r.json.telegram).toBe('none')
    expect(request(r.json.data.id).question_task_id).toBeNull()
    expect((await call('GET', '/api/join-requests', NICK)).json.data).toHaveLength(0) // his own is not his to decide
    expect((await decide(NICK, r.json.data.id, 'approve')).status).toBe(403)
    expect((await decide(NATE, r.json.data.id, 'approve')).status).toBe(200)
    expect(isMember(P_NATE, 'nick-ingraham')).toBe(true)
  })

  it('decline with a note: no member, the note reaches the requester, and a re-request is allowed', async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const r = await decide(NICK, id, 'decline', 'Not this cycle')
    expect(r.status).toBe(200)
    expect(request(id)).toMatchObject({ status: 'declined', decided_by: 'nick-ingraham', decided_note: 'Not this cycle' })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
    const q = task(request(id).question_task_id)
    expect(JSON.parse(q.question_answer_json)).toMatchObject({ choice: 'decline', text: 'Not this cycle' })
    expect(q.status).toBe('done')
    expect(notes('casey-eddington')[0]).toMatchObject({ title: 'Your request to join Open was declined', body: 'Not this cycle', link: '/portal/projects?view=browse' })
    const dir = await call('GET', '/api/project-directory', CASEY)
    expect(dir.json.data.find((e: any) => e.project_id === P_OPEN)).toMatchObject({ state: 'declined', decided_note: 'Not this cycle' })
    // Ask again.
    const again = await ask(CASEY, P_OPEN, 'Second try')
    expect(again.status).toBe(201)
    expect(request(again.json.data.id).status).toBe('pending')
  })

  it("Telegram 'Other' with text declines, the text is the note", async () => {
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = request(id).question_task_id
    const res = await telegramAnswer(qid, { v: 1, choice: 'other', text: 'Talk to me first', via: 'telegram', at: '2026-10-13T15:00:00Z' })
    expect(res.status).toBe('accepted')
    expect(request(id)).toMatchObject({ status: 'declined', decided_note: 'Talk to me first', decided_via: 'telegram' })
    expect(isMember(P_OPEN, 'casey-eddington')).toBe(false)
    expect(notes('casey-eddington')[0].body).toBe('Talk to me first')
  })

  it('a non-approver gets 403 on the list and the decision', async () => {
    const id = (await ask(NATE, P_OPEN)).json.data.id
    expect((await call('GET', '/api/join-requests', CASEY)).status).toBe(403)
    expect((await decide(CASEY, id, 'approve')).status).toBe(403)
    expect(request(id).status).toBe('pending')
  })
})

describe('the question row cannot be re-pointed', () => {
  it('a project_join task with no pending request, or one naming anyone else, is refused', async () => {
    const spec = JSON.stringify({ v: 1, kind: 'project_join', prompt: 'x', choices: [{ key: 'approve', label: 'A' }, { key: 'other', label: 'Other' }], rec: 'approve' })
    expect(() => db.prepare("INSERT INTO tasks (id, title, kind, source, assignee, question_spec_json) VALUES ('task_fake', 'fake', 'question', 'project_join', 'nick-ingraham', ?)").run(spec))
      .toThrow(/project_join_question_shape/)
    const id = (await ask(CASEY, P_OPEN)).json.data.id
    const qid = request(id).question_task_id
    for (const sql of [
      "UPDATE tasks SET assignee = 'casey-eddington' WHERE id = ?",
      "UPDATE tasks SET watchers = '[\"casey-eddington\"]' WHERE id = ?",
      `UPDATE tasks SET project_id = '${P_OPEN}' WHERE id = ?`,
      "UPDATE tasks SET assigned_by = 'eddin022@umn.edu' WHERE id = ?",
      "UPDATE tasks SET source = 'manual' WHERE id = ?",
    ]) expect(() => db.prepare(sql).run(qid), sql).toThrow(/project_join_question_identity/)
    expect(() => db.prepare("UPDATE tasks SET source = 'project_join' WHERE id = 'task_secret'").run())
      .toThrow(/project_join_question_identity/)
  })
})

describe('the one-line description', () => {
  it('a member sets it, everyone sees it in the directory, and a non-member cannot set it', async () => {
    const r = await call('PUT', `/api/projects/${P_CASEY}/blurb`, CASEY, { blurb: '  ICU sedation practice variation  ' })
    expect(r.status).toBe(200)
    expect(r.json.data.blurb).toBe('ICU sedation practice variation')
    const dir = await call('GET', '/api/project-directory', NATE)
    expect(dir.json.data.find((e: any) => e.project_id === P_CASEY).blurb).toBe('ICU sedation practice variation')
    expect((await call('PUT', `/api/projects/${P_OPEN}/blurb`, CASEY, { blurb: 'hijack' })).status).toBe(404)
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_blurbs WHERE project_id = ?').get(P_OPEN)).toEqual({ n: 0 })
    // Edit, then clear.
    expect((await call('PUT', `/api/projects/${P_CASEY}/blurb`, CASEY, { blurb: 'Second line' })).json.data.blurb).toBe('Second line')
    expect((await call('PUT', `/api/projects/${P_CASEY}/blurb`, CASEY, { blurb: null })).json.data.blurb).toBeNull()
  })

  it('one line, 140 characters at most: refused by the route and by the table', async () => {
    expect((await call('PUT', `/api/projects/${P_CASEY}/blurb`, CASEY, { blurb: 'a\nb' })).status).toBe(400)
    expect((await call('PUT', `/api/projects/${P_CASEY}/blurb`, CASEY, { blurb: 'x'.repeat(141) })).status).toBe(400)
    expect(() => db.prepare("INSERT INTO project_blurbs (project_id, blurb, updated_by) VALUES (?, 'a' || char(10) || 'b', 'x')").run(P_CASEY)).toThrow(/CHECK/)
    expect(() => db.prepare("INSERT INTO project_blurbs (project_id, blurb, updated_by) VALUES (?, '   ', 'x')").run(P_CASEY)).toThrow(/CHECK/)
  })
})
