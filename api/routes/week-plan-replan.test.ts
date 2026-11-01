/**
 * api/routes/week-plan-replan.test.ts -- the Re-plan button's Hub half (PB
 * Scratch/plans/2026-11-01-replan-RECONCILED.md).
 *
 * Runs the real worker against the migration-chain database (prodSchemaDb,
 * better-sqlite3 behind d1Adapter). Pins:
 *   - POST /api/week-plan/replan: Nick only; one pending row at most, even
 *     for two presses fired together (the guarded INSERT is one statement;
 *     here that is SQLite single-statement atomicity, the same property D1
 *     gives a single statement -- not a Miniflare run);
 *   - the row is a lane request: hidden from, and unclaimable by, a runner
 *     that does not name week_replan (an old listener); private landing;
 *     its answer publishes nothing; the generic POST refuses the source;
 *   - the superseded refusal: a FIRST answer to an older offer is refused
 *     (week_plan_superseded, code question_rule) while a newer offer exists,
 *     the newest is answerable, and a Start flip on an older ANSWERED plan
 *     still lands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { weekPlanSupersededCheck } from '../lib/week-plan-start'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PB_KEY = 'pb-key-for-tests'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'

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

const opt = (key: string, recommended = false) => ({
  key, label: `Option ${key}`, direction: `Direction ${key}`, deliverable_kind: 'gmail_draft', recommended,
})
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-10-26', tz: 'America/Chicago',
  prompt: 'What do you want to take the next step on this week?', expires_at: '2026-11-02T05:00:00Z',
  candidates: [
    { task_id: 'task_a', title: 'Answer Jane', why: 'sat 6 days', evidence: [], options: [opt('a1', true), opt('a2')] },
    { task_id: 'task_b', title: 'Review abstract', why: 'due Friday', evidence: [], options: [opt('b1', true), opt('b2')] },
  ],
}
const answer = (picks: unknown, extra: Record<string, unknown> = {}) =>
  ({ v: 1, choice: 'save', via: 'hub', at: '2026-10-28T16:05:00Z', picks, ...extra })
const save = (task_id: string, option_key: string) => ({ task_id, option_key, text: null, start: false })

function seedOffer(id: string, created_at: string, answerJson: unknown = null) {
  insertRow(db, 'tasks', {
    // A distinct title per offer, as PB's offer_name gives (the Hub keeps
    // one active title per owner).
    id, title: `Plan your week (${id})`, kind: 'question', status: 'todo', priority: 'medium',
    assignee: 'nick-ingraham', source: 'week_plan', project_id: null, created_at,
    question_spec_json: JSON.stringify(SPEC), question_answer_json: answerJson === null ? null : JSON.stringify(answerJson),
  })
}
const replans = () => all("SELECT * FROM ai_requests WHERE source_type = 'week_replan' ORDER BY created_at, id")

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T16:05:00Z')) // Wed 11:05 CDT
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  insertRow(db, 'tasks', { id: 'task_a', project_id: null, title: 'Answer Jane', assignee: 'nick-ingraham', status: 'todo' })
  insertRow(db, 'tasks', { id: 'task_b', project_id: null, title: 'Review abstract', assignee: 'nick-ingraham', status: 'todo' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', PB_API_KEY: PB_KEY } as unknown as Env
})

afterEach(() => { vi.useRealTimers() })

describe('POST /api/week-plan/replan', () => {
  it('Nick presses: one pending week_replan row with the typed payload; GET reads it back', async () => {
    const r = await call('POST', '/api/week-plan/replan', { as: NICK }, {})
    expect(r.status).toBe(201)
    const rows = replans()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'pending', source_id: 'week:2026-10-28', requested_by: NICK })
    expect(JSON.parse(String(rows[0].context))).toEqual({ v: 1, pressed_on: '2026-10-28' })
    const g = await call('GET', '/api/week-plan/replan', { as: NICK })
    expect(g.status).toBe(200)
    expect(g.body.data).toMatchObject({ id: rows[0].id, status: 'pending', claimed: false })
  })

  it('GET with nothing pressed yet is data:null', async () => {
    const g = await call('GET', '/api/week-plan/replan', { as: NICK })
    expect(g.body).toEqual({ data: null })
  })

  it('two presses fired together make ONE row; the other gets 409 replan_pending with its id', async () => {
    const [r1, r2] = await Promise.all([
      call('POST', '/api/week-plan/replan', { as: NICK }, {}),
      call('POST', '/api/week-plan/replan', { as: NICK }, {}),
    ])
    expect([r1.status, r2.status].sort()).toEqual([201, 409])
    const refused = r1.status === 409 ? r1 : r2
    expect(refused.body.code).toBe('replan_pending')
    expect(replans()).toHaveLength(1)
    expect(refused.body.id).toBe(replans()[0].id)
  })

  it('a press after the pending one settles makes a new row', async () => {
    await call('POST', '/api/week-plan/replan', { as: NICK }, {})
    db.prepare("UPDATE ai_requests SET status = 'completed' WHERE source_type = 'week_replan'").run()
    const r = await call('POST', '/api/week-plan/replan', { as: NICK }, {})
    expect(r.status).toBe(201)
    expect(replans()).toHaveLength(2)
  })

  it('a pending press no runner claimed for 10 minutes is failed and replaced by the next press', async () => {
    insertRow(db, 'ai_requests', {
      id: 'req_stale', source_type: 'week_replan', source_id: 'week:2026-10-28', prompt: 'p', status: 'pending',
      requested_by: NICK, context: '{"v":1,"pressed_on":"2026-10-28"}', created_at: '2000-01-01 00:00:00',
    })
    const r = await call('POST', '/api/week-plan/replan', { as: NICK }, {})
    expect(r.status).toBe(201)
    expect(one("SELECT status, response FROM ai_requests WHERE id = 'req_stale'")).toMatchObject({ status: 'failed', response: expect.stringMatching(/No PB laptop picked this up/) })
    expect(replans().filter((x) => x.status === 'pending')).toHaveLength(1)
  })

  it('a stale row a runner has claimed before (released or holding a lease) still blocks', async () => {
    insertRow(db, 'ai_requests', {
      id: 'req_tried', source_type: 'week_replan', source_id: 'week:2026-10-28', prompt: 'p', status: 'pending',
      requested_by: NICK, created_at: '2000-01-01 00:00:00', claim_attempts: 1,
    })
    const r = await call('POST', '/api/week-plan/replan', { as: NICK }, {})
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ code: 'replan_pending', id: 'req_tried' })
    expect(one("SELECT status FROM ai_requests WHERE id = 'req_tried'")?.status).toBe('pending')
  })

  it('a fresh unclaimed row still blocks', async () => {
    insertRow(db, 'ai_requests', { id: 'req_fresh', source_type: 'week_replan', source_id: 'week:2026-10-28', prompt: 'p', status: 'pending', requested_by: NICK })
    expect((await call('POST', '/api/week-plan/replan', { as: NICK }, {})).status).toBe(409)
  })

  it('a member gets 403 on both verbs and makes nothing', async () => {
    expect((await call('POST', '/api/week-plan/replan', { as: CASEY }, {})).status).toBe(403)
    expect((await call('GET', '/api/week-plan/replan', { as: CASEY })).status).toBe(403)
    expect(replans()).toHaveLength(0)
  })

  it('the generic POST /api/ai-requests refuses week_replan', async () => {
    const r = await call('POST', '/api/ai-requests', { as: NICK }, { source_type: 'week_replan', source_id: 'week:2026-10-28', prompt: 'p' })
    expect(r.status).toBe(400)
    expect(replans()).toHaveLength(0)
  })
})

describe('a week_replan request routes only to a runner that names it', () => {
  async function pressed(): Promise<string> {
    expect((await call('POST', '/api/week-plan/replan', { as: NICK }, {})).status).toBe(201)
    return String(replans()[0].id)
  }
  const listed = (body: Record<string, unknown>) => (body.data as { id: string; landing_visibility?: string }[])

  it('an old listener (no accepts, or accepts=packet_prepare only) never lists or claims it', async () => {
    const id = await pressed()
    for (const q of ['/api/ai-requests/queue', '/api/ai-requests/queue?accepts=packet_prepare']) {
      const r = await call('POST', q, { pb: true }, {})
      expect(r.status).toBe(200)
      expect(listed(r.body).map((x) => x.id)).not.toContain(id)
    }
    const g = await call('GET', '/api/ai-requests?status=pending', { pb: true })
    expect(listed(g.body).map((x) => x.id)).not.toContain(id)
    const g2 = await call('GET', '/api/ai-requests?status=pending&accepts=packet_prepare', { pb: true })
    expect(listed(g2.body).map((x) => x.id)).not.toContain(id)
    const c = await call('POST', `/api/ai-requests/${id}/claim?accepts=packet_prepare`, { pb: true }, { machine: 'home', accepts: ['packet_prepare'] })
    expect(c.status).toBe(409)
    expect(c.body.code).toBe('capability_required')
    expect(one('SELECT claim_attempts AS n FROM ai_requests WHERE id = ?', id)?.n).toBe(0)
  })

  it('a runner naming week_replan sees it with landing_visibility author and claims it', async () => {
    const id = await pressed()
    const q = await call('POST', '/api/ai-requests/queue', { pb: true }, { accepts: ['packet_prepare', 'week_replan'] })
    expect(listed(q.body).map((x) => x.id)).toContain(id)
    const g = await call('GET', '/api/ai-requests?source_type=week_replan&accepts=packet_prepare,week_replan', { pb: true })
    expect(listed(g.body).find((x) => x.id === id)?.landing_visibility).toBe('author')
    const c = await call('POST', `/api/ai-requests/${id}/claim`, { pb: true }, { machine: 'home', accepts: ['packet_prepare', 'week_replan'] })
    expect(c.status).toBe(200)
    expect((c.body.data as { landing_visibility: string }).landing_visibility).toBe('author')
    const s = await call('GET', '/api/week-plan/replan', { as: NICK })
    expect(s.body.data).toMatchObject({ id, status: 'pending', claimed: true })
  })

  it('a completed answer posts no comment and no notification', async () => {
    const id = await pressed()
    const c = await call('POST', `/api/ai-requests/${id}/claim?accepts=week_replan`, { pb: true }, { machine: 'home' })
    const token = (c.body.claim as { token: string }).token
    const before = { a: one('SELECT COUNT(*) AS n FROM activity_entries')?.n, n: one('SELECT COUNT(*) AS n FROM notifications')?.n }
    const done = await call('POST', `/api/ai-requests/${id}/response`, { pb: true }, { response: 'Offered a new plan for the week of 2026-10-26 (2 tasks): task_q', status: 'completed', claim_token: token })
    expect(done.status).toBe(200)
    expect(one('SELECT COUNT(*) AS n FROM activity_entries')?.n).toBe(before.a)
    expect(one('SELECT COUNT(*) AS n FROM notifications')?.n).toBe(before.n)
    const g = await call('GET', '/api/week-plan/replan', { as: NICK })
    expect(g.body.data).toMatchObject({ id, status: 'completed', response: expect.stringMatching(/^Offered/) })
  })
})

describe('the superseded refusal: only the newest week_plan offer takes a first answer', () => {
  it('a first answer to the older offer is refused while a newer one exists; the newer one lands', async () => {
    seedOffer('task_wp_old', '2026-10-25 21:00:00')
    seedOffer('task_wp_new', '2026-10-28 15:00:00')
    const r = await call('POST', '/api/tasks/task_wp_old', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(r.status).toBe(409)
    expect(String(r.body.error)).toContain('week_plan_superseded')
    expect(one('SELECT question_answer_json AS a FROM tasks WHERE id = ?', 'task_wp_old')?.a).toBeNull()
    const ok = await call('POST', '/api/tasks/task_wp_new', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(ok.status).toBe(200)
  })

  it('a newer offer that is already ANSWERED still supersedes the older waiting one', async () => {
    seedOffer('task_wp_old', '2026-10-25 21:00:00')
    seedOffer('task_wp_new', '2026-10-28 15:00:00', answer([save('task_b', 'b1')]))
    const r = await call('POST', '/api/tasks/task_wp_old', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(r.status).toBe(409)
  })

  it('a deleted newer offer does not supersede', async () => {
    seedOffer('task_wp_old', '2026-10-25 21:00:00')
    seedOffer('task_wp_new', '2026-10-28 15:00:00')
    db.prepare("UPDATE tasks SET status = 'deleted', deleted_at = '2026-10-28 15:30:00' WHERE id = 'task_wp_new'").run()
    const r = await call('POST', '/api/tasks/task_wp_old', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(r.status).toBe(200)
  })

  it('same created_at: the larger id is the newer (PB offer_order)', async () => {
    seedOffer('task_wp_x1', '2026-10-28 15:00:00')
    seedOffer('task_wp_x2', '2026-10-28 15:00:00')
    expect((await call('POST', '/api/tasks/task_wp_x1', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })).status).toBe(409)
    expect((await call('POST', '/api/tasks/task_wp_x2', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })).status).toBe(200)
  })

  it('a Start flip on an older ANSWERED plan still lands after a newer offer arrives', async () => {
    const stored = answer([save('task_a', 'a1')])
    seedOffer('task_wp_old', '2026-10-25 21:00:00', stored)
    seedOffer('task_wp_new', '2026-10-28 15:00:00')
    const flip = { ...stored, choice: 'start', picks: [{ ...save('task_a', 'a1'), start: true }] }
    const r = await call('POST', '/api/tasks/task_wp_old', { as: NICK }, { question_answer_json: flip })
    expect(r.status).toBe(200)
    expect(all("SELECT id FROM ai_requests WHERE source_type = 'packet_prepare'")).toHaveLength(1)
  })

  it('the write-time term refuses even when the pre-check passed (a newer offer lands in between)', async () => {
    seedOffer('task_wp_old', '2026-10-25 21:00:00')
    const mut = { table: 'tasks', record_id: 'task_wp_old', patch: { question_answer_json: answer([save('task_a', 'a1')]) } }
    const current = one('SELECT * FROM tasks WHERE id = ?', 'task_wp_old')!
    const check = await weekPlanSupersededCheck(env, mut as never, current)
    expect(check && 'where' in check).toBe(true)
    seedOffer('task_wp_new', '2026-10-28 15:00:00')
    const res = db.prepare(`UPDATE tasks SET title = title WHERE id = ?${(check as { where: string }).where}`).run('task_wp_old')
    expect(res.changes).toBe(0)
  })
})
