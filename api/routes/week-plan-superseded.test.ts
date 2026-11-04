/**
 * api/routes/week-plan-superseded.test.ts -- the arbiter's newest-offer rule, and
 * the retired week_replan lane (the Re-plan button, retired 2026-11-04).
 *
 * Runs the real worker against the migration-chain database (prodSchemaDb,
 * better-sqlite3 behind d1Adapter). Pins:
 *   - the superseded refusal: a FIRST answer to an older offer is refused
 *     (week_plan_superseded, code question_rule) while a newer offer exists,
 *     the newest is answerable, and a Start flip on an older ANSWERED plan
 *     still lands;
 *   - a week_replan row left behind stays out of every listener's reach: it
 *     must not turn into a Hermes question when its lane goes away.
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

  it('a later-minted offer for ANOTHER week supersedes nothing (refuter B)', async () => {
    const next = { ...SPEC, week_start: '2026-11-02', expires_at: '2026-11-09T06:00:00Z' }
    insertRow(db, 'tasks', { id: 'task_wp_next', title: 'Plan your week (next)', kind: 'question', status: 'todo', priority: 'medium',
      assignee: 'nick-ingraham', source: 'week_plan', project_id: null, created_at: '2026-11-01 21:00:00', question_spec_json: JSON.stringify(next) })
    seedOffer('task_wp_this', '2026-11-01 21:10:00') // this week (SPEC), minted later
    const r = await call('POST', '/api/tasks/task_wp_next', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(r.status).toBe(200)
    // And the reverse: next week's offer does not block this week's.
    const r2 = await call('POST', '/api/tasks/task_wp_this', { as: NICK }, { question_answer_json: answer([save('task_a', 'a1')]) })
    expect(r2.status).toBe(200)
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

describe('the retired week_replan lane', () => {
  const seedRow = (id: string, status = 'pending') => insertRow(db, 'ai_requests', {
    id, source_type: 'week_replan', source_id: `replan_${id}`, prompt: 'Re-plan', status,
    requested_by: NICK, context: JSON.stringify({ v: 1, pressed_on: '2026-10-28' }),
  })
  const ids = (body: Record<string, unknown>) => (body.data as { id: string }[]).map((r) => r.id)

  it('the routes are gone', async () => {
    expect((await call('GET', '/api/week-plan/replan', { as: NICK })).status).toBe(404)
    expect((await call('POST', '/api/week-plan/replan', { as: NICK }, {})).status).toBe(404)
  })

  it('a row pending at cutover reaches no listener, whatever it names', async () => {
    seedRow('r_old')
    for (const path of ['/api/ai-requests/queue', '/api/ai-requests/queue?accepts=packet_prepare', '/api/ai-requests/queue?accepts=packet_prepare,week_replan']) {
      const q = await call('POST', path, { pb: true }, {})
      expect(q.status).toBe(200)
      expect(ids(q.body)).not.toContain('r_old')
    }
    const g = await call('GET', '/api/ai-requests?status=pending', { pb: true })
    expect(ids(g.body)).not.toContain('r_old')
    expect(one('SELECT claim_attempts AS n, status FROM ai_requests WHERE id = ?', 'r_old')).toMatchObject({ n: 0, status: 'pending' })
  })

  it('the generic POST still refuses the type', async () => {
    const r = await call('POST', '/api/ai-requests', { as: NICK }, { source_type: 'week_replan', source_id: 'x', prompt: 'p' })
    expect(r.status).toBe(400)
    expect(all("SELECT id FROM ai_requests WHERE source_type = 'week_replan'")).toHaveLength(0)
  })
})
