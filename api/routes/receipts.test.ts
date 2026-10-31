/**
 * api/routes/receipts.test.ts -- receipts: what PB changed, and Undo (schema-v154).
 *
 * Decision: PB Context/Decisions/2026-10-30-receipts-and-headless-process.md.
 * Runs the real worker's /api/mutations against the migration-chain database
 * (prodSchemaDb), so v154's CHECKs, unique indexes and trigger are prod's.
 * The receipt routes are not wired into api/index.ts yet (registerReceiptRoutes
 * is), so their handlers are called directly with a raw env. Pins:
 *   - a receipt line that cannot be written rolls the PB write back;
 *   - update (changed fields only), insert, dedup adoption (no line), delete,
 *     append and the derived project move each record what they should;
 *   - a write with no run header lands in the day's unattributed run; a
 *     browser write records nothing;
 *   - Undo refuses an ABA-changed row, undoes once, and is itself a line;
 *   - claims: one winner, the loser 409s, a stale generation cannot settle;
 *   - only Nick reads the overnight receipt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import type { AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { hashTouched, applyReceiptUndo } from './mutations'
import { withReceiptOrigin, receiptOriginOf, receiptStatements, tombstoneUnworked } from '../lib/receipts'
import { receiptsMiddleware } from '../lib/receipts-middleware'
import { pruneAllLedgers } from '../lib/ledger-retention'
import { Hono } from 'hono'
import { postActivityEntry } from '../lib/activity-entry'
import {
  handleStartRun, handleFinishRun, handlePostLine, handleClaim, handleSettleClaim,
  handleOvernight, handleUndoLine, handleSeen, isReceiptOwner, isReceiptWriter,
} from './receipts'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PB_KEY = 'pb-key-for-tests'
const NICK = 'ingra107@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const NICK_USER = { email: NICK, slug: 'nick-ingraham', name: 'Nick Ingraham' } as unknown as AuthUser
const RUN = 'run_test_process_1'

let db: InstanceType<typeof Database>
let env: Env
const one = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const all = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]
const lines = () => all('SELECT * FROM receipt_lines ORDER BY created_at, id')
const task = (id = 'task_a') => one('SELECT * FROM tasks WHERE id = ?', id)!

let n = 0
async function pbMutate(muts: Record<string, unknown>[], headers: Record<string, string> = { 'X-PB-Run': RUN, 'X-PB-Lane': 'process', 'X-PB-Machine': 'home' }) {
  const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PB_KEY}`, ...headers },
    body: JSON.stringify({ mutations: muts }),
  }), env, CTX)
  return (await res.json() as { results: Record<string, unknown>[] }).results
}

async function upd(patch: Record<string, unknown>, id = 'task_a', table = 'tasks') {
  const cur = one(`SELECT * FROM ${table} WHERE id = ?`, id)!
  return {
    mutation_id: `mut_t${++n}`, origin_machine: 'home', table, record_id: id, op: 'update',
    base_seq: cur.seq, base_row_hash: await hashTouched(cur, Object.keys(patch)), patch, depends_on: null,
    client_ts: '2026-10-30T12:00:00Z', issued_at: '2026-10-30T12:00:00Z',
  }
}
function ins(id: string, payload: Record<string, unknown>) {
  return {
    mutation_id: `mut_t${++n}`, origin_machine: 'home', table: 'tasks', record_id: id, op: 'insert',
    base_seq: null, base_row_hash: null, payload, depends_on: null,
    client_ts: '2026-10-30T12:00:00Z', issued_at: '2026-10-30T12:00:00Z',
  }
}
function del(id: string) {
  return {
    mutation_id: `mut_t${++n}`, origin_machine: 'home', table: 'tasks', record_id: id, op: 'delete',
    base_seq: null, base_row_hash: null, depends_on: null,
    client_ts: '2026-10-30T12:00:00Z', issued_at: '2026-10-30T12:00:00Z',
  }
}

const post = (body: unknown) => new Request('https://hub.test/x', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const undo = async (lineId: string, isNick = true) => {
  const r = await handleUndoLine(lineId, post({}), env, NICK_USER, isNick)
  return { status: r.status, body: await r.json() as Record<string, unknown> }
}
const asJson = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, unknown> })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-30T09:00:00Z'))
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_a', project_id: PROJECT, title: 'Answer Jane', assignee: 'nick-ingraham', status: 'todo', priority: 'medium' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', PB_API_KEY: PB_KEY } as unknown as Env
})

afterEach(() => { vi.useRealTimers() })

describe('capture at the write boundary', () => {
  it('a receipt line that cannot be written rolls the PB write back', async () => {
    db.exec("CREATE TRIGGER t_fail_receipt BEFORE INSERT ON receipt_lines BEGIN SELECT RAISE(ABORT, 'receipt boom'); END")
    const [r] = await pbMutate([await upd({ priority: 'high' })])
    expect(r.status).toBe('error')
    expect(task().priority).toBe('medium')
    // The constraint failure is recorded as the mutation's apply error (the
    // pre-receipts contract for a deterministic batch failure); nothing landed.
    expect(String(r.reason)).toMatch(/receipt boom/)
    expect(one("SELECT COUNT(*) AS c FROM processed_mutations WHERE outcome = 'accepted'")?.c).toBe(0)
    expect(one('SELECT COUNT(*) AS c FROM receipt_runs')?.c).toBe(0)
  })

  it('an update records the changed fields only, with the landed version', async () => {
    const [r] = await pbMutate([await upd({ priority: 'high', title: 'Answer Jane' })])
    expect(r.status).toBe('accepted')
    const [l] = lines()
    expect(l).toMatchObject({ run_id: RUN, kind: 'change', op: 'update', entity_type: 'tasks', entity_id: 'task_a', inverse_kind: 'patch' })
    expect(JSON.parse(l.fields_before_json as string)).toEqual({ priority: 'medium' })
    expect(JSON.parse(l.fields_after_json as string)).toEqual({ priority: 'high' })
    expect(l.landed_version).toBe(task().seq)
    expect(one('SELECT * FROM receipt_runs WHERE id = ?', RUN)).toMatchObject({ lane: 'process', machine: 'home', origin: 'pb' })
  })

  it('an update that changes nothing records nothing', async () => {
    await pbMutate([await upd({ priority: 'medium' })])
    expect(lines()).toHaveLength(0)
  })

  it('an insert records a tombstone-able line; a dedup adoption records none', async () => {
    const [a] = await pbMutate([ins('task_new', { project_id: PROJECT, title: 'Draft aims', status: 'todo', assignee: 'nick-ingraham' })])
    expect(a.status).toBe('accepted')
    const [l] = lines()
    expect(l).toMatchObject({ op: 'insert', entity_id: 'task_new', inverse_kind: 'tombstone' })
    expect(JSON.parse(l.fields_after_json as string)).toMatchObject({ title: 'Draft aims' })
    const [b] = await pbMutate([ins('task_dup', { project_id: PROJECT, title: 'Draft aims', status: 'todo', assignee: 'nick-ingraham' })])
    expect(b.status).toBe('accepted')
    expect(one("SELECT id FROM tasks WHERE id = 'task_dup'")).toBeUndefined()
    expect(lines()).toHaveLength(1)
  })

  it('a delete records a patch line that restores the task', async () => {
    const [r] = await pbMutate([del('task_a')])
    expect(r.status).toBe('accepted')
    const [l] = lines()
    expect(l).toMatchObject({ op: 'delete', inverse_kind: 'patch' })
    expect(JSON.parse(l.fields_before_json as string)).toEqual({ deleted_at: null, status: 'todo' })
    const u = await undo(l.id as string)
    expect(u.status).toBe(200)
    expect(task()).toMatchObject({ status: 'todo', deleted_at: null })
  })

  it('a completion records the derived project move under the same action', async () => {
    const [r] = await pbMutate([await upd({ status: 'done', completed: 1, completed_at: '2026-10-30T09:00:00Z' })])
    expect(r.reason ?? r.status).toBe('accepted')
    const ls = lines()
    const move = ls.find((l) => l.entity_type === 'projects')
    expect(move).toMatchObject({ action_id: r.mutation_id, inverse_kind: 'none', source_ref: 'derived:project_movement' })
    expect(ls.find((l) => l.entity_type === 'tasks')?.action_id).toBe(r.mutation_id)
  })

  it('a PB activity post records an append line; Undo hides it once', async () => {
    const pbReq = new Request('https://hub.test/api/tasks/task_a/updates', { headers: { Authorization: `Bearer ${PB_KEY}`, 'X-PB-Run': RUN, 'X-PB-Lane': 'process' } })
    const r = await postActivityEntry({
      env: withReceiptOrigin(env, pbReq, true), user: NICK_USER, entityType: 'task', entityId: 'task_a',
      kind: 'update', body: 'Sent Jane the date range', actorSlug: 'nick-ingraham',
    } as Parameters<typeof postActivityEntry>[0])
    expect(r.ok).toBe(true)
    const [l] = lines()
    expect(l).toMatchObject({ op: 'append', entity_type: 'activity_entries', inverse_kind: 'hide_entry' })
    const u1 = await undo(l.id as string)
    expect(u1.status).toBe(200)
    expect(one('SELECT hidden_at FROM activity_entries WHERE id = ?', l.entity_id)?.hidden_at).toBeTruthy()
    expect((await undo(l.id as string)).body.code).toBe('already_undone')
  })

  it('a PB write with no run header lands in the day\'s unattributed run; a browser write records nothing', async () => {
    await pbMutate([await upd({ priority: 'high' })], { 'X-PB-Machine': 'work' })
    const run = one('SELECT * FROM receipt_runs')!
    expect(run).toMatchObject({ id: 'unattributed:work:2026-10-30', origin: 'unattributed', lane: 'unattributed' })
    expect(lines()[0].run_id).toBe(run.id)
    // A spoofed unattributed run id is ignored too.
    expect(receiptOriginOf(new Request('https://x', { headers: { 'X-PB-Run': 'unattributed:x:1' } }), true)?.origin).toBe('unattributed')
    expect(receiptOriginOf(new Request('https://x', { headers: { 'X-PB-Run': RUN } }), false)).toBeNull()
    const res = await worker.fetch(new Request('https://hub.test/api/mutations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': NICK },
      body: JSON.stringify({ mutations: [{ ...(await upd({ priority: 'low' })), origin_machine: 'hub_ui:test', base_seq: null, base_row_hash: null }] }),
    }), env, CTX)
    expect(res.status).toBe(200)
    expect(task().priority).toBe('low')
    expect(lines()).toHaveLength(1)
  })
})

describe('Undo', () => {
  it('refuses an ABA change: the value came back but the version moved', async () => {
    await pbMutate([await upd({ priority: 'high' })])
    const [l] = lines()
    db.prepare("UPDATE tasks SET priority = 'low' WHERE id = 'task_a'").run()
    db.prepare("UPDATE tasks SET priority = 'high' WHERE id = 'task_a'").run()
    const u = await undo(l.id as string)
    expect(u).toMatchObject({ status: 409, body: { code: 'changed_since' } })
    expect(task().priority).toBe('high')
    expect(one('SELECT undone_at FROM receipt_lines WHERE id = ?', l.id)?.undone_at).toBeNull()
  })

  it('undoes once, writes its own line, and the second undo is already_undone', async () => {
    await pbMutate([await upd({ priority: 'high' })])
    const [l] = lines()
    const u = await undo(l.id as string)
    expect(u.status).toBe(200)
    expect(task().priority).toBe('medium')
    const undoLine = one('SELECT * FROM receipt_lines WHERE id = ?', u.body.undo_line_id)!
    expect(undoLine).toMatchObject({ run_id: RUN, source_ref: `undo:${l.id}`, inverse_kind: 'none' })
    expect(one('SELECT undo_line_id FROM receipt_lines WHERE id = ?', l.id)?.undo_line_id).toBe(u.body.undo_line_id)
    expect((await undo(l.id as string))).toMatchObject({ status: 409, body: { code: 'already_undone' } })
    // The schema refuses a second undo line even if a route raced past the read.
    expect(() => insertRow(db, 'receipt_lines', {
      id: 'rcl_x', run_id: RUN, action_id: 'a', kind: 'change', entity_type: 'tasks', entity_id: 'task_a', op: 'update',
      source_ref: `undo:${l.id}`, summary: 's', inverse_kind: 'none', inverse_reason: 'r', created_at: 'now',
    })).toThrow(/UNIQUE/)
  })

  it('tombstones a created task; refuses one somebody has worked', async () => {
    await pbMutate([ins('task_new', { project_id: PROJECT, title: 'Draft aims', status: 'todo', assignee: 'nick-ingraham' })])
    await pbMutate([ins('task_new2', { project_id: PROJECT, title: 'Draft budget', status: 'todo', assignee: 'nick-ingraham' })])
    const l1 = lines().find((l) => l.entity_id === 'task_new')!
    const l2 = lines().find((l) => l.entity_id === 'task_new2')!
    insertRow(db, 'activity_entries', {
      id: 'ae_1', entity_type: 'task', entity_id: 'task_new2', kind: 'comment', visibility: 'team',
      actor_slug: 'nick-ingraham', body: 'started on this', created_at: '2026-10-30T09:00:00Z',
    })
    const u1 = await undo(l1.id as string)
    expect(u1.status).toBe(200)
    expect(task('task_new').deleted_at).toBeTruthy()
    expect((await undo(l2.id as string)).body.code).toBe('changed_since')
  })

  it('a none line is not_reversible; only Nick may undo', async () => {
    await pbMutate([await upd({ status: 'done', completed: 1, completed_at: '2026-10-30T09:00:00Z' })])
    const move = lines().find((l) => l.entity_type === 'projects')!
    expect((await undo(move.id as string)).body.code).toBe('not_reversible')
    const t = lines().find((l) => l.entity_type === 'tasks')!
    expect((await undo(t.id as string, false)).status).toBe(403)
  })
})

describe('runs, posted lines, claims', () => {
  it('opens and finishes a run; posts a failure line idempotently', async () => {
    const open = await asJson(await handleStartRun(post({ lane: 'process', machine: 'home', run_id: 'run_x' }), env, true))
    expect(open).toMatchObject({ status: 201, body: { run_id: 'run_x', lane: 'process' } })
    const body = { kind: 'failure', summary: 'Inbox filing failed: locked file', action_id: 'file:home:abc' }
    const a = await asJson(await handlePostLine('run_x', post(body), env, true))
    const b = await asJson(await handlePostLine('run_x', post(body), env, true))
    expect(a.status).toBe(201)
    expect(b).toMatchObject({ status: 200, body: { line_id: a.body.line_id, replayed: true } })
    expect((await asJson(await handlePostLine('run_x', post({ ...body, source_ref: 'undo:x' }), env, true))).status).toBe(400)
    expect((await asJson(await handleFinishRun('run_x', env, true))).body.finished_at).toBeTruthy()
    expect((await handleStartRun(post({ lane: 'process', machine: 'home' }), env, false)).status).toBe(403)
  })

  it('a claim has one winner; a stale generation cannot settle', async () => {
    await handleStartRun(post({ lane: 'process', machine: 'home', run_id: 'run_a' }), env, true)
    await handleStartRun(post({ lane: 'process', machine: 'work', run_id: 'run_b' }), env, true)
    const key = 'comment:ae_9:1'
    const [x, y] = await Promise.all([
      asJson(await handleClaim(post({ source_key: key, run_id: 'run_a', lease_seconds: 60 }), env, true)),
      asJson(await handleClaim(post({ source_key: key, run_id: 'run_b', lease_seconds: 60 }), env, true)),
    ])
    expect([x.status, y.status].sort()).toEqual([201, 409])
    const winner = x.status === 201 ? x : y
    expect(winner.body.generation).toBe(1)
    // The lease runs out; the other run takes over at generation 2.
    vi.setSystemTime(new Date('2026-10-30T09:02:00Z'))
    const take = await asJson(await handleClaim(post({ source_key: key, run_id: 'run_b' }), env, true))
    expect(take).toMatchObject({ status: 201, body: { generation: 2, run_id: 'run_b' } })
    const stale = await asJson(await handleSettleClaim(key, post({ state: 'done', generation: 1 }), env, true))
    expect(stale).toMatchObject({ status: 409, body: { code: 'stale_generation' } })
    const ok = await asJson(await handleSettleClaim(key, post({ state: 'done', generation: 2 }), env, true))
    expect(ok).toMatchObject({ status: 200, body: { state: 'done' } })
    expect((await asJson(await handleClaim(post({ source_key: key, run_id: 'run_a' }), env, true))).body.code).toBe('held')
  })
})

describe('the overnight read', () => {
  it('is Nick only; lists runs with counts and lines; seen marks them', async () => {
    await pbMutate([await upd({ priority: 'high' })])
    const u = new URL('https://hub.test/api/receipts/overnight?since=2026-10-30T00:00:00Z')
    expect((await handleOvernight(u, env, false)).status).toBe(403)
    const r = await asJson(await handleOvernight(u, env, true))
    const runs = r.body.runs as Record<string, unknown>[]
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ run_id: RUN, lane: 'process', state: 'open', counts: { change: 1, failure: 0, left_for_nick: 0, undone: 0 } })
    expect((runs[0].lines as Record<string, unknown>[])[0]).toMatchObject({ undoable: true, fields_after: { priority: 'high' } })
    expect((await handleSeen(post({}), env, false)).status).toBe(403)
    expect((await asJson(await handleSeen(post({}), env, true))).body.updated).toBe(1)
  })
})

describe('cold review fixes', () => {
  it('a PB project edit can be undone: the own-movement stamp rides the edit batch', async () => {
    for (const patch of [{ title: 'R03 renamed' }, { status: 'waiting_external' }]) {
      const [r] = await pbMutate([await upd(patch, PROJECT, 'projects')])
      expect(r.reason ?? r.status).toBe('accepted')
      const line = lines().find((l) => l.entity_type === 'projects' && l.action_id === r.mutation_id && l.source_ref === null)!
      expect(line.landed_version).toBe(one('SELECT seq FROM projects WHERE id = ?', PROJECT)?.seq)
      const u = await undo(line.id as string)
      expect(u.status).toBe(200)
    }
    expect(one('SELECT title, status FROM projects WHERE id = ?', PROJECT)).toMatchObject({ title: 'R03', status: 'active' })
  })

  it('a PB product stage edit can be undone', async () => {
    const prod = one('SELECT * FROM products WHERE project_id = ?', PROJECT)!
    const next = one('SELECT stage FROM product_stages WHERE kind = ? AND stage <> ? AND deleted_at IS NULL ORDER BY ordinal LIMIT 1', prod.kind, prod.stage)!
    const [r] = await pbMutate([await upd({ stage: next.stage }, prod.id as string, 'products')])
    expect(r.reason ?? r.status).toBe('accepted')
    const line = lines().find((l) => l.entity_type === 'products')!
    expect(JSON.parse(line.fields_after_json as string)).toHaveProperty('stage', next.stage)
    expect((await undo(line.id as string)).status).toBe(200)
    expect(one('SELECT stage FROM products WHERE id = ?', prod.id)?.stage).toBe(prod.stage)
  })

  it('a run whose id PB reuses is kept by the 90-day prune while it still collects lines', async () => {
    insertRow(db, 'receipt_runs', { id: 'run_stable', lane: 'process', machine: 'home', started_at: '2025-01-01T00:00:00.000Z', origin: 'pb', active_at: '2025-01-01T00:00:00.000Z' })
    insertRow(db, 'receipt_runs', { id: 'run_old', lane: 'process', machine: 'home', started_at: '2025-01-01T00:00:00.000Z', origin: 'pb', active_at: '2025-01-01T00:00:00.000Z' })
    const recent = new Date(Date.now()).toISOString()
    insertRow(db, 'receipt_lines', { id: 'rcl_new', run_id: 'run_stable', action_id: 'a1', kind: 'failure', summary: 'x', inverse_kind: 'none', inverse_reason: 'r', created_at: '2999-01-01T00:00:00.000Z' })
    insertRow(db, 'receipt_lines', { id: 'rcl_oldl', run_id: 'run_old', action_id: 'a2', kind: 'failure', summary: 'x', inverse_kind: 'none', inverse_reason: 'r', created_at: '2025-01-02T00:00:00.000Z' })
    expect(one("SELECT active_at FROM receipt_runs WHERE id = 'run_stable'")?.active_at).toBe('2999-01-01T00:00:00.000Z')
    await pruneAllLedgers(env.DB)
    expect(one("SELECT id FROM receipt_runs WHERE id = 'run_stable'")).toBeTruthy()
    expect(one("SELECT id FROM receipt_lines WHERE id = 'rcl_new'")).toBeTruthy()
    expect(one("SELECT id FROM receipt_runs WHERE id = 'run_old'")).toBeUndefined()
    expect(one("SELECT id FROM receipt_lines WHERE id = 'rcl_oldl'")).toBeUndefined()
    // Re-opening a reused run id clears finished_at and moves active_at.
    await handleStartRun(post({ lane: 'process', machine: 'home', run_id: 'run_x2' }), env, true)
    await handleFinishRun('run_x2', env, true)
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z'))
    await handleStartRun(post({ lane: 'process', machine: 'home', run_id: 'run_x2' }), env, true)
    expect(one("SELECT finished_at, active_at FROM receipt_runs WHERE id = 'run_x2'")).toMatchObject({ finished_at: null, active_at: '2026-10-31T09:00:00.000Z' })
    expect(recent).toBeTruthy()
  })

  it('Seen is a high-water mark: a line after the tap shows as new', async () => {
    await pbMutate([await upd({ priority: 'high' })])
    vi.setSystemTime(new Date('2026-10-30T09:05:00Z'))
    await handleSeen(post({}), env, true)
    vi.setSystemTime(new Date('2026-10-30T09:10:00Z'))
    await pbMutate([await upd({ priority: 'low' })])
    const u = new URL('https://hub.test/api/receipts/overnight?since=2026-10-30T00:00:00Z&unseen=1')
    const r = await asJson(await handleOvernight(u, env, true))
    const [run] = r.body.runs as Record<string, unknown>[]
    expect(run.counts).toMatchObject({ change: 2, unseen: 1 })
    expect((run.lines as Record<string, unknown>[]).map((l) => l.seen)).toEqual([true, false])
    expect((r.body.lanes as Record<string, unknown>[])[0]).toMatchObject({ unseen_lines: 1, unseen_runs: 1 })
  })

  it('a tombstone is refused when the task has a child task or a link made after it', async () => {
    await pbMutate([ins('task_c1', { project_id: PROJECT, title: 'With child', status: 'todo', assignee: 'nick-ingraham' })])
    await pbMutate([ins('task_c2', { project_id: PROJECT, title: 'With link', status: 'todo', assignee: 'nick-ingraham' })])
    insertRow(db, 'tasks', { id: 'task_kid', project_id: PROJECT, title: 'child', status: 'todo', assignee: 'nick-ingraham', parent_id: 'task_c1' })
    insertRow(db, 'links', { id: 'link_01AAAAAAAAAAAAAAAAAAAAAAAA', owner_table: 'tasks', owner_id: 'task_c2', role: 'reference', type: 'url', canonical_url: 'https://x.test/a', short_title: 'a', last_mutation_id: 'mut_other' })
    for (const id of ['task_c1', 'task_c2']) {
      const l = lines().find((x) => x.entity_id === id)!
      expect((await undo(l.id as string)).body.code).toBe('changed_since')
      expect(task(id).deleted_at).toBeNull()
    }
  })

  it('the worked predicate holds inside the delete itself, not only in the pre-check', async () => {
    await pbMutate([ins('task_r', { project_id: PROJECT, title: 'Race me', status: 'todo', assignee: 'nick-ingraham' })])
    const l = lines().find((x) => x.entity_id === 'task_r')!
    // A comment lands after a pre-check that passed: the delete's WHERE stops it.
    insertRow(db, 'activity_entries', {
      id: 'ae_r', entity_type: 'task', entity_id: 'task_r', kind: 'comment', visibility: 'team',
      actor_slug: 'nick-ingraham', body: 'raced in', created_at: '2026-10-30T09:00:00Z',
    })
    const r = await applyReceiptUndo(env, {
      table: 'tasks', record_id: 'task_r', op: 'delete', user: NICK_USER,
      guard: { check: async () => null, statements: () => [], where: tombstoneUnworked('task_r', l.action_id as string) },
    })
    expect(r.status).toBe('error')
    expect(task('task_r').deleted_at).toBeNull()
  })

  it('only Nick\'s own session owns the receipt', () => {
    const nick = { pbKey: false, callerKind: 'member', slug: 'nick-ingraham', pi: true }
    expect(isReceiptOwner(nick)).toBe(true)
    expect(isReceiptOwner({ ...nick, pbKey: true })).toBe(false)
    expect(isReceiptOwner({ ...nick, slug: 'second-pi' })).toBe(false)
    expect(isReceiptOwner({ ...nick, pi: false })).toBe(false)
    expect(isReceiptOwner({ pbKey: false, callerKind: 'member', slug: 'casey-eddington', pi: false })).toBe(false)
    expect(isReceiptOwner({ ...nick, callerKind: 'watcher' })).toBe(false)
    expect(isReceiptWriter({ pbKey: true, callerKind: null, slug: null, pi: false })).toBe(true)
    expect(isReceiptWriter({ pbKey: false, callerKind: 'member', slug: 'second-pi', pi: true })).toBe(false)
  })
})

describe('the catch-all', () => {
  function app() {
    type C = { Variables: { env: Env; pb: boolean } }
    const a = new Hono<C>()
    a.use('/api/*', async (c, next) => { c.set('env', env); c.set('pb', c.req.header('Authorization') === `Bearer ${PB_KEY}`); await next() })
    a.use('/api/*', receiptsMiddleware({ getEnv: (c) => c.get('env'), setEnv: (c, e) => c.set('env', e), pbKey: (c) => c.get('pb') }))
    a.post('/api/raw/:id', async (c) => { await c.get('env').DB.prepare("UPDATE tasks SET priority = 'urgent' WHERE id = ?").bind(c.req.param('id')).run(); return c.json({ ok: true }) })
    a.post('/api/receipted/:id', async (c) => {
      const e = c.get('env')
      await e.DB.batch(receiptStatements(e, {
        actionId: 'act1', entityType: 'tasks', entityId: c.req.param('id'), op: 'update', before: { a: 1 },
        after: { kind: 'value', after: { a: 2 }, version: null }, summary: 's', inverseKind: 'none', inverseReason: 'r',
        gate: { sql: '1 = 1', vals: [] },
      }, '2026-10-30T09:00:00.000Z'))
      return c.json({ ok: true })
    })
    a.post('/api/refused', (c) => c.json({ error: 'no' }, 409))
    // A POST that only reads (the listener's queue poll is one).
    a.post('/api/read-post', async (c) => { await c.get('env').DB.prepare('SELECT id FROM tasks WHERE id = ?').bind('task_a').all(); return c.json({ ok: true }) })
    // A POST whose write matched nothing.
    a.post('/api/no-change', async (c) => { await c.get('env').DB.prepare("UPDATE tasks SET priority = 'urgent' WHERE id = ?").bind('no_such_task').run(); return c.json({ ok: true }) })
    // A raw write inside a batch, next to a read.
    a.post('/api/batch-write/:id', async (c) => {
      const db = c.get('env').DB
      await db.batch([db.prepare('SELECT 1'), db.prepare("UPDATE tasks SET priority = 'low' WHERE id = ?").bind(c.req.param('id'))])
      return c.json({ ok: true })
    })
    a.get('/api/read', (c) => c.json({ ok: true }))
    return a
  }
  const hit = (a: ReturnType<typeof app>, method: string, path: string, pb = true) =>
    a.fetch(new Request(`https://hub.test${path}`, { method, headers: pb ? { Authorization: `Bearer ${PB_KEY}`, 'X-PB-Run': RUN } : {} }))

  it('a PB write no boundary receipted gets one summary line under its route pattern', async () => {
    const a = app()
    expect((await hit(a, 'POST', '/api/raw/task_a')).status).toBe(200)
    const ls = lines()
    expect(ls).toHaveLength(1)
    expect(ls[0]).toMatchObject({ run_id: RUN, kind: 'change', op: 'external', summary: 'POST /api/raw/:id', inverse_kind: 'none', inverse_reason: 'route not individually receipted' })
  })

  it('no summary line for a receipted write, a read, a refusal, or a browser write', async () => {
    const a = app()
    await hit(a, 'POST', '/api/receipted/task_a')
    expect(lines().map((l) => l.summary)).toEqual(['s'])
    await hit(a, 'GET', '/api/read')
    await hit(a, 'POST', '/api/refused')
    await hit(a, 'POST', '/api/raw/task_a', false)
    expect(lines()).toHaveLength(1)
  })

  it('a PB POST that only reads, or whose write changed 0 rows, gets no line', async () => {
    const a = app()
    expect((await hit(a, 'POST', '/api/read-post')).status).toBe(200)
    expect((await hit(a, 'POST', '/api/no-change')).status).toBe(200)
    expect(lines()).toHaveLength(0)
  })

  it('a raw write inside a batch is counted: one summary line', async () => {
    const a = app()
    expect((await hit(a, 'POST', '/api/batch-write/task_a')).status).toBe(200)
    expect(lines().map((l) => l.summary)).toEqual(['POST /api/batch-write/:id'])
    expect(task().priority).toBe('low')
  })

  it('the listener queue poll through the worker writes no line', async () => {
    const res = await worker.fetch(new Request('https://hub.test/api/ai-requests/queue', {
      method: 'POST', headers: { Authorization: `Bearer ${PB_KEY}`, 'Content-Type': 'application/json' }, body: '{}',
    }), env, CTX)
    expect(res.status).toBeLessThan(300)
    expect(lines()).toHaveLength(0)
  })
})

describe('through the worker: who may read, undo and acknowledge', () => {
  const SECOND_PI = 'otherpi@umn.edu'
  const CASEY = 'eddin022@umn.edu'
  beforeEach(() => {
    db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK, SECOND_PI]))
    _resetPiEmailsCacheForTests()
    insertRow(db, 'team_members', { id: 'tm-pi2', name: 'Other PI', slug: 'other-pi', role: 'PI', member_type: 'director', email: SECOND_PI })
    insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  })
  type Who = { pb: true } | { as: string }
  async function call(method: string, path: string, who: Who, body?: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if ('pb' in who) headers.Authorization = `Bearer ${PB_KEY}`
    else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who.as }
    const res = await worker.fetch(new Request(`https://hub.test${path}`, {
      method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    }), env, CTX)
    return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> }
  }

  it('Nick only for overnight, undo and seen; the PB key, a second PI and a member are refused', async () => {
    await pbMutate([await upd({ priority: 'high' })])
    const [l] = lines()
    const overnight = '/api/receipts/overnight?since=2026-10-30T00:00:00Z'
    for (const who of [{ pb: true } as Who, { as: SECOND_PI }, { as: CASEY }]) {
      expect((await call('GET', overnight, who)).status).toBe(403)
      expect((await call('POST', `/api/receipts/lines/${l.id}/undo`, who)).status).toBe(403)
      expect((await call('POST', '/api/receipts/seen', who)).status).toBe(403)
    }
    expect(task().priority).toBe('high')
    const r = await call('GET', overnight, { as: NICK })
    expect(r.status).toBe(200)
    expect((r.body.runs as unknown[]).length).toBe(1)
    expect((await call('POST', '/api/receipts/seen', { as: NICK })).status).toBe(200)
    expect((await call('POST', `/api/receipts/lines/${l.id}/undo`, { as: NICK })).status).toBe(200)
    expect(task().priority).toBe('medium')
  })

  it('the middleware stamps every PB route: a PB task comment is an append line; a receipts route gets no summary line', async () => {
    const c = await call('POST', '/api/tasks/task_a/comments', { pb: true }, { content: 'Sent the dates', author_slug: 'nick-ingraham' })
    expect(c.status).toBeLessThan(300)
    expect(lines().some((l) => l.op === 'append')).toBe(true)
    const run = await call('POST', '/api/receipts/runs', { pb: true }, { lane: 'process', machine: 'home' })
    expect(run.status).toBe(201)
    expect(lines().some((l) => l.inverse_reason === 'route not individually receipted' && String(l.summary).includes('/api/receipts'))).toBe(false)
  })
})

describe('pb_origin on the task-updates and task-comments feeds', () => {
  async function as(method: string, path: string, pb: boolean, body?: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (pb) { headers.Authorization = `Bearer ${PB_KEY}`; headers['X-PB-Run'] = RUN }
    else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = NICK }
    const res = await worker.fetch(new Request(`https://hub.test${path}`, {
      method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    }), env, CTX)
    return { status: res.status, body: await res.json() as { data: Record<string, unknown>[] } }
  }
  const post = (kind: 'updates' | 'comments', pb: boolean, content: string) =>
    as('POST', `/api/tasks/task_a/${kind}`, pb, { content, author_slug: 'nick-ingraham' })
  const feed = async (name: 'task-updates' | 'task-comments', pb: boolean) => {
    const r = await as('GET', `/api/${name}/recent?since=2000-01-01T00:00:00Z`, pb)
    expect(r.status).toBe(200)
    return Object.fromEntries(r.body.data.map((row) => [String(row.content), row.pb_origin]))
  }

  it('a PB-key post reads true, Nick\'s own browser post false, on both feeds, for both readers', async () => {
    for (const kind of ['updates', 'comments'] as const) {
      expect((await post(kind, true, `pb ${kind}`)).status).toBeLessThan(300)
      expect((await post(kind, false, `nick ${kind}`)).status).toBeLessThan(300)
    }
    for (const reader of [true, false]) {
      expect(await feed('task-updates', reader)).toEqual({ 'pb updates': true, 'nick updates': false })
      expect(await feed('task-comments', reader)).toEqual({ 'pb comments': true, 'nick comments': false })
    }
  })

  it('either source is enough: the row metadata or the append receipt line; neither reads false', async () => {
    await post('comments', true, 'pb by receipt')
    await post('comments', true, 'pb by metadata')
    await post('comments', true, 'pb before v154')
    db.prepare("UPDATE activity_entries SET metadata_json = NULL WHERE body IN ('pb by receipt', 'pb before v154')").run()
    db.prepare("DELETE FROM receipt_lines WHERE entity_id IN (SELECT id FROM activity_entries WHERE body IN ('pb by metadata', 'pb before v154'))").run()
    expect(await feed('task-comments', true)).toEqual({ 'pb by receipt': true, 'pb by metadata': true, 'pb before v154': false })
  })

  it('a PB session note (source_table pb_progress_note) reads true and carries source_table', async () => {
    const r = await as('POST', '/api/tasks/task_a/updates', true, { content: 'pb session note', author_slug: 'nick-ingraham', source_table: 'pb_progress_note', source_id: 'note-1' })
    expect(r.status).toBeLessThan(300)
    await post('updates', false, 'nick note')
    const res = await as('GET', '/api/task-updates/recent?since=2000-01-01T00:00:00Z', true)
    const byContent = Object.fromEntries(res.body.data.map((row) => [String(row.content), row]))
    expect(byContent['pb session note']).toMatchObject({ pb_origin: true, source_table: 'pb_progress_note' })
    expect(byContent['nick note']).toMatchObject({ pb_origin: false, source_table: null })
    await post('comments', true, 'pb comment')
    const c = await as('GET', '/api/task-comments/recent?since=2000-01-01T00:00:00Z', true)
    expect(c.body.data.find((row) => row.content === 'pb comment')).toMatchObject({ pb_origin: true, source_table: null })
  })

  it('the Hermes placeholder reads false under a browser ask and true under a PB-key ask', async () => {
    await post('comments', false, '@hermes from nick')
    await post('comments', true, '@hermes from pb')
    // Both posts land in the same second, so key each placeholder to its ask, never to row order.
    const rows = all("SELECT ask.body AS ask, ph.metadata_json FROM activity_entries ph JOIN activity_entries ask ON ask.id = ph.parent_id WHERE ph.actor_slug = 'claude-ai'")
    const byAsk = Object.fromEntries(rows.map((r) => [String(r.ask), r.metadata_json === null ? false : JSON.parse(String(r.metadata_json)).pb_origin === true]))
    expect(byAsk).toEqual({ '@hermes from nick': false, '@hermes from pb': true })
  })

  it('a malformed metadata_json does not break the feed', async () => {
    await post('updates', false, 'odd row')
    db.prepare("UPDATE activity_entries SET metadata_json = 'not json' WHERE body = 'odd row'").run()
    expect(await feed('task-updates', true)).toEqual({ 'odd row': false })
  })
})

describe('GET /api/receipts/claims', () => {
  const CASEY = 'eddin022@umn.edu'
  beforeEach(() => {
    insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  })
  async function get(qs: string, who: 'pb' | 'nick' | 'casey' = 'pb') {
    const headers: Record<string, string> = who === 'pb'
      ? { Authorization: `Bearer ${PB_KEY}`, 'X-PB-Run': RUN }
      : { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who === 'nick' ? NICK : CASEY }
    const res = await worker.fetch(new Request(`https://hub.test/api/receipts/claims?${qs}`, { headers }), env, CTX)
    return { status: res.status, body: await res.json() as { data: Record<string, unknown>[] } }
  }
  const K1 = 'comment:ae_9:1'
  const K2 = 'file:home:ab/cd%2Bef'
  beforeEach(async () => {
    await handleStartRun(post({ lane: 'process', machine: 'home', run_id: 'run_a' }), env, true)
    await handleClaim(post({ source_key: K1, run_id: 'run_a', lease_seconds: 60 }), env, true)
    await handleClaim(post({ source_key: K2, run_id: 'run_a', lease_seconds: 60 }), env, true)
    await handleSettleClaim(K2, post({ state: 'done', generation: 1 }), env, true)
  })

  it('returns the claims that exist, in the asked order, absent keys omitted; both query forms', async () => {
    const want = [
      { key: K2, state: 'done', generation: 1, lane: 'process', machine: 'home' },
      { key: K1, state: 'claimed', generation: 1, lane: 'process', machine: 'home' },
    ]
    const a = await get(`keys=${encodeURIComponent(`${K2},inbox:missing,${K1}`)}`)
    expect(a.status).toBe(200)
    expect(a.body.data).toMatchObject(want)
    expect(a.body.data[0].updated_at).toBeTruthy()
    const b = await get(`key=${encodeURIComponent(K2)}&key=${encodeURIComponent('question:none')}&key=${encodeURIComponent(K1)}`)
    expect(b.body.data).toMatchObject(want)
    expect((await get(`keys=${encodeURIComponent('inbox:missing')}`)).body.data).toEqual([])
  })

  it('caps the lookup at 200 keys and needs at least one', async () => {
    const keys = Array.from({ length: 200 }, (_, i) => `inbox:k${i}`)
    const ok = await get(`keys=${encodeURIComponent([...keys.slice(0, 199), K1].join(','))}`)
    expect(ok.status).toBe(200)
    expect(ok.body.data.map((r) => r.key)).toEqual([K1])
    expect((await get(`keys=${encodeURIComponent([...keys, 'inbox:k200'].join(','))}`)).status).toBe(400)
    expect((await get('keys=')).status).toBe(400)
  })

  it('PB key and Nick read it; a member is refused; the read writes no receipt line', async () => {
    const before = lines().length
    expect((await get(`keys=${encodeURIComponent(K1)}`, 'nick')).status).toBe(200)
    expect((await get(`keys=${encodeURIComponent(K1)}`, 'casey')).status).toBe(403)
    expect((await get(`keys=${encodeURIComponent(K1)}`, 'pb')).status).toBe(200)
    expect(lines().length).toBe(before)
  })
})
