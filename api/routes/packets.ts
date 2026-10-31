// packets.ts -- the prepared first step (schema-v153).
//
// Nick, 2026-10-29: "instead of me having to do like the process task
// everyday". Decision (the v1 contract these routes implement):
// PB Context/Decisions/2026-10-30-first-step-packet.md.
//
//   POST /api/tasks/:id/packets   a producer publishes (PB key or Nick). Idempotent
//                                 on producer_key; a new key supersedes the live packet
//                                 unless Nick wrote a version of it (409).
//   GET  /api/tasks/:id/packet    the live packet + freshness, or {packet: null}
//   POST /api/packets/:id/use     compare-and-set on (version, manifest_hash); stale or
//                                 changed -> 409 with reasons; one Use per packet.
//                                 Returns the deliverable url. Completes nothing.
//   POST /api/packets/:id/dismiss closes the packet. The Gmail draft stays.
//
// Nick only: every handler takes `owner` (his session with the PI flag, or the
// PB key), decided in api/index.ts the way the mail-watch snapshot is. Anyone
// else gets 403. The tables are Nick-only one layer down too (table-scope.ts).
// This module writes only the three packet tables; it changes no task.

import { nowInstant } from '../lib/time'
import { manifestHash, packetFreshness, taskWorkToken, currentDraftToken } from '../lib/packet-freshness'
import {
  DELIVERABLE_KINDS, INPUT_KINDS, missingAnchors,
  type Deliverable, type PacketCall, type PacketInput, type PacketRow, type PacketVersion, type PacketView,
} from '../../shared/packets'
import { GMAIL_THREAD_ID_RX } from '../../shared/mailWatch'

type Json = Record<string, unknown>

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })

const forbidden = () => reply({ error: 'Nick only', code: 'forbidden' }, 403)

const MAX_CALLS = 20
const MAX_INPUTS = 20
const MAX_BODY = 100_000

function hexId(prefix: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `${prefix}${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function readBody(request: Request): Promise<Json | null> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Json) : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : null

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

const isHttps = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/\S+$/.test(v) && v.length <= 2000

// ── stored rows -> the wire shape ─────────────────────────────────────────────

interface PacketDbRow {
  id: string; task_id: string; producer_key: string; current_version: number
  created_at: string; closed_at: string | null; close_reason: 'superseded' | 'dismissed' | null
  used_at: string | null
}
interface VersionDbRow {
  version: number; author: 'claude' | 'nick'; instruction: string; minutes: number | null
  deliverable_json: string; body: string; calls_json: string; manifest_json: string
  manifest_hash: string; created_at: string
}

const PACKET_COLS = `p.id, p.task_id, p.producer_key, p.current_version, p.created_at, p.closed_at, p.close_reason,
  (SELECT a.created_at FROM task_packet_actions a WHERE a.packet_id = p.id AND a.action = 'use') AS used_at`
const VERSION_COLS = 'version, author, instruction, minutes, deliverable_json, body, calls_json, manifest_json, manifest_hash, created_at'

function toVersion(v: VersionDbRow): PacketVersion {
  return {
    version: v.version, author: v.author, instruction: v.instruction, minutes: v.minutes,
    deliverable: JSON.parse(v.deliverable_json) as Deliverable, body: v.body,
    calls: JSON.parse(v.calls_json) as PacketCall[], inputs: JSON.parse(v.manifest_json) as PacketInput[],
    manifest_hash: v.manifest_hash, created_at: v.created_at,
  }
}

async function packetBy(db: D1Database, where: string, bind: string): Promise<PacketDbRow | null> {
  return db.prepare(`SELECT ${PACKET_COLS} FROM task_packets p WHERE ${where}`).bind(bind).first<PacketDbRow>()
}

async function currentVersion(db: D1Database, p: PacketDbRow): Promise<VersionDbRow | null> {
  return db.prepare(`SELECT ${VERSION_COLS} FROM task_packet_versions WHERE packet_id = ? AND version = ?`)
    .bind(p.id, p.current_version).first<VersionDbRow>()
}

async function viewOf(db: D1Database, p: PacketDbRow, nowMs: number): Promise<PacketView> {
  const v = await currentVersion(db, p)
  if (!v) throw new Error(`packet ${p.id} has no version ${p.current_version}`)
  const version = toVersion(v)
  const packet: PacketRow = { ...p }
  return { packet, version, freshness: await packetFreshness(db, p.task_id, version.inputs, nowMs) }
}

/** The task's live packet as the wire shape, or {packet: null}. Reads through
 *  the caller's handle: for anyone but Nick and the PB key the packet tables
 *  are empty, so this is {packet: null} for them by construction. */
export async function livePacketView(db: D1Database, taskId: string, nowMs = Date.now()): Promise<PacketView> {
  const p = await packetBy(db, 'p.task_id = ? AND p.closed_at IS NULL', taskId)
  return p ? viewOf(db, p, nowMs) : { packet: null }
}

/**
 * packet_state for a page of task rows: each row with a live packet gets
 * 'ready' | 'changed' | 'unverified', every other row null. The packet ids come
 * from the rows' own `packet_id` column (TASK_PACKET_ID_COL), which reads the
 * caller's copy of task_packets, so a non-owner's rows carry no id and stay
 * null. The helper column is removed from each row.
 */
export async function attachPacketStates(db: D1Database, rows: Record<string, unknown>[], nowMs = Date.now()): Promise<void> {
  for (const row of rows) {
    const id = typeof row.packet_id === 'string' ? row.packet_id : null
    delete row.packet_id
    row.packet_state = null
    if (!id) continue
    const p = await packetBy(db, 'p.id = ?', id)
    const v = p ? await currentVersion(db, p) : null
    // A used packet has done its job: no Ready/Changed tag on the row.
    if (!p || !v || p.used_at) continue
    row.packet_state = (await packetFreshness(db, p.task_id, toVersion(v).inputs, nowMs)).state
  }
}

/** The live packet id of a task read aliased `t`; NULL for any viewer whose
 *  copy of task_packets is empty. Paired with attachPacketStates. */
export const TASK_PACKET_ID_COL =
  '(SELECT tp.id FROM task_packets tp WHERE tp.task_id = t.id AND tp.closed_at IS NULL) AS packet_id'

// ── POST /api/tasks/:id/packets ───────────────────────────────────────────────

function parseDeliverable(raw: unknown): Deliverable | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'deliverable must be an object'
  const d = raw as Json
  if (!(DELIVERABLE_KINDS as readonly unknown[]).includes(d.kind)) return `deliverable.kind must be one of ${DELIVERABLE_KINDS.join('/')}`
  if (d.kind === 'gmail_draft') {
    const id = str(d.gmail_draft_id, 200)
    const subject = typeof d.subject === 'string' && d.subject.length <= 500 ? d.subject : null
    const to = typeof d.to === 'string' ? d.to.slice(0, 1000)
      : Array.isArray(d.to) && d.to.every((x) => typeof x === 'string') ? (d.to as string[]).slice(0, 50) : null
    if (!id || !isHttps(d.url) || subject === null || to === null) {
      return 'a gmail_draft needs gmail_draft_id, an https url, to and subject'
    }
    const threadId = d.thread_id == null ? null : typeof d.thread_id === 'string' && GMAIL_THREAD_ID_RX.test(d.thread_id) ? d.thread_id : undefined
    if (threadId === undefined) return 'deliverable.thread_id must be a Gmail thread id (16 hex) or null'
    return { kind: 'gmail_draft', gmail_draft_id: id, url: d.url, to, subject, thread_id: threadId }
  }
  if (d.kind === 'doc_text') {
    if (d.url != null && !isHttps(d.url)) return 'deliverable.url must be https'
    return { kind: 'doc_text', url: (d.url as string | undefined) ?? null, title: typeof d.title === 'string' ? d.title.slice(0, 300) : null }
  }
  return { kind: 'answer' }
}

function parseCalls(raw: unknown): PacketCall[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_CALLS) return `calls must be an array of at most ${MAX_CALLS}`
  const out: PacketCall[] = []
  for (const c of raw) {
    const o = (c ?? {}) as Json
    const title = str(o.title, 300)
    const decision = str(o.decision, 2000)
    const anchor = typeof o.anchor === 'string' ? o.anchor : ''
    if (!title || !decision || anchor.length === 0 || anchor.length > 1000) return 'each call needs title, decision and a non-empty anchor'
    out.push({ title, decision, anchor })
  }
  return out
}

function parseInputs(raw: unknown, now: string): PacketInput[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return `inputs must be an array of at most ${MAX_INPUTS}`
  const out: PacketInput[] = []
  for (const i of raw) {
    const o = (i ?? {}) as Json
    if (!(INPUT_KINDS as readonly unknown[]).includes(o.kind)) return `input.kind must be one of ${INPUT_KINDS.join('/')}`
    const kind = o.kind as PacketInput['kind']
    const ref = str(o.ref, 500)
    if (!ref && kind !== 'task' && kind !== 'activity') return `input ${kind} needs a ref`
    if (kind === 'thread' && !GMAIL_THREAD_ID_RX.test(ref ?? '')) return 'a thread input ref is a Gmail thread id (16 hex)'
    const observed = o.observed_at === undefined ? now : isoOrNull(o.observed_at)
    if (!observed) return `input ${kind}: observed_at must be a timestamp`
    if (kind === 'thread' && o.observed_at === undefined) return 'a thread input needs observed_at (when the producer read it)'
    out.push({ kind, ref: ref ?? '', token: typeof o.token === 'string' ? o.token.slice(0, 200) : null, observed_at: observed })
  }
  return out
}

/** The stored manifest: the producer's inputs with the Hub's own tokens, plus
 *  the task and its activity, which every packet depends on. */
async function buildManifest(db: D1Database, taskId: string, inputs: PacketInput[], now: string): Promise<PacketInput[] | string> {
  const out: PacketInput[] = []
  const taskToken = await taskWorkToken(db, taskId)
  if (taskToken === null) return 'task not readable'
  out.push({ kind: 'task', ref: taskId, token: taskToken, observed_at: now })
  const activity = inputs.find((i) => i.kind === 'activity')
  out.push({ kind: 'activity', ref: taskId, token: null, observed_at: activity?.observed_at ?? now })
  const seen = new Set<string>()
  for (const i of inputs) {
    if (i.kind === 'task' || i.kind === 'activity') continue
    const key = `${i.kind}:${i.ref}`
    if (seen.has(key)) continue
    seen.add(key)
    if (i.kind === 'product_draft') {
      const token = await currentDraftToken(db, i.ref)
      if (token === null) return `product ${i.ref} has no current draft`
      out.push({ ...i, token })
    } else {
      out.push({ ...i, token: i.kind === 'thread' ? null : i.token })
    }
  }
  return out
}

const isConstraint = (e: unknown) => /SQLITE_CONSTRAINT/.test(String((e as Error)?.message ?? e))

export async function handlePublishPacket(taskId: string, request: Request, db: D1Database, owner: boolean): Promise<Response> {
  if (!owner) return forbidden()
  const body = await readBody(request)
  if (!body) return reply({ error: 'JSON object body required', code: 'bad_request' }, 400)
  const producerKey = str(body.producer_key, 200)
  const instruction = str(body.instruction, 2000)
  const text = typeof body.body === 'string' ? body.body : null
  if (!producerKey || !instruction || text === null || text.length > MAX_BODY) {
    return reply({ error: `producer_key, instruction and body (at most ${MAX_BODY} characters) are required`, code: 'bad_request' }, 400)
  }
  const minutes = body.minutes == null ? null
    : Number.isInteger(body.minutes) && (body.minutes as number) >= 1 && (body.minutes as number) <= 600 ? body.minutes as number : undefined
  if (minutes === undefined) return reply({ error: 'minutes must be an integer from 1 to 600', code: 'bad_request' }, 400)
  const deliverable = parseDeliverable(body.deliverable)
  if (typeof deliverable === 'string') return reply({ error: deliverable, code: 'bad_request' }, 400)
  const calls = parseCalls(body.calls)
  if (typeof calls === 'string') return reply({ error: calls, code: 'bad_request' }, 400)
  const missing = missingAnchors(text, calls)
  if (missing.length > 0) {
    return reply({ error: 'every call anchor must be a substring of body', code: 'anchor_not_in_body', anchors: missing }, 400)
  }
  const now = nowInstant()
  const inputs = parseInputs(body.inputs, now)
  if (typeof inputs === 'string') return reply({ error: inputs, code: 'bad_request' }, 400)
  if (deliverable.kind === 'gmail_draft' && deliverable.thread_id
      && !inputs.some((i) => i.kind === 'thread' && i.ref === deliverable.thread_id)) {
    return reply({ error: 'a gmail_draft on a thread must list that thread in inputs (kind thread, with observed_at)', code: 'bad_request' }, 400)
  }

  const task = await db.prepare('SELECT 1 AS live FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(taskId).first<{ live: number }>()
  if (!task) return reply({ error: 'Task not found', code: 'not_found' }, 404)

  const nowMs = Date.parse(now)
  const existing = await packetBy(db, 'p.producer_key = ?', producerKey)
  if (existing) {
    if (existing.task_id !== taskId) {
      return reply({ error: 'producer_key already names a packet on another task', code: 'producer_key_conflict', task_id: existing.task_id }, 409)
    }
    return reply(await viewOf(db, existing, nowMs))
  }

  const live = await packetBy(db, 'p.task_id = ? AND p.closed_at IS NULL', taskId)
  if (live) {
    const nick = await db.prepare("SELECT 1 AS x FROM task_packet_versions WHERE packet_id = ? AND author = 'nick' LIMIT 1")
      .bind(live.id).first()
    if (nick) {
      return reply({ error: 'Nick edited the live packet on this task; a producer may not replace it', code: 'nick_authored', packet_id: live.id }, 409)
    }
  }

  const manifest = await buildManifest(db, taskId, inputs, now)
  if (typeof manifest === 'string') return reply({ error: manifest, code: 'bad_request' }, 400)
  const hash = await manifestHash(manifest)
  const id = hexId('pkt_')
  const stmts: D1PreparedStatement[] = []
  if (live) {
    stmts.push(db.prepare(
      "UPDATE task_packets SET closed_at = ?, close_reason = 'superseded' WHERE id = ? AND closed_at IS NULL",
    ).bind(now, live.id))
  }
  stmts.push(
    db.prepare('INSERT INTO task_packets (id, task_id, producer_key, current_version, created_at) VALUES (?, ?, ?, 1, ?)')
      .bind(id, taskId, producerKey, now),
    db.prepare(
      `INSERT INTO task_packet_versions
         (packet_id, version, author, instruction, minutes, deliverable_kind, deliverable_json, body, calls_json, manifest_json, manifest_hash, created_at)
       VALUES (?, 1, 'claude', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, instruction, minutes, deliverable.kind, JSON.stringify(deliverable), text,
      JSON.stringify(calls), JSON.stringify(manifest), hash, now),
  )
  try {
    await db.batch(stmts)
  } catch (e) {
    if (!isConstraint(e)) throw e
    // A concurrent publish won: the same key (return it) or another key on the
    // same task (the one-live index refused this one).
    const winner = await packetBy(db, 'p.producer_key = ?', producerKey)
    if (winner && winner.task_id === taskId) return reply(await viewOf(db, winner, nowMs))
    const msg = String((e as Error).message)
    if (/task_packet_nick_authored/.test(msg)) {
      return reply({ error: 'Nick edited the live packet on this task; a producer may not replace it', code: 'nick_authored' }, 409)
    }
    return reply({ error: 'another packet was published on this task at the same time; retry', code: 'conflict' }, 409)
  }
  const created = await packetBy(db, 'p.id = ?', id)
  if (!created) return reply({ error: 'packet not stored', code: 'store_failed' }, 500)
  return reply(await viewOf(db, created, nowMs), 201)
}

// ── GET /api/tasks/:id/packet ─────────────────────────────────────────────────

export async function handleGetPacket(taskId: string, db: D1Database, owner: boolean): Promise<Response> {
  if (!owner) return forbidden()
  const task = await db.prepare('SELECT 1 AS live FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(taskId).first()
  if (!task) return reply({ error: 'Task not found', code: 'not_found' }, 404)
  return reply(await livePacketView(db, taskId, Date.parse(nowInstant())))
}

// ── POST /api/packets/:id/use ─────────────────────────────────────────────────

export async function handleUsePacket(packetId: string, request: Request, db: D1Database, owner: boolean, actor: string): Promise<Response> {
  if (!owner) return forbidden()
  const body = await readBody(request)
  const version = body?.version
  const hash = body?.manifest_hash
  if (!Number.isInteger(version) || typeof hash !== 'string') {
    return reply({ error: 'version (integer) and manifest_hash are required', code: 'bad_request' }, 400)
  }
  const p = await packetBy(db, 'p.id = ?', packetId)
  if (!p) return reply({ error: 'Packet not found', code: 'not_found' }, 404)
  const v = await currentVersion(db, p)
  if (!v) return reply({ error: 'Packet has no current version', code: 'not_found' }, 404)
  const deliverable = JSON.parse(v.deliverable_json) as Deliverable
  const url = 'url' in deliverable ? (deliverable.url ?? null) : null
  if (p.used_at) return reply({ error: 'This packet was already used', code: 'already_used', url, used_at: p.used_at }, 409)
  if (p.closed_at) return reply({ error: 'This packet is closed', code: 'closed', close_reason: p.close_reason }, 409)
  const nowMs = Date.parse(nowInstant())
  const freshness = await packetFreshness(db, p.task_id, toVersion(v).inputs, nowMs)
  const moved = version !== p.current_version || hash !== v.manifest_hash
  if (moved || freshness.state === 'changed') {
    const reasons = moved
      ? [{ kind: 'task' as const, ref: p.task_id, code: 'version_moved' as const, text: 'This step was re-prepared since you loaded it' }, ...freshness.reasons]
      : freshness.reasons
    return reply({
      error: 'Something changed since this was prepared. Refresh, then use.', code: 'stale',
      reasons, current_version: p.current_version, manifest_hash: v.manifest_hash,
    }, 409)
  }
  const actionId = hexId('pka_')
  const at = nowInstant()
  try {
    await db.prepare(
      "INSERT INTO task_packet_actions (id, packet_id, version, action, outcome, actor, created_at) VALUES (?, ?, ?, 'use', 'ok', ?, ?)",
    ).bind(actionId, p.id, p.current_version, actor, at).run()
  } catch (e) {
    if (!isConstraint(e)) throw e
    const again = await packetBy(db, 'p.id = ?', packetId)
    if (again?.closed_at && !again.used_at) return reply({ error: 'This packet is closed', code: 'closed', close_reason: again.close_reason }, 409)
    return reply({ error: 'This packet was already used', code: 'already_used', url, used_at: again?.used_at ?? null }, 409)
  }
  return reply({ ok: true, url, action_id: actionId, used_at: at })
}

// ── POST /api/packets/:id/dismiss ─────────────────────────────────────────────

export async function handleDismissPacket(packetId: string, db: D1Database, owner: boolean, actor: string): Promise<Response> {
  if (!owner) return forbidden()
  const p = await packetBy(db, 'p.id = ?', packetId)
  if (!p) return reply({ error: 'Packet not found', code: 'not_found' }, 404)
  const note = 'Dismissed here; the draft stays in Gmail.'
  if (p.close_reason === 'dismissed') return reply({ ok: true, packet_id: p.id, closed_at: p.closed_at, note })
  if (p.closed_at) return reply({ error: 'This packet is closed', code: 'closed', close_reason: p.close_reason }, 409)
  const at = nowInstant()
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO task_packet_actions (id, packet_id, version, action, outcome, actor, created_at) VALUES (?, ?, ?, 'dismiss', 'ok', ?, ?)",
      ).bind(hexId('pka_'), p.id, p.current_version, actor, at),
      db.prepare("UPDATE task_packets SET closed_at = ?, close_reason = 'dismissed' WHERE id = ? AND closed_at IS NULL").bind(at, p.id),
    ])
  } catch (e) {
    if (!isConstraint(e)) throw e
    return reply({ error: 'This packet closed while dismissing; reload', code: 'closed' }, 409)
  }
  return reply({ ok: true, packet_id: p.id, closed_at: at, note })
}
