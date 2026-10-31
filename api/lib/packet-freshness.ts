// packet-freshness.ts -- is a prepared first step still good? (schema-v153)
//
// ONE function, packetFreshness(), derives ready / changed / unverified from a
// packet version's input manifest on every read. Nothing about freshness is
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

/** The task's work-field token, or null when the caller cannot read the task. */
export async function taskWorkToken(db: D1Database, taskId: string): Promise<string | null> {
  const row = await db.prepare(`SELECT ${TASK_PACKET_WORK_COLS.join(', ')} FROM tasks WHERE id = ?`)
    .bind(taskId).first<Record<string, unknown>>()
  return row ? sha256Hex(stableStringify(row)) : null
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

async function threadReasons(db: D1Database, input: PacketInput, nowMs: number): Promise<PacketReason[]> {
  const observed = stamp(input.observed_at)
  const msgs = await db.prepare(
    "SELECT internal_at, from_display FROM mail_messages WHERE thread_id = ? AND party <> 'nick' ORDER BY internal_at DESC LIMIT 50",
  ).bind(input.ref).all<{ internal_at: string; from_display: string | null }>()
  const newer = (msgs.results ?? []).filter((m) => stamp(m.internal_at) > observed)
  if (newer.length > 0) {
    const who = newer[0].from_display || 'Someone'
    return [{ kind: 'thread', ref: input.ref, code: 'reply_arrived', text: `${who} replied on the thread after this was prepared` }]
  }
  // The watcher's receipts for this thread: its latest read, and its result in
  // the latest closed run that handed the thread out.
  const rec = await db.prepare(
    `SELECT MAX(CASE WHEN wrt.result = 'read' THEN r.closed_at END) AS read_at,
            (SELECT w2.result FROM watch_run_threads w2 JOIN watch_runs r2 ON r2.id = w2.run_id
              WHERE w2.thread_id = ? AND r2.closed_at IS NOT NULL AND w2.result IS NOT NULL
              ORDER BY r2.closed_at DESC LIMIT 1) AS last_result
       FROM watch_run_threads wrt JOIN watch_runs r ON r.id = wrt.run_id
      WHERE wrt.thread_id = ? AND r.closed_at IS NOT NULL`,
  ).bind(input.ref, input.ref).first<{ read_at: string | null; last_result: string | null }>()
  if (rec?.last_result === 'not_found' || rec?.last_result === 'error') {
    return [{ kind: 'thread', ref: input.ref, code: 'thread_unreadable', text: `The mail watcher could not read the thread (${rec.last_result})` }]
  }
  // Seen through = the later of the producer's own read and the watcher's.
  const seen = Math.max(Number.isFinite(observed) ? observed : 0, stamp(rec?.read_at ?? null) || 0)
  const [latestDue] = dueSlots(nowMs, 1)
  if (latestDue !== undefined && seen < latestDue) {
    return [{ kind: 'thread', ref: input.ref, code: 'thread_not_checked', text: 'The mail watcher has not checked the thread since its last slot' }]
  }
  return []
}

async function activityReasons(db: D1Database, taskId: string, input: PacketInput): Promise<PacketReason[]> {
  const rows = await db.prepare(
    `SELECT actor_slug, created_at FROM activity_entries
      WHERE entity_type = 'task' AND entity_id = ? AND kind IN ('comment', 'update')
        AND actor_slug <> 'claude-ai' AND hidden_at IS NULL
      ORDER BY created_at DESC LIMIT 20`,
  ).bind(taskId).all<{ actor_slug: string; created_at: string }>()
  const observed = stamp(input.observed_at)
  const newer = (rows.results ?? []).filter((r) => stamp(r.created_at) > observed)
  if (newer.length === 0) return []
  return [{ kind: 'activity', ref: taskId, code: 'activity_added', text: `${newer[0].actor_slug} posted on the task after this was prepared` }]
}

/**
 * Freshness of one packet version. `taskId` is the packet's task; `inputs` the
 * version's stored manifest. `nowMs` is the clock (injected for the watcher's
 * slot arithmetic).
 */
export async function packetFreshness(
  db: D1Database, taskId: string, inputs: readonly PacketInput[], nowMs: number,
): Promise<PacketFreshness> {
  const reasons: PacketReason[] = []
  for (const input of inputs) {
    switch (input.kind) {
      case 'task': {
        const now = await taskWorkToken(db, input.ref)
        if (now === null) reasons.push({ kind: 'task', ref: input.ref, code: 'task_missing', text: 'The task is gone' })
        else if (now !== input.token) reasons.push({ kind: 'task', ref: input.ref, code: 'task_changed', text: 'The task changed after this was prepared' })
        break
      }
      case 'thread':
        reasons.push(...(await threadReasons(db, input, nowMs)))
        break
      case 'activity':
        reasons.push(...(await activityReasons(db, input.ref || taskId, input)))
        break
      case 'product_draft': {
        const now = await currentDraftToken(db, input.ref)
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
