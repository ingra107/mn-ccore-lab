// packet-freshness.ts -- is a prepared first step still good? (schema-v153)
//
// ONE function, packetFreshnessMany(), derives ready / changed / unverified from
// packet versions' input manifests on every read (packetFreshness is its one-job form). Nothing about freshness is
// stored, so a reply, a comment or an edit cannot be missed by a cache that
// forgot to update. Plan: PB Scratch/plans/2026-10-30-first-step-packet-RECONCILED.md
// "Freshness".
//
// Per input kind:
//   task           the task's WORK fields hash to the token recorded at
//                  prepare time. Seq, the plan fields and read receipts are
//                  not work (TASK_PACKET_NOISE_COLS): moving a task in the day
//                  plan, or opening it, leaves the packet Ready.
//   thread         a mail_messages row on the thread from anyone but Nick,
//                  newer than observed_at -> changed. The watcher's latest
//                  read failing, or no read since a due slot that passed after
//                  the observation -> unverified (shared/mailWatch.ts dueSlots).
//   activity       a person's comment or update on the task (not claude-ai,
//                  not hidden) newer than observed_at -> changed.
//   product_draft  the product's current-draft link is no longer the token.
//   gdoc           always unverified: no Google Doc watcher exists yet.
//
// Any changed reason makes the packet 'changed'; else any unverified reason
// makes it 'unverified'; else 'ready'.
//
// Every read goes through the caller's handle. The packet tables are Nick-only
// (table-scope.ts), so only Nick's session and the PB key ever reach here with
// a packet to judge.

import { dbStampToIso } from '../../shared/dbTime'
import { dueSlots } from '../../shared/mailWatch'
import type { PacketFreshness, PacketInput, PacketReason, PacketState } from '../../shared/packets'

/**
 * Columns of `tasks` that are NOT the work: bookkeeping, ordering in the day
 * plan, and read receipts. Every other column is work and is hashed.
 * api/lib/packet-freshness.test.ts fails when a tasks column is in neither
 * list, so a new column cannot reach the hash (or escape it) unclassified.
 */
export const TASK_PACKET_NOISE_COLS = [
  'created_at', 'updated_at', 'seq', 'last_mutation_id',
  'acknowledged_at', 'acknowledged_by',
  'planned_for', 'plan_slot', 'plan_rank', 'plan_start_min', 'group_override',
  'question_telegram_json',
  // schema v157: which Today section the task sits in, not what the task is.
  'work_kind', 'work_kind_set',
] as const

/** Columns of `tasks` whose change means the prepared step may be wrong. */
export const TASK_PACKET_WORK_COLS = [
  'id', 'meeting_id', 'project_id', 'product_id', 'parent_id', 'kind',
  'title', 'short_title', 'description', 'description_json', 'instructions', 'notes',
  'assignee', 'assigned_by', 'watchers', 'priority', 'effort', 'estimated_minutes',
  'status', 'completed', 'completed_at', 'completed_by', 'deleted_at', 'approval_status',
  'due_date', 'deadline', 'deadline_type', 'reminder_days', 'next_checkin_date', 'nick_followup_date',
  'waiting_on', 'waiting_since', 'promised_to', 'promise_date', 'blocked_by', 'requires_nick_brain',
  'source', 'source_thread_id', 'related_message_ids', 'email_link', 'inbox_event_id', 'next_artifact',
  'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc',
  'question_spec_json', 'question_answer_json', 'question_consumed_json',
  // schema v155: the skill the Run button starts is how the task gets done.
  'run_skill',
] as const

/** JSON with object keys sorted at every depth, so equal values hash equal. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The hash a version records for its input manifest (the Use compare-and-set). */
export function manifestHash(inputs: readonly PacketInput[]): Promise<string> {
  return sha256Hex(stableStringify(inputs))
}

const workToken = (row: Record<string, unknown>): Promise<string> => sha256Hex(stableStringify(row))

/** The task's work-field token, or null when the caller cannot read the task. */
export async function taskWorkToken(db: D1Database, taskId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT ${TASK_PACKET_WORK_COLS.join(', ')} FROM tasks WHERE id = ?`)
    .bind(taskId).first<Record<string, unknown>>()
  return row ? workToken(row) : null
}

/** The id of the product's live current-draft link, or null when it has none. */
export async function currentDraftToken(db: D1Database, productId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT id FROM links WHERE product_id = ? AND role = 'current_draft' AND deleted_at IS NULL LIMIT 1",
  ).bind(productId).first<{ id: string }>()
  return row?.id ?? null
}

const stamp = (s: string | null | undefined): number => (s ? Date.parse(dbStampToIso(s)) : Number.NaN)

const CHANGED_CODES = new Set<PacketReason['code']>(['task_changed', 'reply_arrived', 'activity_added', 'draft_replaced', 'task_missing', 'version_moved'])

// The freshness evidence for a whole page of packets, read in one statement per
// input kind, never one per packet. The Today list carries every live packet
// (21 on 2026-11-06), and the per-input loop this replaced issued ~6 statements
// for each on every list read, a large share of what tripped D1's 10-second
// resource limit (PB #9033). Every read still goes through the caller's handle.
const MAIL_LOOKBACK = 50
const ACTIVITY_LOOKBACK = 20

interface FreshnessEvidence {
  taskTokens: Map<string, string>
  mail: Map<string, { internal_at: string; from_display: string | null }[]>
  receipts: Map<string, { readAt: string | null; lastResult: string | null; lastClosedAt: string | null }>
  activity: Map<string, { actor_slug: string; created_at: string }[]>
  draftTokens: Map<string, string>
}

function push<T>(m: Map<string, T[]>, k: string, v: T): void {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

const activityRef = (taskId: string, input: PacketInput): string => input.ref || taskId

async function readEvidence(db: D1Database, jobs: readonly PacketFreshnessJob[]): Promise<FreshnessEvidence> {
  const refs = { task: new Set<string>(), thread: new Set<string>(), activity: new Set<string>(), product_draft: new Set<string>() }
  for (const job of jobs) {
    for (const input of job.inputs) {
      if (input.kind === 'task') refs.task.add(input.ref)
      else if (input.kind === 'thread') refs.thread.add(input.ref)
      else if (input.kind === 'activity') refs.activity.add(activityRef(job.taskId, input))
      else if (input.kind === 'product_draft') refs.product_draft.add(input.ref)
    }
  }
  const ids = (set: Set<string>) => JSON.stringify([...set])
  const none = Promise.resolve({ results: [] })
  const [taskRows, mailRows, receiptRows, activityRows, draftRows] = await Promise.all([
    refs.task.size === 0 ? none : db.prepare(`SELECT ${TASK_PACKET_WORK_COLS.join(', ')} FROM tasks WHERE id IN (SELECT value FROM json_each(?))`)
      .bind(ids(refs.task)).all<Record<string, unknown>>(),
    refs.thread.size === 0 ? none : db.prepare(
      `SELECT thread_id, internal_at, from_display FROM mail_messages
        WHERE thread_id IN (SELECT value FROM json_each(?)) AND party <> 'nick' ORDER BY internal_at DESC`,
    ).bind(ids(refs.thread)).all<{ thread_id: string; internal_at: string; from_display: string | null }>(),
    refs.thread.size === 0 ? none : db.prepare(
      `SELECT wrt.thread_id, wrt.result, r.closed_at
         FROM watch_run_threads wrt JOIN watch_runs r ON r.id = wrt.run_id
        WHERE wrt.thread_id IN (SELECT value FROM json_each(?)) AND r.closed_at IS NOT NULL`,
    ).bind(ids(refs.thread)).all<{ thread_id: string; result: string | null; closed_at: string }>(),
    refs.activity.size === 0 ? none : db.prepare(
      `SELECT entity_id, actor_slug, created_at FROM activity_entries
        WHERE entity_type = 'task' AND entity_id IN (SELECT value FROM json_each(?)) AND kind IN ('comment', 'update')
          AND actor_slug <> 'claude-ai' AND hidden_at IS NULL
        ORDER BY created_at DESC`,
    ).bind(ids(refs.activity)).all<{ entity_id: string; actor_slug: string; created_at: string }>(),
    refs.product_draft.size === 0 ? none : db.prepare(
      `SELECT product_id, id FROM links WHERE product_id IN (SELECT value FROM json_each(?)) AND role = 'current_draft' AND deleted_at IS NULL`,
    ).bind(ids(refs.product_draft)).all<{ product_id: string; id: string }>(),
  ])

  const ev: FreshnessEvidence = { taskTokens: new Map(), mail: new Map(), receipts: new Map(), activity: new Map(), draftTokens: new Map() }
  for (const row of (taskRows.results ?? []) as Record<string, unknown>[]) ev.taskTokens.set(String(row.id), await workToken(row))
  for (const m of (mailRows.results ?? []) as { thread_id: string; internal_at: string; from_display: string | null }[]) push(ev.mail, m.thread_id, m)
  for (const r of (receiptRows.results ?? []) as { thread_id: string; result: string | null; closed_at: string }[]) {
    const rec = ev.receipts.get(r.thread_id) ?? { readAt: null, lastResult: null, lastClosedAt: null }
    if (r.result === 'read' && (rec.readAt === null || r.closed_at > rec.readAt)) rec.readAt = r.closed_at
    if (r.result !== null && (rec.lastClosedAt === null || r.closed_at > rec.lastClosedAt)) {
      rec.lastClosedAt = r.closed_at
      rec.lastResult = r.result
    }
    ev.receipts.set(r.thread_id, rec)
  }
  for (const a of (activityRows.results ?? []) as { entity_id: string; actor_slug: string; created_at: string }[]) push(ev.activity, a.entity_id, a)
  for (const d of (draftRows.results ?? []) as { product_id: string; id: string }[]) {
    if (!ev.draftTokens.has(d.product_id)) ev.draftTokens.set(d.product_id, d.id)
  }
  return ev
}

function threadReasons(ev: FreshnessEvidence, input: PacketInput, nowMs: number): PacketReason[] {
  const observed = stamp(input.observed_at)
  const newer = (ev.mail.get(input.ref) ?? []).slice(0, MAIL_LOOKBACK).filter((m) => stamp(m.internal_at) > observed)
  if (newer.length > 0) {
    const who = newer[0].from_display || 'Someone'
    return [{ kind: 'thread', ref: input.ref, code: 'reply_arrived', text: `${who} replied on the thread after this was prepared` }]
  }
  // The watcher's receipts for this thread: its latest read, and its result in
  // the latest closed run that handed the thread out.
  const rec = ev.receipts.get(input.ref)
  if (rec?.lastResult === 'not_found' || rec?.lastResult === 'error') {
    return [{ kind: 'thread', ref: input.ref, code: 'thread_unreadable', text: `The mail watcher could not read the thread (${rec.lastResult})` }]
  }
  // Seen through = the later of the producer's own read and the watcher's.
  const seen = Math.max(Number.isFinite(observed) ? observed : 0, stamp(rec?.readAt ?? null) || 0)
  const [latestDue] = dueSlots(nowMs, 1)
  if (latestDue !== undefined && seen < latestDue) {
    return [{ kind: 'thread', ref: input.ref, code: 'thread_not_checked', text: 'The mail watcher has not checked the thread since its last slot' }]
  }
  return []
}

function activityReasons(ev: FreshnessEvidence, taskId: string, input: PacketInput): PacketReason[] {
  const rows = ev.activity.get(activityRef(taskId, input)) ?? []
  const observed = stamp(input.observed_at)
  const newer = rows.slice(0, ACTIVITY_LOOKBACK).filter((r) => stamp(r.created_at) > observed)
  if (newer.length === 0) return []
  return [{ kind: 'activity', ref: activityRef(taskId, input), code: 'activity_added', text: `${newer[0].actor_slug} posted on the task after this was prepared` }]
}

/** One packet version to judge: its task, and its version's stored manifest. */
export interface PacketFreshnessJob { taskId: string; inputs: readonly PacketInput[] }

/**
 * Freshness of many packet versions, in the order given. `nowMs` is the clock
 * (injected for the watcher's slot arithmetic).
 */
export async function packetFreshnessMany(
  db: D1Database, jobs: readonly PacketFreshnessJob[], nowMs: number,
): Promise<PacketFreshness[]> {
  if (jobs.length === 0) return []
  const ev = await readEvidence(db, jobs)
  return jobs.map((job) => judge(ev, job, nowMs))
}

/** Freshness of one packet version: packetFreshnessMany with one job. */
export async function packetFreshness(
  db: D1Database, taskId: string, inputs: readonly PacketInput[], nowMs: number,
): Promise<PacketFreshness> {
  const [one] = await packetFreshnessMany(db, [{ taskId, inputs }], nowMs)
  return one
}

function judge(ev: FreshnessEvidence, job: PacketFreshnessJob, nowMs: number): PacketFreshness {
  const reasons: PacketReason[] = []
  for (const input of job.inputs) {
    switch (input.kind) {
      case 'task': {
        const now = ev.taskTokens.get(input.ref) ?? null
        if (now === null) reasons.push({ kind: 'task', ref: input.ref, code: 'task_missing', text: 'The task is gone' })
        else if (now !== input.token) reasons.push({ kind: 'task', ref: input.ref, code: 'task_changed', text: 'The task changed after this was prepared' })
        break
      }
      case 'thread':
        reasons.push(...threadReasons(ev, input, nowMs))
        break
      case 'activity':
        reasons.push(...activityReasons(ev, job.taskId, input))
        break
      case 'product_draft': {
        const now = ev.draftTokens.get(input.ref) ?? null
        if (now !== input.token) reasons.push({ kind: 'product_draft', ref: input.ref, code: 'draft_replaced', text: 'The product\'s current draft changed after this was prepared' })
        break
      }
      case 'gdoc':
        reasons.push({ kind: 'gdoc', ref: input.ref, code: 'gdoc_unwatched', text: 'Google Doc edits are not watched yet' })
        break
      default: {
        const unplaced: never = input.kind
        throw new Error(`packet input kind ${String(unplaced)} has no freshness rule`)
      }
    }
  }
  const state: PacketState = reasons.some((r) => CHANGED_CODES.has(r.code))
    ? 'changed'
    : reasons.length > 0 ? 'unverified' : 'ready'
  return { state, reasons }
}
