// shared/packets.ts -- the prepared-first-step packet (schema-v153), the ONE
// vocabulary for the API (api/routes/packets.ts, api/lib/packet-freshness.ts)
// and the UI (the drawer's packet block, the row's Ready tag).
//
// Nick, 2026-10-29: "instead of me having to do like the process task
// everyday". Decision: PB Context/Decisions/2026-10-30-first-step-packet.md
// (v1 contract). Plan: PB Scratch/plans/2026-10-30-first-step-packet-RECONCILED.md.
//
// Freshness is derived on every read from the version's input manifest and is
// never stored: ready / changed / unverified.

/** What a packet prepares. Nothing that sends: the schema CHECK holds the same list. */
export const DELIVERABLE_KINDS = ['gmail_draft', 'doc_text', 'answer'] as const
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]

/** What a packet was prepared from. */
export const INPUT_KINDS = ['task', 'thread', 'activity', 'product_draft', 'gdoc'] as const
export type InputKind = (typeof INPUT_KINDS)[number]

export const PACKET_STATES = ['ready', 'changed', 'unverified'] as const
export type PacketState = (typeof PACKET_STATES)[number]

export const PACKET_AUTHORS = ['claude', 'nick'] as const
export type PacketAuthor = (typeof PACKET_AUTHORS)[number]

export type Deliverable =
  | { kind: 'gmail_draft'; gmail_draft_id: string; url: string; to: string | string[]; subject: string; thread_id?: string | null }
  | { kind: 'doc_text'; url?: string | null; title?: string | null }
  | { kind: 'answer' }

/** A decision the draft makes for Nick; `anchor` is a substring of the body. */
export interface PacketCall { title: string; decision: string; anchor: string }

/** One manifest entry, as stored. The Hub fills `token` for task and
 *  product_draft inputs, and always records a task and an activity entry. */
export interface PacketInput { kind: InputKind; ref: string; token: string | null; observed_at: string }

/** Why a packet is not Ready. `text` is the line the UI shows. */
export type PacketReasonCode =
  | 'task_changed'        // a work field of the task changed (not seq / plan fields)
  | 'reply_arrived'       // a message from someone else landed on the thread
  | 'activity_added'      // a person commented or posted an update on the task
  | 'draft_replaced'      // the product's current draft is a different link now
  | 'thread_not_checked'  // the watcher has not read the thread since a due slot
  | 'thread_unreadable'   // the watcher's latest read of the thread failed / not found
  | 'gdoc_unwatched'      // no Google Doc watcher exists, so a Doc input is never verified
  | 'task_missing'        // the task is gone or no longer readable
  | 'version_moved'       // Use named a version / manifest hash that is not the current one

export interface PacketReason { kind: InputKind; ref: string; code: PacketReasonCode; text: string }

export interface PacketFreshness { state: PacketState; reasons: PacketReason[] }

export interface PacketRow {
  id: string
  task_id: string
  producer_key: string
  current_version: number
  created_at: string
  closed_at: string | null
  close_reason: 'superseded' | 'dismissed' | null
  /** When Nick pressed Use (one per packet), and the url it returned. */
  used_at: string | null
}

export interface PacketVersion {
  version: number
  author: PacketAuthor
  instruction: string
  minutes: number | null
  deliverable: Deliverable
  body: string
  calls: PacketCall[]
  inputs: PacketInput[]
  manifest_hash: string
  created_at: string
}

/** GET /api/tasks/:id/packet, POST /api/tasks/:id/packets, and `packet` on
 *  GET /api/tasks/:id/detail. */
export type PacketView =
  | { packet: PacketRow; version: PacketVersion; freshness: PacketFreshness }
  | { packet: null }

/** POST /api/packets/:id/use body. */
export interface PacketUseRequest { version: number; manifest_hash: string }

/** 200 from POST /api/packets/:id/use. */
export interface PacketUseOk { ok: true; url: string | null; action_id: string; used_at: string }

/** 409 from POST /api/packets/:id/use. `stale`: refresh, then use. */
export type PacketUseRefusal =
  | { error: string; code: 'stale'; reasons: PacketReason[]; current_version: number; manifest_hash: string }
  | { error: string; code: 'already_used'; url: string | null; used_at: string | null }
  | { error: string; code: 'closed'; close_reason: 'superseded' | 'dismissed' | null }

/** 200 from POST /api/packets/:id/dismiss. */
export interface PacketDismissOk { ok: true; packet_id: string; closed_at: string; note: string }

/** Anchors that are empty or not a substring of the body (the 400 rule). */
export function missingAnchors(body: string, calls: readonly PacketCall[]): string[] {
  return calls.filter((c) => !c.anchor || !body.includes(c.anchor)).map((c) => c.anchor)
}
