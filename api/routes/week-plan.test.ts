/**
 * api/routes/week-plan.test.ts -- the planning conversation's Hub half (v1
 * contract, PB Context/Decisions/2026-10-30-planning-conversation.md).
 *
 * Runs the real worker against the migration-chain database (prodSchemaDb).
 * Pins:
 *   - the question contract: a week_plan spec is judged; a week_plan answer
 *     needs typed picks that name the spec's candidates and options; picks on
 *     another question are shape-judged; a week plan answers once;
 *   - Start: the answer and one packet_prepare ai_request per started pick
 *     land in one batch, with the payload, owner and project the contract
 *     names; Save starts nothing; a refused answer starts nothing;
 *   - the cap: a Start that would pass 3 is refused whole with
 *     409 {code:'daily_cap', used, cap:3};
 *   - GET /api/packets/daily-count: Nick or the PB key only, the Chicago day,
 *     a published request counted once;
 *   - a packet_prepare request reads landing_visibility 'author', and its
 *     answer posts no comment and no notification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import type { AuthUser } from '../helpers'
import { applyMutation } from './mutations'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { questionRowError } from '../lib/task-question'
import { ctDayBounds, dailyPacketCount } from '../lib/week-plan-start'
import { weekPlanSpecError, weekPlanPicksError } from '../../shared/weekPlan'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PB_KEY = 'pb-key-for-tests'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const PLAN = 'task_plan_week_44'

let db: InstanceType<typeof Database>
let env: Env
const one = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const all = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

type Who = { pb: true } | { as: string }
async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if ('pb' in who) headers.Authorization = `Bearer ${PB_KEY}`
  if ('as' in who) { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who.as }
  const res = await worker.fetch(new Request(`https://hub.test${path}`, {
    method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  }), env, CTX)
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(text) } catch { /* plain-text 401 */ }
  return { status: res.status, body: json }
}

const opt = (key: string, recommended = false, deliverable_kind = 'gmail_draft') => ({
  key, label: `Option ${key}`, direction: `Direction ${key}`, deliverable_kind, recommended,
})
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-10-26', tz: 'America/Chicago',
  prompt: 'What do you want to take the next step on this week?', expires_at: '2026-11-02T05:00:00Z',
  candidates: [
    { task_id: 'task_a', title: 'Answer Jane', why: 'sat 6 days', evidence: [{ kind: 'thread', ref: '1a0e5f718220a235', observed_at: '2026-10-25T16:00:00Z' }],
      options: [opt('a1', true), opt('a2')] },
    { task_id: 'task_b', title: 'Review abstract', why: 'due Friday', evidence: [],
      options: [opt('b1'), opt('b2', true, 'doc_text'), opt('b3', false, 'answer')] },
    { task_id: 'task_c', title: 'K23 progress report', why: 'due 15 Nov', evidence: [],
      options: [opt('c1', true, 'doc_text'), opt('c2')] },
  ],
}

const answer = (picks: unknown, extra: Record<string, unknown> = {}) =>
  ({ v: 1, choice: 'start', via: 'hub', at: '2026-10-28T16:05:00Z', picks, ...extra })

function seedPlan(id = PLAN, spec: unknown = SPEC, title = 'Plan your week') {
  insertRow(db, 'tasks', {
    id, title, kind: 'question', status: 'todo', priority: 'medium',
    assignee: 'nick-ingraham', source: 'week_plan', project_id: null,
    question_spec_json: JSON.stringify(spec), question_answer_json: null,
  })
}

async function answerPlan(picks: unknown, who: Who = { as: NICK }, id = PLAN) {
  return call('POST', `/api/tasks/${id}`, who, { question_answer_json: answer(picks) })
}

const requests = () => all("SELECT * FROM ai_requests WHERE source_type = 'packet_prepare' ORDER BY source_id")

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T16:05:00Z')) // Wed 11:05 CDT
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_a', project_id: PROJECT, title: 'Answer Jane on the data pull', assignee: 'nick-ingraham', status: 'todo' })
  insertRow(db, 'tasks', { id: 'task_b', project_id: null, title: 'Review abstract', assignee: 'nick-ingraham', status: 'todo' })
  insertRow(db, 'tasks', { id: 'task_c', project_id: null, title: 'K23 progress report', assignee: 'nick-ingraham', status: 'todo' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', PB_API_KEY: PB_KEY } as unknown as Env
  seedPlan()
})

afterEach(() => { vi.useRealTimers() })

function packet(id: string, key: string, task: string, created_at = '2026-10-28T13:00:00.000Z') {
  insertRow(db, 'task_packets', { id, task_id: task, producer_key: key, created_at })
  insertRow(db, 'task_packet_versions', {
    packet_id: id, version: 1, author: 'claude', instruction: 'Do it', deliverable_kind: 'answer',
    deliverable_json: '{"kind":"answer"}', body: 'b', calls_json: '[]', manifest_json: '[]',
    manifest_hash: 'a'.repeat(64), created_at,
  })
}
function pendingRequest(id: string, task = 'task_c') {
  insertRow(db, 'ai_requests', { id, source_type: 'packet_prepare', source_id: task, prompt: 'p', status: 'pending', requested_by: NICK })
}

// ── the question contract ────────────────────────────────────────────────────

describe('the week_plan question contract (task-question.ts)', () => {
  const row = (spec: unknown, ans: unknown = null, source = 'week_plan') => ({
    kind: 'question', source, status: 'todo',
    question_spec_json: JSON.stringify(spec), question_answer_json: ans === null ? null : JSON.stringify(ans),
  })

  it('accepts the contract spec and refuses each broken rule', () => {
    expect(questionRowError(row(SPEC))).toBeNull()
    const broken: [string, unknown][] = [
      ['kind', { ...SPEC, kind: 'meeting_match' }],
      ['week_start', { ...SPEC, week_start: '2026-02-30' }],
      ['no candidates', { ...SPEC, candidates: [] }],
      ['one option', { ...SPEC, candidates: [{ ...SPEC.candidates[0], options: [opt('a1', true)] }] }],
      ['five options', { ...SPEC, candidates: [{ ...SPEC.candidates[0], options: ['1', '2', '3', '4', '5'].map((k, i) => opt(k, i === 0)) }] }],
      ['two recommended', { ...SPEC, candidates: [{ ...SPEC.candidates[0], options: [opt('a1', true), opt('a2', true)] }] }],
      ['none recommended', { ...SPEC, candidates: [{ ...SPEC.candidates[0], options: [opt('a1'), opt('a2')] }] }],
      ['a sending deliverable', { ...SPEC, candidates: [{ ...SPEC.candidates[0], options: [opt('a1', true, 'gmail_send'), opt('a2')] }] }],
      ['duplicate task', { ...SPEC, candidates: [SPEC.candidates[0], SPEC.candidates[0]] }],
    ]
    for (const [why, spec] of broken) {
      expect(questionRowError(row(spec)), why).toMatch(/^question_spec_invalid:/)
    }
  })

  it('a week_plan answer without picks is invalid; picks must name the spec', () => {
    expect(questionRowError(row(SPEC, { v: 1, choice: 'start', via: 'hub', at: 'x' }))).toMatch(/^question_answer_invalid: .*picks/)
    expect(questionRowError(row(SPEC, answer([])))).toMatch(/^question_answer_invalid:/)
    expect(questionRowError(row(SPEC, answer([{ task_id: 'task_z', option_key: 'a1', text: null, start: true }])))).toMatch(/not one of the offer's candidates/)
    expect(questionRowError(row(SPEC, answer([{ task_id: 'task_a', option_key: 'b1', text: null, start: true }])))).toMatch(/not one of task_a's options/)
    expect(questionRowError(row(SPEC, answer([{ task_id: 'task_a', option_key: 'a1', text: 'and', start: true }])))).toMatch(/exactly one of option_key or text/)
    expect(questionRowError(row(SPEC, answer([{ task_id: 'task_a', option_key: null, text: null, start: true }])))).toMatch(/exactly one of option_key or text/)
    expect(questionRowError(row(SPEC, answer([{ task_id: 'task_a', option_key: 'a1', text: null }])))).toMatch(/start must be a boolean/)
    expect(questionRowError(row(SPEC, answer([
      { task_id: 'task_a', option_key: 'a1', text: null, start: true },
      { task_id: 'task_a', option_key: 'a2', text: null, start: false },
    ])))).toMatch(/appears twice/)
    expect(questionRowError(row(SPEC, answer([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
    ])))).toBeNull()
  })

  it('other questions are unchanged; picks there are shape-judged only when present', () => {
    const mm = { v: 1, kind: 'meeting_match', prompt: 'Which?', choices: [{ key: 'c1', label: 'x' }], rec: 'c1', allow_text: true }
    expect(questionRowError(row(mm, { v: 1, choice: 'c1', via: 'hub', at: 'x' }, 'meeting_match'))).toBeNull()
    expect(questionRowError(row(mm, { v: 1, choice: 'c1', via: 'hub', at: 'x', picks: [{ task_id: 't', option_key: 'k', text: null, start: false }] }, 'meeting_match'))).toBeNull()
    expect(questionRowError(row(mm, { v: 1, choice: 'c1', via: 'hub', at: 'x', picks: 'task_a' }, 'meeting_match'))).toMatch(/^question_answer_invalid:/)
  })

  it('the shared validators agree with the chokepoint (one rule set)', () => {
    expect(weekPlanSpecError(SPEC)).toBeNull()
    expect(weekPlanSpecError(JSON.stringify(SPEC))).toBeNull()
    expect(weekPlanPicksError([{ task_id: 'task_c', option_key: 'c2', text: null, start: true }], null)).toBeNull()
  })

  it('a malformed week_plan spec is refused at the mint (the one chokepoint, applyMutation)', async () => {
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_plan_bad', op: 'insert', route: 'test',
      user: { email: NICK } as unknown as AuthUser,
      payload: {
        title: 'Plan your week', description: 'Plan your week', assignee: 'nick-ingraham', assigned_by: 'pb',
        priority: 'medium', status: 'todo', source: 'week_plan', kind: 'question', completed: 0, completed_at: null,
        project_id: null, question_spec_json: { ...SPEC, candidates: [] },
      },
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/question_spec_invalid: candidates/)
    expect(one("SELECT 1 AS x FROM tasks WHERE id = 'task_plan_bad'")).toBeUndefined()
  })
})

// ── Start ────────────────────────────────────────────────────────────────────

describe('POST /api/tasks/:id with a week_plan answer (Start)', () => {
  it('stores the answer and one packet_prepare request per started pick, in one write', async () => {
    packet('pkt_live', 'prepare:task_a:2026-10-27', 'task_a', '2026-10-27T13:00:00.000Z')
    const r = await answerPlan([
      { task_id: 'task_a', option_key: 'a2', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey which cut he used', start: true },
      { task_id: 'task_c', option_key: 'c1', text: null, start: false },
    ])
    expect(r.status).toBe(200)
    const stored = JSON.parse(String(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a))
    expect(stored.picks).toHaveLength(3)

    const rows = requests()
    expect(rows.map((x) => x.source_id)).toEqual(['task_a', 'task_b'])
    const [a, b] = rows
    expect(a.status).toBe('pending')
    expect(a.requested_by).toBe(NICK)
    expect(a.project_slug).toBe(PROJECT)
    expect(b.project_slug).toBeNull()
    expect(String(a.prompt)).toContain('Direction a2')
    expect(JSON.parse(String(a.context))).toEqual({
      v: 1, task_id: 'task_a', direction: 'Direction a2', option_key: 'a2', plan_question_id: PLAN,
      expected_packet: { id: 'pkt_live', version: 1 },
    })
    expect(JSON.parse(String(b.context))).toEqual({
      v: 1, task_id: 'task_b', direction: 'Ask Casey which cut he used', option_key: null, plan_question_id: PLAN,
      expected_packet: null,
    })
    // The answer and the requests share the mutation that wrote them.
    const mutId = one('SELECT last_mutation_id AS m FROM tasks WHERE id = ?', PLAN)?.m
    expect(one('SELECT outcome FROM processed_mutations WHERE mutation_id = ?', mutId)?.outcome).toBe('accepted')
  })

  it('a used packet is never named as the one to replace', async () => {
    packet('pkt_used', 'prepare:task_a:2026-10-27', 'task_a', '2026-10-27T13:00:00.000Z')
    insertRow(db, 'task_packet_actions', { id: 'pka_1', packet_id: 'pkt_used', version: 1, action: 'use', outcome: 'ok', actor: 'nick-ingraham', created_at: '2026-10-27T14:00:00Z' })
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])).status).toBe(200)
    expect(JSON.parse(String(requests()[0].context)).expected_packet).toBeNull()
  })

  it('Save without starting stores the picks and starts nothing', async () => {
    const r = await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, {
      question_answer_json: answer([{ task_id: 'task_a', option_key: 'a1', text: null, start: false }], { choice: 'save' }),
    })
    expect(r.status).toBe(200)
    expect(requests()).toHaveLength(0)
    expect(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a).not.toBeNull()
  })

  it('a refused answer (bad picks) stores nothing and starts nothing', async () => {
    const r = await answerPlan([{ task_id: 'task_z', option_key: 'a1', text: null, start: true }])
    expect(r.status).toBe(409)
    expect(String(r.body.error)).toMatch(/question_answer_invalid/)
    expect(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a).toBeNull()
    expect(requests()).toHaveLength(0)
  })

  it('a week plan answers once: a second answer and an Undo are refused, nothing starts twice', async () => {
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])).status).toBe(200)
    const again = await answerPlan([{ task_id: 'task_b', option_key: 'b1', text: null, start: true }])
    expect(again.status).toBe(409)
    expect(String(again.body.error)).toMatch(/question_answer_frozen/)
    const undo = await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, { question_answer_json: null })
    expect(undo.status).toBe(409)
    expect(requests()).toHaveLength(1)
  })

  it('a Start that would pass the cap is refused whole: 409 {code:daily_cap, used, cap:3}', async () => {
    packet('pkt_1', 'prepare:task_x:1', 'task_a')
    pendingRequest('req_open')
    const r = await answerPlan([
      { task_id: 'task_a', option_key: 'a1', text: null, start: true },
      { task_id: 'task_b', option_key: 'b2', text: null, start: true },
    ])
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ code: 'daily_cap', used: 2, cap: 3 })
    expect(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a).toBeNull()
    expect(requests().map((x) => x.id)).toEqual(['req_open'])
    // One start still fits.
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])).status).toBe(200)
    expect(requests()).toHaveLength(2)
  })
})

// ── the daily count ──────────────────────────────────────────────────────────

describe('GET /api/packets/daily-count', () => {
  it('counts the Chicago day: prepare: and request: packets, plus open requests not yet published', async () => {
    packet('pkt_today_1', 'prepare:a', 'task_a', '2026-10-28T10:15:00.000Z')
    packet('pkt_today_2', 'request:req_done', 'task_b', '2026-10-28T15:00:00.000Z')
    // 04:30Z is 23:30 CDT on the 27th: yesterday's packet.
    insertRow(db, 'task_packets', { id: 'pkt_yday', task_id: 'task_c', producer_key: 'prepare:c', created_at: '2026-10-28T04:30:00.000Z', closed_at: '2026-10-28T04:31:00.000Z', close_reason: 'dismissed' })
    // A producer that is neither prepare: nor request: does not count.
    insertRow(db, 'task_packets', { id: 'pkt_other', task_id: 'task_c', producer_key: 'gmail_draft:r-1', created_at: '2026-10-28T12:00:00.000Z', closed_at: '2026-10-28T12:01:00.000Z', close_reason: 'dismissed' })
    pendingRequest('req_open', 'task_c')
    // Published but not yet answered: counted once, as its packet.
    pendingRequest('req_done', 'task_b')
    insertRow(db, 'ai_requests', { id: 'req_failed', source_type: 'packet_prepare', source_id: 'task_c', prompt: 'p', status: 'failed', requested_by: NICK })
    const r = await call('GET', '/api/packets/daily-count?date=2026-10-28', { pb: true })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ date: '2026-10-28', used: 3, cap: 3 })
    const y = await call('GET', '/api/packets/daily-count?date=2026-10-27', { as: NICK })
    expect(y.body).toEqual({ date: '2026-10-27', used: 2, cap: 3 }) // pkt_yday + req_open
  })

  it('defaults to today, refuses a bad date, and is Nick or the PB key only', async () => {
    expect((await call('GET', '/api/packets/daily-count', { as: NICK })).body).toEqual({ date: '2026-10-28', used: 0, cap: 3 })
    expect((await call('GET', '/api/packets/daily-count?date=2026-13-01', { pb: true })).status).toBe(400)
    expect((await call('GET', '/api/packets/daily-count?date=2026-10-28', { as: CASEY })).status).toBe(403)
  })

  it('day bounds follow DST', () => {
    expect(ctDayBounds('2026-10-28')).toEqual({ start: '2026-10-28T05:00:00.000Z', end: '2026-10-29T05:00:00.000Z' })
    // 2026-11-01 is the fall-back day: 25 hours long.
    expect(ctDayBounds('2026-11-01')).toEqual({ start: '2026-11-01T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z' })
    expect(ctDayBounds('2026-12-15')).toEqual({ start: '2026-12-15T06:00:00.000Z', end: '2026-12-16T06:00:00.000Z' })
  })

  it('the count the route returns is the count Start enforces', async () => {
    pendingRequest('req_open')
    expect(await dailyPacketCount(env.DB, '2026-10-28')).toBe(1)
  })
})

// ── the request's routing ────────────────────────────────────────────────────

describe('a packet_prepare request routes as private, only to a capable runner, and publishes nothing', () => {
  async function started(): Promise<string> {
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])).status).toBe(200)
    return String(requests()[0].id)
  }
  const listed = (body: Record<string, unknown>) => (body.data as { id: string; landing_visibility?: string }[])

  it('the queue, the pending list and claim hide it from a runner without accepts=packet_prepare', async () => {
    const id = await started()
    const q = await call('POST', '/api/ai-requests/queue', { pb: true }, {})
    expect(q.status).toBe(200)
    expect(listed(q.body).map((x) => x.id)).not.toContain(id)
    const g = await call('GET', '/api/ai-requests?status=pending', { pb: true })
    expect(listed(g.body).map((x) => x.id)).not.toContain(id)
    const c = await call('POST', `/api/ai-requests/${id}/claim`, { pb: true }, { machine: 'home' })
    expect(c.status).toBe(409)
    expect(c.body.code).toBe('capability_required')
    expect(one('SELECT claim_attempts AS n FROM ai_requests WHERE id = ?', id)?.n).toBe(0)
  })

  it('a capable runner sees it (query param, or the claim body list) with landing_visibility author', async () => {
    const id = await started()
    const q = await call('POST', '/api/ai-requests/queue?accepts=packet_prepare', { pb: true }, {})
    expect(listed(q.body).map((x) => x.id)).toContain(id)
    const qb = await call('POST', '/api/ai-requests/queue', { pb: true }, { accepts: ['packet_prepare'] })
    expect(listed(qb.body).map((x) => x.id)).toContain(id)
    const g = await call('GET', '/api/ai-requests?source_type=packet_prepare&accepts=packet_prepare', { pb: true })
    expect(listed(g.body).find((x) => x.id === id)?.landing_visibility).toBe('author')
    const c = await call('POST', `/api/ai-requests/${id}/claim?accepts=packet_prepare`, { pb: true }, { machine: 'home', accepts: ['packet_prepare'] })
    expect(c.status).toBe(200)
    expect((c.body.data as { landing_visibility: string }).landing_visibility).toBe('author')
  })

  it('a claim with only the body list is accepted too', async () => {
    const id = await started()
    const c = await call('POST', `/api/ai-requests/${id}/claim`, { pb: true }, { machine: 'home', accepts: ['packet_prepare'] })
    expect(c.status).toBe(200)
  })

  it('a completed answer creates no comment and no notification of any kind', async () => {
    const id = await started()
    const c = await call('POST', `/api/ai-requests/${id}/claim?accepts=packet_prepare`, { pb: true }, { machine: 'home' })
    const token = (c.body.claim as { token: string }).token
    const before = { a: one('SELECT COUNT(*) AS n FROM activity_entries')?.n, n: one('SELECT COUNT(*) AS n FROM notifications')?.n }
    const done = await call('POST', `/api/ai-requests/${id}/response`, { pb: true }, { response: 'Packet published: pkt_x', status: 'completed', claim_token: token })
    expect(done.status).toBe(200)
    expect(one('SELECT COUNT(*) AS n FROM activity_entries')?.n).toBe(before.a)
    expect(one('SELECT COUNT(*) AS n FROM notifications')?.n).toBe(before.n)
  })

  it('POST /api/ai-requests refuses a packet_prepare request (only a Start makes one)', async () => {
    const r = await call('POST', '/api/ai-requests', { as: CASEY }, { source_type: 'packet_prepare', source_id: 'task_a', prompt: 'p' })
    expect(r.status).toBe(400)
    const n = await call('POST', '/api/ai-requests', { as: NICK }, { source_type: 'packet_prepare', source_id: 'task_a', prompt: 'p' })
    expect(n.status).toBe(400)
    expect(requests()).toHaveLength(0)
  })

  it('a row not made by the owner neither counts toward the cap nor reads private', async () => {
    // A legacy or foreign row, written before the POST refusal existed.
    for (const i of [1, 2, 3]) {
      insertRow(db, 'ai_requests', { id: `req_casey_${i}`, source_type: 'packet_prepare', source_id: 'task_b', prompt: 'p', status: 'pending', requested_by: CASEY })
    }
    expect(await dailyPacketCount(env.DB, '2026-10-28')).toBe(0)
    const g = await call('GET', '/api/ai-requests?source_type=packet_prepare&accepts=packet_prepare', { pb: true })
    expect(listed(g.body).find((x) => x.id === 'req_casey_1')?.landing_visibility ?? null).toBeNull()
    // Nick's Start is not blocked by them.
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])).status).toBe(200)
  })

  it('only the owner can start work from a week plan', async () => {
    const r = await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }], { as: CASEY })
    expect(r.status).not.toBe(200)
    expect(requests()).toHaveLength(0)
    expect(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a).toBeNull()
  })
})

// ── the cap holds inside the write, the follow-up Start, expiry, the mint ───

describe('week plan: atomic cap, start flips, expiry and the mint', () => {
  it('two Starts on two live offers cannot land 6: the second, racing on a stale read, does not land', async () => {
    seedPlan('task_plan_week_44b', SPEC, 'Plan your week (second offer)')
    const three = [
      { task_id: 'task_a', option_key: 'a1', text: null, start: true },
      { task_id: 'task_b', option_key: 'b1', text: null, start: true },
      { task_id: 'task_c', option_key: 'c1', text: null, start: true },
    ]
    // Fire both before either commits: each pre-check reads 0 used.
    const [r1, r2] = await Promise.all([answerPlan(three), answerPlan(three, { as: NICK }, 'task_plan_week_44b')])
    const ok = [r1, r2].filter((r) => r.status === 200)
    expect(ok).toHaveLength(1)
    const capped = [r1, r2].find((r) => r.status !== 200)!
    expect(capped.status).toBe(409)
    expect(capped.body.code).toBe('daily_cap')
    expect(requests()).toHaveLength(3)
    expect(await dailyPacketCount(env.DB, '2026-10-28')).toBe(3)
  })

  it('the cap term on the row write refuses even when the pre-check is bypassed', async () => {
    // Direct proof of the in-batch guard: the count is at the cap when the
    // batch runs, so the row write does not land and no request is inserted.
    const { weekPlanStart } = await import('../lib/week-plan-start')
    const mut = { table: 'tasks', record_id: PLAN, patch: { question_answer_json: answer([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }]) } }
    const current = one('SELECT * FROM tasks WHERE id = ?', PLAN)!
    const plan = await weekPlanStart(env, mut, current, { email: NICK } as never)
    expect(plan && 'capWhere' in plan).toBe(true)
    for (const i of [1, 2, 3]) pendingRequest(`req_late_${i}`)
    const capWhere = (plan as { capWhere: string }).capWhere
    const res = db.prepare(`UPDATE tasks SET title = title WHERE id = ?${capWhere}`).run(PLAN)
    expect(res.changes).toBe(0)
  })

  it('a daily_cap refusal is not recorded, so the same mutation is retryable', async () => {
    for (const i of [1, 2, 3]) pendingRequest(`req_full_${i}`)
    const r = await call('POST', '/api/mutations', { pb: true }, {
      mutations: [{
        mutation_id: 'mut_wp_retry', origin_machine: 'home', table: 'tasks', op: 'update', record_id: PLAN,
        base_seq: null, base_row_hash: null, client_ts: '2026-10-28T16:05:00Z', issued_at: '2026-10-28T16:05:00Z',
        patch: { question_answer_json: JSON.stringify(answer([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])) },
      }],
    })
    const res = (r.body.results as { status: string; code: string }[])[0]
    expect(res.code).toBe('daily_cap')
    expect(one("SELECT 1 AS x FROM processed_mutations WHERE mutation_id = 'mut_wp_retry'")).toBeUndefined()
  })

  it('a bad answer reports its own code even when the cap is full', async () => {
    for (const i of [1, 2, 3]) pendingRequest(`req_full_${i}`)
    const r = await answerPlan([{ task_id: 'task_z', option_key: 'a1', text: null, start: true }])
    expect(r.status).toBe(409)
    expect(String(r.body.error)).toMatch(/question_answer_invalid/)
    expect(r.body.code).not.toBe('daily_cap')
  })

  it('Save then Start: flipping a saved pick to start:true starts that pick only, under the cap', async () => {
    const saved = [
      { task_id: 'task_a', option_key: 'a1', text: null, start: true },
      { task_id: 'task_b', option_key: null, text: 'Ask Casey first', start: false },
    ]
    expect((await answerPlan(saved)).status).toBe(200)
    expect(requests().map((x) => x.source_id)).toEqual(['task_a'])
    const stored = JSON.parse(String(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a))
    const flip = { ...stored, choice: 'start', picks: stored.picks.map((p: { task_id: string }) => (p.task_id === 'task_b' ? { ...p, start: true } : p)) }
    const r = await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, { question_answer_json: flip })
    expect(r.status).toBe(200)
    expect(requests().map((x) => x.source_id)).toEqual(['task_a', 'task_b'])
    expect(JSON.parse(String(requests()[1].context)).direction).toBe('Ask Casey first')
    // The same flip again changes nothing and starts nothing.
    expect((await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, { question_answer_json: flip })).status).toBe(200)
    expect(requests()).toHaveLength(2)
  })

  it('a flip may change nothing else: not a direction, not an unstart, not the picks', async () => {
    const saved = [
      { task_id: 'task_a', option_key: 'a1', text: null, start: true },
      { task_id: 'task_b', option_key: 'b1', text: null, start: false },
    ]
    expect((await answerPlan(saved)).status).toBe(200)
    const stored = JSON.parse(String(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', PLAN)?.a))
    const bad = [
      { ...stored, choice: 'start', picks: [stored.picks[0], { ...stored.picks[1], option_key: 'b2', start: true }] },
      { ...stored, choice: 'start', picks: [{ ...stored.picks[0], start: false }, { ...stored.picks[1], start: true }] },
      { ...stored, choice: 'start', picks: [stored.picks[0]] },
      { ...stored, choice: 'start', at: '2026-10-28T17:00:00Z', picks: [stored.picks[0], { ...stored.picks[1], start: true }] },
    ]
    for (const a of bad) {
      const r = await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, { question_answer_json: a })
      expect(r.status).toBe(409)
      expect(String(r.body.error)).toMatch(/question_answer_frozen/)
    }
    expect(requests()).toHaveLength(1)
  })

  it('an expired offer takes no answer', async () => {
    vi.setSystemTime(new Date('2026-11-02T06:00:00Z'))
    const r = await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }])
    expect(r.status).toBe(409)
    expect(String(r.body.error)).toMatch(/question_expired/)
    expect(requests()).toHaveLength(0)
  })

  it('a week plan cannot be minted with an answer', async () => {
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_plan_born_answered', op: 'insert', route: 'test',
      user: { email: NICK } as unknown as AuthUser,
      payload: {
        title: 'Plan your week', description: 'Plan your week', assignee: 'nick-ingraham', assigned_by: 'pb',
        priority: 'medium', status: 'todo', source: 'week_plan', kind: 'question', completed: 0, completed_at: null,
        project_id: null, question_spec_json: SPEC,
        question_answer_json: answer([{ task_id: 'task_a', option_key: 'a1', text: null, start: true }]),
      },
    })
    expect(r.status).toBe('error')
    expect(r.reason).toMatch(/question_answer_invalid: a week plan is minted unanswered/)
    expect(one("SELECT 1 AS x FROM tasks WHERE id = 'task_plan_born_answered'")).toBeUndefined()
  })
})

// ── an answered week plan is never deleted ───────────────────────────────────

describe('week plan: delete', () => {
  const del = (op: 'update' | 'delete', patch?: Record<string, unknown>) => applyMutation(env, {
    table: 'tasks', record_id: PLAN, op, route: 'test',
    user: { email: NICK } as unknown as AuthUser,
    ...(patch ? { patch } : {}),
  })
  const alive = () => one('SELECT status, deleted_at FROM tasks WHERE id = ?', PLAN)

  it('an unanswered offer can be deleted (the Sunday supersede)', async () => {
    const r = await del('delete')
    expect(r.status).toBe('accepted')
    expect(alive()?.deleted_at).not.toBeNull()
  })

  it('an answered one refuses op=delete, a status deleted patch and a deleted_at patch, on every path', async () => {
    expect((await answerPlan([{ task_id: 'task_a', option_key: 'a1', text: null, start: false }])).status).toBe(200)
    for (const r of [await del('delete'), await del('update', { status: 'deleted' })]) {
      expect(r.status).toBe('error')
      expect(r.code).toBe('question_rule')
      expect(r.reason).toMatch(/week_plan_answered:/)
    }
    // deleted_at is not a writable update field at all (unknown_field), so
    // that path is refused before the week plan rule is reached.
    expect((await del('update', { deleted_at: '2026-10-28T16:06:00Z' })).status).toBe('error')
    const route = await call('POST', `/api/tasks/${PLAN}`, { as: NICK }, { status: 'deleted' })
    expect(route.status).toBe(409)
    expect(String(route.body.error)).toMatch(/week_plan_answered/)
    expect(alive()).toMatchObject({ status: 'todo', deleted_at: null })
  })
})
