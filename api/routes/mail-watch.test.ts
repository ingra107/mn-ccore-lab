/**
 * api/routes/mail-watch.test.ts -- the mail watcher's routes (schema-v151).
 *
 * Nick, 2026-10-29: "Build it (Recommended)". Runs the real worker against the
 * migration-chain database (prodSchemaDb), so the v151 trigger, CHECKs and
 * UNIQUE slot are the ones prod gets. Pins:
 *   - MAIL_WATCHER_KEY is refused on every route that is not a watcher route,
 *     and the watcher routes refuse every other caller;
 *   - a run cannot close with a thread missing (route and trigger);
 *   - the first read is baseline (no ping); a reply that moves the ball pings once;
 *   - freshness reads stale when a thread's receipt is missing;
 *   - the snapshot is Nick's alone;
 *   - the route module imports no task writer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { ROUTE_REGISTRY } from '../lib/route-dsl'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PB_KEY = 'pb-key-for-tests'
const WATCHER_KEY = 'watcher-key-for-tests'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const T1 = '1a0e5f718220a235'
const T2 = '1a0e5f718220b111'

let db: InstanceType<typeof Database>
let env: Env
const one = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined
const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[]

type Who = { watcher: true } | { pb: true } | { as: string } | { none: true }

async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if ('watcher' in who) headers.Authorization = `Bearer ${WATCHER_KEY}`
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

const at = (iso: string) => vi.setSystemTime(new Date(iso))

function message(id: string, isoAt: string, from: string, labels: string[] = ['INBOX'], extra: Record<string, string> = {}) {
  return { message_id: id, internal_date_ms: Date.parse(isoAt), label_ids: labels, headers: { From: from, Subject: 'Re: data', ...extra }, snippet: `snippet ${id}` }
}

async function openRun() {
  const r = await call('POST', '/api/watcher/runs', { watcher: true }, { script_version: 'test-1' })
  expect(r.status).toBe(200)
  return r.body as { run: boolean; run_id: string; threads: string[]; reason?: string }
}

async function closeRun(id: string, threads: unknown[]) {
  return call('POST', `/api/watcher/runs/${id}/close`, { watcher: true }, { threads, self_addresses: [NICK] })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-28T16:05:00Z') // Wed 11:05 CDT, inside the 11:00 slot
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_a', project_id: PROJECT, title: 'Answer Jane on the data pull', assignee: 'nick-ingraham', status: 'waiting_external', source_thread_id: T1 })
  insertRow(db, 'tasks', { id: 'task_b', project_id: PROJECT, title: 'Review abstract', assignee: 'nick-ingraham', status: 'todo' })
  insertRow(db, 'links', { id: 'lnk_b', owner_table: 'tasks', owner_id: 'task_b', type: 'gmail_thread', canonical_url: `https://mail.google.com/mail/u/1/#all/${T2}`, short_title: 'Thread' })
  insertRow(db, 'tasks', { id: 'task_done', project_id: PROJECT, title: 'Old', assignee: 'nick-ingraham', status: 'done', completed: 1, completed_at: '2026-10-20T00:00:00Z', source_thread_id: '1a0e5f718220c999' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', PB_API_KEY: PB_KEY, MAIL_WATCHER_KEY: WATCHER_KEY } as unknown as Env
})

afterEach(() => { vi.useRealTimers() })

describe('MAIL_WATCHER_KEY reaches the watcher routes and nothing else', () => {
  it('every non-watcher route refuses the watcher key (401/403, never a handler)', async () => {
    const others = ROUTE_REGISTRY.filter((r) => r.auth !== 'watcher')
    expect(others.length).toBeGreaterThan(200)
    const before = JSON.stringify(rows("SELECT id, status, title FROM tasks ORDER BY id"))
    const leaks: string[] = []
    for (const r of others) {
      const path = r.path.replace(/:[A-Za-z_]+/g, 'x').replace(/\*/g, 'x')
      const res = await call(r.method, path, { watcher: true }, {})
      if (res.status !== 401 && res.status !== 403) leaks.push(`${r.method} ${r.path} -> ${res.status}`)
    }
    expect(leaks).toEqual([])
    expect(JSON.stringify(rows("SELECT id, status, title FROM tasks ORDER BY id"))).toBe(before)
  })

  it('the task, project and mutation writers refuse it by name', async () => {
    for (const [m, p] of [['POST', '/api/tasks/task_a'], ['POST', '/api/mutations'], ['POST', '/api/projects/r03'], ['POST', '/api/tasks']] as const) {
      const res = await call(m, p, { watcher: true }, { status: 'done' })
      expect(res.status, `${m} ${p}`).toBe(401)
    }
    expect(one("SELECT status FROM tasks WHERE id = 'task_a'")?.status).toBe('waiting_external')
  })

  it('the watcher routes refuse the PB key, Nick\'s session, a member and nobody', async () => {
    for (const who of [{ pb: true }, { as: NICK }, { as: CASEY }, { none: true }] as Who[]) {
      const res = await call('POST', '/api/watcher/runs', who, { script_version: 'x' })
      expect(res.status).toBe(401)
    }
    expect(rows('SELECT id FROM watch_runs')).toHaveLength(0)
  })

  it('a watcher key equal to the PB key matches nothing', async () => {
    env = { ...env, MAIL_WATCHER_KEY: PB_KEY } as Env
    const res = await call('POST', '/api/watcher/runs', { pb: true }, { script_version: 'x' })
    expect(res.status).toBe(401)
  })

  it('the route module imports no task writer', () => {
    const src = readFileSync(join(__dirname, 'mail-watch.ts'), 'utf8')
    const imports = src.split('\n').filter((l) => /^import /.test(l)).join('\n')
    expect(imports).not.toMatch(/mutations|routes\/tasks|\.\/tasks|projects|applyMutation|key-link/)
    expect(src).not.toMatch(/\b(UPDATE|INSERT INTO|DELETE FROM)\s+(tasks|projects|links|activity_entries)\b/i)
  })
})

describe('a run: open in a slot, close with every thread', () => {
  it('outside a slot the Hub says run:false and stores nothing', async () => {
    at('2026-10-28T22:10:00Z') // 17:10 CDT
    const r = await openRun()
    expect(r).toEqual({ run: false, reason: 'outside_slot' })
    at('2026-10-31T16:00:00Z') // Saturday
    expect((await openRun()).run).toBe(false)
    expect(rows('SELECT id FROM watch_runs')).toHaveLength(0)
  })

  it('hands out the open tasks\' API thread ids only, and a re-fire gets the same run', async () => {
    const r = await openRun()
    expect(r.run).toBe(true)
    expect(r.threads).toEqual([T1, T2])
    expect(JSON.stringify(r)).not.toContain('Answer Jane')
    const again = await openRun()
    expect(again.run_id).toBe(r.run_id)
    expect(rows('SELECT id FROM watch_runs')).toHaveLength(1)
  })

  it('a close missing a thread is refused and the run stays open', async () => {
    const r = await openRun()
    const res = await closeRun(r.run_id, [{ thread_id: T1, result: 'read', messages: [] }])
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('watch_run_incomplete')
    expect(one('SELECT closed_at FROM watch_runs WHERE id = ?', r.run_id)?.closed_at).toBeNull()
  })

  it('the trigger refuses a close with a NULL thread result on any write path', () => {
    db.prepare("INSERT INTO watch_runs (id, slot_at, opened_at, threads_expected, script_version) VALUES ('wr_x', 's', 'o', 1, 'v')").run()
    db.prepare("INSERT INTO watch_run_threads (run_id, thread_id) VALUES ('wr_x', 't')").run()
    expect(() => db.prepare("UPDATE watch_runs SET closed_at = 'c', outcome = 'complete' WHERE id = 'wr_x'").run())
      .toThrow(/watch_run_incomplete/)
  })

  it('no body column, and an excerpt over 200 characters cannot be stored', () => {
    const cols = (db.prepare('PRAGMA table_info(mail_messages)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).not.toContain('body')
    expect(() => db.prepare(
      "INSERT INTO mail_messages (message_id, thread_id, internal_at, party, excerpt, first_run_id, baseline) VALUES ('m', 't', 'i', 'other', ?, 'r', 0)",
    ).run('x'.repeat(201))).toThrow()
  })

  it('first read is baseline: no ping; a later reply that moves the ball pings once, link only', async () => {
    const r1 = await openRun()
    const c1 = await closeRun(r1.run_id, [
      { thread_id: T1, result: 'read', messages: [message('m1', '2026-10-27T15:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT'])] },
      { thread_id: T2, result: 'not_found' },
    ])
    expect(c1.status).toBe(200)
    expect(c1.body).toMatchObject({ outcome: 'complete', alert: null })
    expect(one('SELECT baseline FROM mail_messages WHERE message_id = ?', 'm1')?.baseline).toBe(1)

    at('2026-10-28T17:06:00Z') // 12:06, next slot
    const r2 = await openRun()
    expect(r2.run_id).not.toBe(r1.run_id)
    const c2 = await closeRun(r2.run_id, [
      { thread_id: T1, result: 'read', messages: [
        message('m1', '2026-10-27T15:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT']),
        message('m2', '2026-10-28T16:30:00Z', 'Jane Doe <jane@umn.edu>'),
        message('m3', '2026-10-28T16:40:00Z', 'Jane Doe <jane@umn.edu>'),
        message('m4', '2026-10-28T16:45:00Z', 'Jane Doe <jane@umn.edu>', ['INBOX'], { 'Auto-Submitted': 'auto-replied' }),
      ] },
      { thread_id: T2, result: 'not_found' },
    ])
    expect(c2.status).toBe(200)
    const alert = c2.body.alert as { text: string; threads: number }
    expect(alert.threads).toBe(1)
    expect(alert.text).toContain('Jane Doe')
    expect(alert.text).toContain(`https://mail.google.com/mail/u/1/#all/${T1}`)
    expect(alert.text).not.toContain('snippet')
    expect(one('SELECT party FROM mail_messages WHERE message_id = ?', 'm4')?.party).toBe('machine')
    // The task's status never moved.
    expect(one("SELECT status FROM tasks WHERE id = 'task_a'")?.status).toBe('waiting_external')

    // Reported send; a replayed close returns no second alert.
    const rep = await call('POST', `/api/watcher/runs/${r2.run_id}/alert`, { watcher: true }, { sent: true })
    expect(rep.status).toBe(200)
    const replay = await closeRun(r2.run_id, [])
    expect(replay.body).toMatchObject({ alert: null, replayed: true })
  })

  it('a retention prune between runs does not re-arm old mail (B1), and old mail is not re-stored', async () => {
    const old = [
      message('m1', '2026-05-01T15:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT']),
      message('m2', '2026-05-02T15:00:00Z', 'Jane Doe <jane@umn.edu>'),
    ]
    const r1 = await openRun()
    await closeRun(r1.run_id, [{ thread_id: T1, result: 'read', messages: old }, { thread_id: T2, result: 'read', messages: [] }])
    expect(one('SELECT evaluated_through FROM watch_threads WHERE thread_id = ?', T1)?.evaluated_through).toBe('2026-05-02T15:00:00.000Z')
    // The ledger prune takes every row older than 120 days.
    db.prepare('DELETE FROM mail_messages').run()
    for (const [slot, close] of [['2026-10-28T17:06:00Z', '2026-10-28T17:07:00Z'], ['2026-10-28T18:06:00Z', '2026-10-28T18:07:00Z']]) {
      at(slot)
      const r = await openRun()
      at(close)
      const c = await closeRun(r.run_id, [{ thread_id: T1, result: 'read', messages: old }, { thread_id: T2, result: 'read', messages: [] }])
      expect(c.status).toBe(200)
      expect(c.body.alert).toBeNull()
      db.prepare('DELETE FROM mail_messages').run()
    }
    // Only the latest human message at or below the mark comes back, as baseline.
    at('2026-10-28T19:06:00Z')
    const r4 = await openRun()
    at('2026-10-28T19:07:00Z')
    const c4 = await closeRun(r4.run_id, [
      { thread_id: T1, result: 'read', messages: [...old, message('m3', '2026-10-28T19:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT'])] },
      { thread_id: T2, result: 'read', messages: [] },
    ])
    expect(c4.body.alert).toBeNull()
    expect(rows('SELECT message_id, baseline FROM mail_messages ORDER BY message_id')).toEqual([
      { message_id: 'm2', baseline: 1 }, { message_id: 'm3', baseline: 0 },
    ])
    // A real new reply after Nick's still pings.
    at('2026-10-28T20:06:00Z')
    const r5 = await openRun()
    at('2026-10-28T20:07:00Z')
    const c5 = await closeRun(r5.run_id, [
      { thread_id: T1, result: 'read', messages: [...old, message('m3', '2026-10-28T19:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT']),
        message('m4', '2026-10-28T20:01:00Z', 'Jane Doe <jane@umn.edu>')] },
      { thread_id: T2, result: 'read', messages: [] },
    ])
    expect((c5.body.alert as { threads: number }).threads).toBe(1)
  })

  it('a run where most threads are not_found closes partial and the card counts them (F2)', async () => {
    const r1 = await openRun()
    const c = await closeRun(r1.run_id, [{ thread_id: T1, result: 'not_found' }, { thread_id: T2, result: 'not_found' }])
    expect(c.body.outcome).toBe('partial')
    at('2026-10-28T17:30:00Z') // 12:30: 11:00 is due, 12:00 is in grace
    const s = await call('GET', '/api/mail-watch/snapshot', { pb: true })
    expect(s.body.freshness).toMatchObject({ state: 'partial', not_found: 2 })
  })

  it('a run that closes after its alert window returns no alert text (no off-hours ping)', async () => {
    const r1 = await openRun()
    await closeRun(r1.run_id, [
      { thread_id: T1, result: 'read', messages: [message('m1', '2026-10-27T15:00:00Z', 'Nick <ingra107@umn.edu>', ['SENT'])] },
      { thread_id: T2, result: 'not_found' },
    ])
    at('2026-10-28T23:05:00Z') // 18:05 slot
    const r2 = await openRun()
    at('2026-10-29T00:20:00Z') // 19:20: past the 70-minute window
    const c2 = await closeRun(r2.run_id, [
      { thread_id: T1, result: 'read', messages: [message('m2', '2026-10-28T23:01:00Z', 'Jane Doe <jane@umn.edu>')] },
      { thread_id: T2, result: 'not_found' },
    ])
    expect(c2.body.alert).toBeNull()
    expect(c2.body.held_back).toBe(1)
  })
})

describe('GET /api/mail-watch/snapshot: Nick only, and never without freshness', () => {
  it('before any run: never, not current', async () => {
    const r = await call('GET', '/api/mail-watch/snapshot', { pb: true })
    expect(r.status).toBe(200)
    expect((r.body.freshness as { state: string }).state).toBe('never')
  })

  it('a member, even on the project, gets 403; the watcher gets 401', async () => {
    expect((await call('GET', '/api/mail-watch/snapshot', { as: CASEY })).status).toBe(403)
    expect((await call('GET', '/api/mail-watch/snapshot', { watcher: true })).status).toBe(401)
  })

  it('a thread with no receipt reads stale: the run was complete, freshness is partial', async () => {
    const r1 = await openRun()
    await closeRun(r1.run_id, [
      { thread_id: T1, result: 'read', messages: [message('m1', '2026-10-28T15:30:00Z', 'Jane Doe <jane@umn.edu>')] },
      { thread_id: T2, result: 'read', messages: [] },
    ])
    // A new task tied to a thread no run has read yet.
    insertRow(db, 'tasks', { id: 'task_c', project_id: PROJECT, title: 'New one', assignee: 'nick-ingraham', status: 'todo', source_thread_id: '1a0e5f718220d222' })
    at('2026-10-28T17:30:00Z') // 12:30: 11:00 is due, 12:00 is in grace
    const r = await call('GET', '/api/mail-watch/snapshot', { as: NICK })
    expect(r.status).toBe(200)
    const f = r.body.freshness as { state: string; threads: number; unchecked: number }
    expect(f).toMatchObject({ state: 'partial', threads: 3, unchecked: 1 })
    const threads = r.body.threads as { thread_id: string; ball: string; last_from: string; tasks: { id: string }[] }[]
    expect(threads.map((t) => t.thread_id)).toEqual([T1])
    expect(threads[0]).toMatchObject({ ball: 'nick', last_from: 'Jane Doe' })
    expect(threads[0].tasks.map((t) => t.id)).toEqual(['task_a'])
  })

  it('an error on one thread makes the run partial, and that thread keeps its older receipt', async () => {
    const r1 = await openRun()
    await closeRun(r1.run_id, [{ thread_id: T1, result: 'read', messages: [] }, { thread_id: T2, result: 'error', error: 'Gmail 500' }])
    expect(one('SELECT outcome FROM watch_runs WHERE id = ?', r1.run_id)?.outcome).toBe('partial')
    at('2026-10-28T17:30:00Z')
    const r = await call('GET', '/api/mail-watch/snapshot', { pb: true })
    expect((r.body.freshness as { state: string }).state).toBe('partial')
  })
})
