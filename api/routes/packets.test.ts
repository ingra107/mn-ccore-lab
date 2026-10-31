/**
 * api/routes/packets.test.ts -- the prepared first step (schema-v153).
 *
 * Decision: PB Context/Decisions/2026-10-30-first-step-packet.md (v1 contract).
 * Runs the real worker against the migration-chain database (prodSchemaDb), so
 * the v153 triggers, CHECKs and UNIQUE indexes are the ones prod gets. Pins:
 *   - the schema refuses two live packets, a version edit, a second Use, a
 *     bad anchor, and a producer superseding Nick's version;
 *   - every tasks column is classified work or noise for the freshness hash;
 *   - publish is idempotent on producer_key, supersedes otherwise, 409s on a
 *     Nick-authored live packet, 400s on an anchor not in the body;
 *   - freshness: a reply flips to changed, a plan_rank move stays ready, a
 *     person's comment flips, Hermes's does not;
 *   - Use is a compare-and-set (stale -> 409 with reasons) and happens once;
 *   - nobody but Nick and the PB key sees a packet or a packet_state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests, _resetValidationFlagsCache } from '../helpers'
import { TASK_PACKET_NOISE_COLS, TASK_PACKET_WORK_COLS } from '../lib/packet-freshness'
import type { PacketView } from '../../shared/packets'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const PB_KEY = 'pb-key-for-tests'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const PROJECT = 'proj_01KXH4E23G0DTFGFBYS2C8RGTH'
const T1 = '1a0e5f718220a235'

let db: InstanceType<typeof Database>
let env: Env
const one = (sql: string, ...v: unknown[]) => db.prepare(sql).get(...v) as Record<string, unknown> | undefined

type Who = { pb: true } | { as: string } | { none: true }

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

const at = (iso: string) => vi.setSystemTime(new Date(iso))

const DRAFT_BODY = 'Hi Jane,\n\nThe pull covers 2018 to 2024. I kept the ICU-only cohort. Thanks, Nick'

function packetBody(over: Record<string, unknown> = {}) {
  return {
    producer_key: 'gmail_draft:r-111',
    instruction: 'Reply to Jane with the date range',
    minutes: 5,
    deliverable: {
      kind: 'gmail_draft', gmail_draft_id: 'r-111', url: 'https://mail.google.com/mail/u/1/#drafts?compose=r-111',
      to: 'jane@umn.edu', subject: 'Re: data pull', thread_id: T1,
    },
    body: DRAFT_BODY,
    calls: [{ title: 'Date range', decision: '2018 to 2024', anchor: 'covers 2018 to 2024' }],
    inputs: [{ kind: 'thread', ref: T1, observed_at: '2026-10-28T16:00:00Z' }],
    ...over,
  }
}

async function publish(over: Record<string, unknown> = {}, who: Who = { pb: true }) {
  return call('POST', '/api/tasks/task_a/packets', who, packetBody(over))
}

async function nickView() {
  const r = await call('GET', '/api/tasks/task_a/packet', { as: NICK })
  expect(r.status).toBe(200)
  return r.body as unknown as PacketView & { packet: { id: string } | null }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-28T16:05:00Z') // Wed 11:05 CDT: the 11:00 slot is inside its grace
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  _resetValidationFlagsCache()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Analyst', member_type: 'member', email: CASEY })
  insertRow(db, 'projects', { id: PROJECT, slug: 'r03', title: 'R03', category: 'MNCCORE', status: 'active' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'nick-ingraham', added_by: 'nick-ingraham' })
  insertRow(db, 'project_members', { project_id: PROJECT, member_slug: 'casey-eddington', added_by: 'nick-ingraham' })
  insertRow(db, 'tasks', { id: 'task_a', project_id: PROJECT, title: 'Answer Jane on the data pull', assignee: 'nick-ingraham', status: 'todo', source_thread_id: T1 })
  insertRow(db, 'tasks', { id: 'task_b', project_id: PROJECT, title: 'Review abstract', assignee: 'casey-eddington', status: 'todo' })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', PB_API_KEY: PB_KEY } as unknown as Env
})

afterEach(() => { vi.useRealTimers() })

// ── schema ───────────────────────────────────────────────────────────────────

function rawPacket(id: string, key: string, task = 'task_a', closed = false) {
  insertRow(db, 'task_packets', {
    id, task_id: task, producer_key: key, created_at: '2026-10-28T16:00:00Z',
    ...(closed ? { closed_at: '2026-10-28T16:01:00Z', close_reason: 'superseded' } : {}),
  })
}
function rawVersion(packet: string, version = 1, author = 'claude', body = 'body text', calls = '[]') {
  insertRow(db, 'task_packet_versions', {
    packet_id: packet, version, author, instruction: 'Do it', deliverable_kind: 'answer',
    deliverable_json: '{"kind":"answer"}', body, calls_json: calls, manifest_json: '[]',
    manifest_hash: 'a'.repeat(64), created_at: '2026-10-28T16:00:00Z',
  })
}

describe('v153 schema: the wrong states it refuses', () => {
  it('two live packets on one task are refused; a closed one beside a live one is fine', () => {
    rawPacket('pkt_1', 'k1')
    expect(() => rawPacket('pkt_2', 'k2')).toThrow(/UNIQUE constraint failed/)
    rawPacket('pkt_3', 'k3', 'task_a', true)
    expect(one("SELECT COUNT(*) AS n FROM task_packets WHERE task_id = 'task_a'")?.n).toBe(2)
  })

  it('a producer_key names one packet', () => {
    rawPacket('pkt_1', 'k1', 'task_a', true)
    expect(() => rawPacket('pkt_2', 'k1', 'task_b')).toThrow(/UNIQUE constraint failed/)
  })

  it('a version is never edited or deleted', () => {
    rawPacket('pkt_1', 'k1')
    rawVersion('pkt_1')
    expect(() => db.prepare("UPDATE task_packet_versions SET body = 'x' WHERE packet_id = 'pkt_1'").run()).toThrow(/task_packet_version_append_only/)
    expect(() => db.prepare("DELETE FROM task_packet_versions WHERE packet_id = 'pkt_1'").run()).toThrow(/task_packet_version_append_only/)
  })

  it('a call anchor must be in the body, and a deliverable kind cannot send', () => {
    rawPacket('pkt_1', 'k1')
    expect(() => rawVersion('pkt_1', 1, 'claude', 'body text', '[{"title":"t","decision":"d","anchor":"missing"}]')).toThrow(/task_packet_anchor/)
    rawVersion('pkt_1', 1, 'claude', 'body text', '[{"title":"t","decision":"d","anchor":"dy te"}]')
    expect(() => insertRow(db, 'task_packet_versions', {
      packet_id: 'pkt_1', version: 2, author: 'claude', instruction: 'x', deliverable_kind: 'gmail_send',
      deliverable_json: '{"kind":"gmail_send"}', body: '', calls_json: '[]', manifest_json: '[]',
      manifest_hash: 'a'.repeat(64), created_at: 'x',
    })).toThrow(/CHECK constraint failed/)
  })

  it('a packet Nick wrote a version of is never superseded; a closed packet never reopens', () => {
    rawPacket('pkt_1', 'k1')
    rawVersion('pkt_1', 1, 'nick')
    expect(() => db.prepare("UPDATE task_packets SET closed_at = 'x', close_reason = 'superseded' WHERE id = 'pkt_1'").run()).toThrow(/task_packet_nick_authored/)
    db.prepare("UPDATE task_packets SET closed_at = 'x', close_reason = 'dismissed' WHERE id = 'pkt_1'").run()
    expect(() => db.prepare("UPDATE task_packets SET closed_at = NULL, close_reason = NULL WHERE id = 'pkt_1'").run()).toThrow(/task_packet_lifecycle/)
  })

  it('one Use per packet, and no action on a closed packet', () => {
    rawPacket('pkt_1', 'k1')
    rawVersion('pkt_1')
    const use = (id: string) => insertRow(db, 'task_packet_actions', { id, packet_id: 'pkt_1', version: 1, action: 'use', actor: 'nick-ingraham', created_at: 'x' })
    use('pka_1')
    expect(() => use('pka_2')).toThrow(/UNIQUE constraint failed/)
    db.prepare("UPDATE task_packets SET closed_at = 'x', close_reason = 'dismissed' WHERE id = 'pkt_1'").run()
    expect(() => insertRow(db, 'task_packet_actions', { id: 'pka_3', packet_id: 'pkt_1', version: 1, action: 'dismiss', actor: 'n', created_at: 'x' })).toThrow(/task_packet_closed/)
  })

  it('every tasks column is either work or noise for the freshness hash, never both', () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('tasks')").all() as { name: string }[]).map((r) => r.name).sort()
    const work = new Set<string>(TASK_PACKET_WORK_COLS)
    const noise = new Set<string>(TASK_PACKET_NOISE_COLS)
    expect([...work].filter((c) => noise.has(c))).toEqual([])
    expect(cols.filter((c) => !work.has(c) && !noise.has(c))).toEqual([])
    expect([...work, ...noise].filter((c) => !cols.includes(c))).toEqual([])
  })
})

// ── publish ──────────────────────────────────────────────────────────────────

describe('POST /api/tasks/:id/packets', () => {
  it('publishes, then a repeat producer_key returns the same packet with 200', async () => {
    const first = await publish()
    expect(first.status).toBe(201)
    const id = (first.body.packet as { id: string }).id
    expect(first.body.freshness).toEqual({ state: 'ready', reasons: [] })
    const again = await publish()
    expect(again.status).toBe(200)
    expect((again.body.packet as { id: string }).id).toBe(id)
    expect(one('SELECT COUNT(*) AS n FROM task_packets')?.n).toBe(1)
    // The Hub recorded the task and the activity it depends on.
    const kinds = (first.body.version as { inputs: { kind: string; token: string | null }[] }).inputs.map((i) => i.kind)
    expect(kinds).toEqual(['task', 'activity', 'thread'])
  })

  it('a new producer_key supersedes the live packet', async () => {
    const a = await publish()
    const b = await publish({ producer_key: 'gmail_draft:r-222' })
    expect(b.status).toBe(201)
    expect(one('SELECT close_reason FROM task_packets WHERE id = ?', (a.body.packet as { id: string }).id)?.close_reason).toBe('superseded')
    expect((await nickView()).packet?.id).toBe((b.body.packet as { id: string }).id)
  })

  it('a live packet with a version Nick wrote refuses a new producer (409)', async () => {
    const a = await publish()
    const id = (a.body.packet as { id: string }).id
    insertRow(db, 'task_packet_versions', {
      packet_id: id, version: 2, author: 'nick', instruction: 'mine', deliverable_kind: 'answer',
      deliverable_json: '{"kind":"answer"}', body: 'x', calls_json: '[]', manifest_json: '[]',
      manifest_hash: 'b'.repeat(64), created_at: '2026-10-28T16:04:00Z',
    })
    const b = await publish({ producer_key: 'gmail_draft:r-333' })
    expect(b.status).toBe(409)
    expect(b.body.code).toBe('nick_authored')
    expect(one('SELECT closed_at FROM task_packets WHERE id = ?', id)?.closed_at).toBeNull()
  })

  it('an anchor that is not in the body is a 400 and stores nothing', async () => {
    const r = await publish({ calls: [{ title: 'x', decision: 'y', anchor: 'not in the draft' }] })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('anchor_not_in_body')
    expect(one('SELECT COUNT(*) AS n FROM task_packets')?.n).toBe(0)
  })

  it('a deliverable that sends is a 400', async () => {
    const r = await publish({ deliverable: { kind: 'gmail_send', url: 'https://x' } })
    expect(r.status).toBe(400)
  })

  it('a team member cannot publish (403)', async () => {
    expect((await publish({}, { as: CASEY })).status).toBe(403)
    expect(one('SELECT COUNT(*) AS n FROM task_packets')?.n).toBe(0)
  })
})

// ── freshness ────────────────────────────────────────────────────────────────

describe('freshness, derived on read', () => {
  it('a new message from someone else on the thread flips Ready to Changed', async () => {
    await publish()
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('ready')
    insertRow(db, 'mail_messages', {
      message_id: 'm1', thread_id: T1, internal_at: '2026-10-28T16:03:00.000Z', party: 'other',
      from_display: 'Jane', first_run_id: 'wr_x', baseline: 0,
    })
    const v = await nickView() as { freshness: { state: string; reasons: { code: string }[] } }
    expect(v.freshness.state).toBe('changed')
    expect(v.freshness.reasons.map((r) => r.code)).toEqual(['reply_arrived'])
  })

  it('Nick\'s own message on the thread, or one older than the observation, does not', async () => {
    await publish()
    insertRow(db, 'mail_messages', { message_id: 'm1', thread_id: T1, internal_at: '2026-10-28T16:03:00.000Z', party: 'nick', first_run_id: 'wr_x', baseline: 0 })
    insertRow(db, 'mail_messages', { message_id: 'm2', thread_id: T1, internal_at: '2026-10-28T15:00:00.000Z', party: 'other', first_run_id: 'wr_x', baseline: 0 })
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('ready')
  })

  it('a plan_rank-only change stays Ready; a title change is Changed', async () => {
    await publish()
    db.prepare("UPDATE tasks SET plan_rank = 3, planned_for = '2026-10-28', acknowledged_at = '2026-10-28 16:04:00', updated_at = datetime('now') WHERE id = 'task_a'").run()
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('ready')
    db.prepare("UPDATE tasks SET title = 'Answer Jane (new scope)' WHERE id = 'task_a'").run()
    const v = await nickView() as { freshness: { state: string; reasons: { code: string }[] } }
    expect(v.freshness.state).toBe('changed')
    expect(v.freshness.reasons.map((r) => r.code)).toContain('task_changed')
  })

  it('a person\'s comment flips it; Hermes\'s does not', async () => {
    await publish()
    const entry = (id: string, actor: string) => insertRow(db, 'activity_entries', {
      id, entity_type: 'task', entity_id: 'task_a', project_id: PROJECT, kind: 'comment', actor_slug: actor,
      body: 'note', created_at: '2026-10-28 16:06:00',
    })
    at('2026-10-28T16:07:00Z')
    entry('ae_1', 'claude-ai')
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('ready')
    entry('ae_2', 'casey-eddington')
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('changed')
  })

  it('a thread the watcher has not read since a due slot reads Not verified', async () => {
    await publish()
    at('2026-10-28T19:30:00Z') // 14:30 CDT: the 11:00-13:00 slots are past grace, no receipt
    expect((await nickView() as { freshness: { state: string } }).freshness.state).toBe('unverified')
  })
})

// ── use / dismiss ────────────────────────────────────────────────────────────

describe('POST /api/packets/:id/use and /dismiss', () => {
  it('Use returns the draft url once; a second Use is refused', async () => {
    const p = await publish()
    const v = p.body.version as { version: number; manifest_hash: string }
    const id = (p.body.packet as { id: string }).id
    const use = await call('POST', `/api/packets/${id}/use`, { as: NICK }, { version: v.version, manifest_hash: v.manifest_hash })
    expect(use.status).toBe(200)
    expect(use.body.url).toBe('https://mail.google.com/mail/u/1/#drafts?compose=r-111')
    const again = await call('POST', `/api/packets/${id}/use`, { as: NICK }, { version: v.version, manifest_hash: v.manifest_hash })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('already_used')
    expect(one("SELECT COUNT(*) AS n FROM task_packet_actions WHERE action = 'use'")?.n).toBe(1)
    // Use completes nothing.
    expect(one("SELECT status FROM tasks WHERE id = 'task_a'")?.status).toBe('todo')
    expect((await nickView()).packet && (await nickView() as { packet: { used_at: string | null } }).packet.used_at).toBeTruthy()
  })

  it('a stale Use (a reply landed) is a 409 with reasons, and records nothing', async () => {
    const p = await publish()
    const v = p.body.version as { version: number; manifest_hash: string }
    insertRow(db, 'mail_messages', { message_id: 'm1', thread_id: T1, internal_at: '2026-10-28T16:03:00.000Z', party: 'other', from_display: 'Jane', first_run_id: 'wr_x', baseline: 0 })
    const r = await call('POST', `/api/packets/${(p.body.packet as { id: string }).id}/use`, { as: NICK }, { version: v.version, manifest_hash: v.manifest_hash })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('stale')
    expect((r.body.reasons as { code: string }[]).map((x) => x.code)).toEqual(['reply_arrived'])
    expect(one('SELECT COUNT(*) AS n FROM task_packet_actions')?.n).toBe(0)
  })

  it('a Use naming the wrong manifest hash is a 409 stale', async () => {
    const p = await publish()
    const r = await call('POST', `/api/packets/${(p.body.packet as { id: string }).id}/use`, { as: NICK }, { version: 1, manifest_hash: 'c'.repeat(64) })
    expect(r.status).toBe(409)
    expect((r.body.reasons as { code: string }[])[0].code).toBe('version_moved')
  })

  it('Dismiss closes the packet; GET then reads {packet: null}', async () => {
    const p = await publish()
    const id = (p.body.packet as { id: string }).id
    const d = await call('POST', `/api/packets/${id}/dismiss`, { as: NICK }, {})
    expect(d.status).toBe(200)
    expect(String(d.body.note)).toMatch(/stays in Gmail/)
    expect((await nickView()).packet).toBeNull()
    expect((await call('POST', `/api/packets/${id}/use`, { as: NICK }, { version: 1, manifest_hash: 'x' })).body.code).toBe('closed')
  })
})

// ── visibility ───────────────────────────────────────────────────────────────

describe('nobody but Nick and the PB key sees a packet', () => {
  it('a team member: packet routes 403, packet_state null on list and task reads, detail packet null', async () => {
    const p = await publish()
    const id = (p.body.packet as { id: string }).id
    expect((await call('GET', '/api/tasks/task_a/packet', { as: CASEY })).status).toBe(403)
    expect((await call('POST', `/api/packets/${id}/use`, { as: CASEY }, { version: 1, manifest_hash: 'x' })).status).toBe(403)
    expect((await call('POST', `/api/packets/${id}/dismiss`, { as: CASEY }, {})).status).toBe(403)

    const list = await call('GET', '/api/tasks', { as: CASEY })
    const rowA = (list.body.data as Record<string, unknown>[]).find((r) => r.id === 'task_a')
    expect(rowA).toBeDefined()
    expect(rowA!.packet_state).toBeNull()
    expect('packet_id' in rowA!).toBe(false)
    expect((await call('GET', '/api/tasks/task_a', { as: CASEY })).body.data).toMatchObject({ packet_state: null })
    expect(((await call('GET', '/api/tasks/task_a/detail', { as: CASEY })).body.data as { packet: unknown }).packet).toEqual({ packet: null })
    expect(one('SELECT closed_at FROM task_packets WHERE id = ?', id)?.closed_at).toBeNull()
  })

  it('Nick: packet_state on list and task reads, the packet on the detail payload', async () => {
    await publish()
    const list = await call('GET', '/api/tasks', { as: NICK })
    const rows = list.body.data as Record<string, unknown>[]
    expect(rows.find((r) => r.id === 'task_a')?.packet_state).toBe('ready')
    expect(rows.find((r) => r.id === 'task_b')?.packet_state).toBeNull()
    expect(((await call('GET', '/api/tasks/task_a', { as: NICK })).body.data as Record<string, unknown>).packet_state).toBe('ready')
    const detail = (await call('GET', '/api/tasks/task_a/detail', { as: NICK })).body.data as { packet: { freshness: { state: string } } }
    expect(detail.packet.freshness.state).toBe('ready')
  })

  it('the PB sync read (seq_after) carries no packet columns', async () => {
    await publish()
    const r = await call('GET', '/api/tasks?seq_after=0', { pb: true })
    const row = (r.body.data as Record<string, unknown>[]).find((x) => x.id === 'task_a')
    expect(row).toBeDefined()
    expect('packet_state' in row!).toBe(false)
  })
})
