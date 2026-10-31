// receipts.ts -- the Hub writes what PB changed, in the batch that changed it
// (schema-v154).
//
// Nick, 2026-10-30: "instead of me having to do like the process task
// everyday". Decision (v1 contract): PB Context/Decisions/2026-10-30-receipts-
// and-headless-process.md.
//
// WHO counts as PB: decided here from the authenticating key, never from a
// header. withReceiptOrigin() is called with SERVICE(c) (a valid PB_API_KEY,
// api/middleware/api-key-auth.ts validateApiKey) and stamps env.RECEIPT_ORIGIN;
// every write boundary reads that field. A browser session never gets one, the
// mail watcher's key never gets one (it is not the PB key), and the cron has no
// request. The X-PB-Run / X-PB-Lane / X-PB-Machine headers only NAME the run;
// absent, the write lands in 'unattributed:<machine|unknown>:<CT date>'.
//
// HOW a line is atomic with its write: every builder here returns STATEMENTS,
// never runs them. The write boundary (mutations.ts commitRowWrite /
// applyInsert / meetingDedupAccepted / the project-movement stamps,
// current-draft.ts, activity-entry.ts postActivityEntry) puts them in its own
// D1 batch, gated on the same "this write landed" predicate as its other
// dependents. A line that fails to insert (a CHECK, the FK) fails the batch, so
// the write rolls back with it.
//
// The SQL lives here, not in mutations.ts, so mutations.ts keeps exactly one
// door per write (api/route_no_raw_writes.test.ts scans only that file's text).

import type { Env } from '../types'
import { ctDateString } from './ct-date'
import { TABLE_PRIVATE_COLS } from './task-cols'
import { nowInstant } from './time'

export type ReceiptOp = 'insert' | 'update' | 'delete' | 'append'
export type InverseKind = 'patch' | 'tombstone' | 'hide_entry' | 'current_draft_undo' | 'revert_commit' | 'none'
export const INVERSE_KINDS: readonly InverseKind[] = ['patch', 'tombstone', 'hide_entry', 'current_draft_undo', 'revert_commit', 'none']
export const LINE_KINDS = ['change', 'failure', 'left_for_nick'] as const
export type LineKind = (typeof LINE_KINDS)[number]
export const CLAIM_STATES = ['claimed', 'done', 'failed', 'left'] as const
export type ClaimState = (typeof CLAIM_STATES)[number]

/** The run a PB write is recorded under. */
export interface ReceiptOrigin {
  runId: string
  lane: string
  machine: string
  origin: 'pb' | 'unattributed'
  /** Set by every receipt builder that runs for this request, whether or not
   *  the write changed anything. The catch-all (receiptCatchAll) reads it: a
   *  PB write the request never considered gets a summary line. Mutable on
   *  purpose -- every env copy of one request shares this one object. */
  handled: boolean
}

/** An env carrying the request's receipt origin. Optional so every existing
 *  Env literal (tests, the cron) stays valid: absent = not a PB write. */
export type ReceiptEnv = Env & { RECEIPT_ORIGIN?: ReceiptOrigin | null }

export const RUN_HEADER = 'X-PB-Run'
export const LANE_HEADER = 'X-PB-Lane'
export const MACHINE_HEADER = 'X-PB-Machine'

const NAME_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/
const RUN_ID_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/

/** A header value usable as a lane / machine / run id, or null. */
function headerName(request: Request, name: string, rx = NAME_RX): string | null {
  const v = request.headers.get(name)?.trim() ?? ''
  return rx.test(v) ? v : null
}

/**
 * The receipt origin of a request, or null when it is not the PB key. `isPbKey`
 * is the caller's SERVICE(c) / validateApiKey(...) === true: authentication
 * decides, the headers only name the run. A run header that is not a valid id,
 * or one that spells the unattributed prefix, is ignored (the write lands in the
 * day's unattributed run rather than nowhere).
 */
export function receiptOriginOf(request: Request, isPbKey: boolean, now: Date = new Date()): ReceiptOrigin | null {
  if (!isPbKey) return null
  const machine = headerName(request, MACHINE_HEADER) ?? 'unknown'
  const run = headerName(request, RUN_HEADER, RUN_ID_RX)
  if (run && !run.startsWith('unattributed:')) {
    return { runId: run, lane: headerName(request, LANE_HEADER) ?? 'unknown', machine, origin: 'pb', handled: false }
  }
  return { runId: `unattributed:${machine}:${ctDateString(now)}`, lane: 'unattributed', machine, origin: 'unattributed', handled: false }
}

/** env with RECEIPT_ORIGIN set from this request (or cleared). The one setter. */
export function withReceiptOrigin<E extends Env>(env: E, request: Request, isPbKey: boolean): E & ReceiptEnv {
  return { ...env, RECEIPT_ORIGIN: receiptOriginOf(request, isPbKey) }
}

export function originOf(env: Env): ReceiptOrigin | null {
  return (env as ReceiptEnv).RECEIPT_ORIGIN ?? null
}

/** Mark this request's PB writes as receipted at their own boundary (a route
 *  that answers every write itself, such as /api/mutations). */
export function markReceiptHandled(env: Env): void {
  const o = originOf(env)
  if (o) o.handled = true
}

export function lineId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `rcl_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function runId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `run_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** A SQL fragment and its binds: the "this write landed" predicate. */
export interface Gate { sql: string; vals: unknown[] }

const IDENT_RX = /^[a-z_][a-z0-9_]*$/

/** A column, quoted (a column named like a keyword must not break the write). */
function ident(name: string): string {
  if (!IDENT_RX.test(name)) throw new Error(`receipts: ${JSON.stringify(name)} is not a column name`)
  return `"${name}"`
}

/** A table, bare: viewer-db refuses a QUOTED scoped table in table position
 *  (quotedTableInTablePosition), and rewrites a bare one for a person viewer. */
function tableName(name: string): string {
  if (!IDENT_RX.test(name)) throw new Error(`receipts: ${JSON.stringify(name)} is not a table name`)
  return name
}

/** `json_object('a', "a", 'b', "b")` over the named columns. */
export function jsonObjectOf(fields: readonly string[]): string {
  return `json_object(${fields.map((f) => `'${f}', ${ident(f)}`).join(', ')})`
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

/** Where a change line's after-image and landed version come from. */
export type AfterSource =
  | { kind: 'row'; table: string; pk: Gate; fields: readonly string[]; versioned: boolean }
  | { kind: 'value'; after: Record<string, unknown> | null; version: Gate | null }

export interface ChangeLineSpec {
  actionId: string
  entityType: string
  entityId: string
  op: ReceiptOp
  before: Record<string, unknown> | null
  after: AfterSource
  summary: string
  sourceRef?: string | null
  inverseKind: InverseKind
  inverseReason?: string | null
  /** The line is written only when this holds (the write landed). */
  gate: Gate
  /** Override the line id (tests; an undo names its own line). */
  id?: string
  /** 'abort' for an undo line: a second undo of one line must fail the batch
   *  (idx_receipt_lines_one_undo), never be skipped while its write lands. */
  onConflict?: 'nothing' | 'abort'
}

/** The run row, created on first use, gated like the line so a write that did
 *  not land leaves no empty run behind. */
export function runUpsertStatement(db: D1Database, origin: ReceiptOrigin, gate: Gate, now: string): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO receipt_runs (id, lane, machine, started_at, origin, active_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE ${gate.sql}
     ON CONFLICT(id) DO NOTHING`,
  ).bind(origin.runId, origin.lane, origin.machine, now, origin.origin, now, ...gate.vals)
}

/** The INSERT for one change line. ON CONFLICT DO NOTHING: a replay of the same
 *  action on the same entity records nothing twice (idx_receipt_lines_one_per_action). */
export function changeLineStatement(db: D1Database, runIdValue: string, spec: ChangeLineSpec, now: string): D1PreparedStatement {
  const id = spec.id ?? lineId()
  const before = spec.before ? JSON.stringify(spec.before) : null
  let afterSql: string
  let versionSql: string
  let afterVals: unknown[]
  let versionVals: unknown[]
  if (spec.after.kind === 'row') {
    const a = spec.after
    afterSql = a.fields.length ? `(SELECT ${jsonObjectOf(a.fields)} FROM ${tableName(a.table)} WHERE ${a.pk.sql})` : 'NULL'
    afterVals = a.fields.length ? a.pk.vals : []
    versionSql = a.versioned ? `(SELECT seq FROM ${tableName(a.table)} WHERE ${a.pk.sql})` : 'NULL'
    versionVals = a.versioned ? a.pk.vals : []
  } else {
    afterSql = '?'
    afterVals = [spec.after.after ? JSON.stringify(spec.after.after) : null]
    versionSql = spec.after.version ? `(${spec.after.version.sql})` : 'NULL'
    versionVals = spec.after.version ? spec.after.version.vals : []
  }
  const reason = spec.inverseKind === 'none' || spec.inverseKind === 'revert_commit'
    ? clip(spec.inverseReason || 'no undo for this change', 500)
    : null
  return db.prepare(
    `INSERT INTO receipt_lines
       (id, run_id, action_id, kind, entity_type, entity_id, op, fields_before_json, fields_after_json,
        landed_version, source_ref, summary, inverse_kind, inverse_reason, created_at)
     SELECT ?, ?, ?, 'change', ?, ?, ?, ?, ${afterSql}, ${versionSql}, ?, ?, ?, ?, ?
      WHERE ${spec.gate.sql}${spec.onConflict === 'abort' ? '' : ' ON CONFLICT DO NOTHING'}`,
  ).bind(
    id, runIdValue, spec.actionId, spec.entityType, spec.entityId, spec.op, before,
    ...afterVals, ...versionVals,
    spec.sourceRef ?? null, clip(spec.summary, 500), spec.inverseKind, reason, now,
    ...spec.gate.vals,
  )
}

/**
 * The statements that record one change for a PB write: the run (created on
 * first use) and the line, both gated on `spec.gate`. Empty when the request
 * is not PB's, so a boundary can always spread the result into its batch.
 */
export function receiptStatements(env: Env, spec: ChangeLineSpec, now: string): D1PreparedStatement[] {
  const origin = originOf(env)
  if (!origin) return []
  origin.handled = true
  return [
    runUpsertStatement(env.DB, origin, spec.gate, now),
    changeLineStatement(env.DB, origin.runId, spec, now),
  ]
}

// ── helpers the write boundaries share ───────────────────────────────────────

/** Bookkeeping columns a receipt never lists as a change. */
export const RECEIPT_BOOKKEEPING = new Set(['updated_at', 'last_mutation_id', 'seq'])

/** Equal as stored values: D1 hands back what SQLite holds; a patch may carry
 *  1 for '1'. Conservative: anything unsure counts as changed. */
export function sameValue(a: unknown, b: unknown): boolean {
  const x = a === undefined ? null : a
  const y = b === undefined ? null : b
  if (x === y) return true
  if (x === null || y === null) return false
  if (typeof x === 'object' || typeof y === 'object') return JSON.stringify(x) === JSON.stringify(y)
  return String(x) === String(y)
}

/** The tables whose rows Undo can patch back or tombstone (the tables
 *  applyMutation takes). Everything else PB writes is PB's own record. */
export const UNDOABLE_TABLES = new Set(['tasks', 'projects', 'products'])

const NOUN: Record<string, string> = { tasks: 'task', projects: 'project', products: 'product', links: 'link' }

export function entityLabel(table: string, row: Record<string, unknown> | null | undefined, id: string): string {
  const name = row && (row.title ?? row.name ?? row.short_title)
  const noun = NOUN[table] ?? table
  return typeof name === 'string' && name.trim() ? `${noun} "${clip(name.trim(), 120)}"` : `${noun} ${id}`
}

// ── the undo half: what each inverse writes besides the domain write ────────

/** The undo's own line + the stamp on the line it undoes, both gated on `gate`
 *  (the inverse write landed). The undo line's source_ref is 'undo:<line id>',
 *  so idx_receipt_lines_one_undo refuses a second undo of the same line, and
 *  trg_receipt_lines_immutable refuses a second stamp. */
export function undoStatements(
  db: D1Database,
  args: {
    undoLineId: string; line: ReceiptLineRow; summary: string; op: ReceiptOp
    fieldsBefore: Record<string, unknown> | null; after: AfterSource; gate: Gate; now: string
  },
): D1PreparedStatement[] {
  const { line } = args
  return [
    changeLineStatement(db, line.run_id, {
      id: args.undoLineId,
      actionId: args.undoLineId,
      entityType: line.entity_type ?? 'unknown',
      entityId: line.entity_id ?? 'unknown',
      op: args.op,
      before: args.fieldsBefore,
      after: args.after,
      summary: args.summary,
      sourceRef: `undo:${line.id}`,
      inverseKind: 'none',
      inverseReason: 'an Undo is not undone; change the item itself',
      gate: args.gate,
      onConflict: 'abort',
    }, args.now),
    db.prepare(
      `UPDATE receipt_lines SET undone_at = ?, undo_line_id = ?
        WHERE id = ? AND undone_at IS NULL AND EXISTS (SELECT 1 FROM receipt_lines WHERE id = ?)`,
    ).bind(args.now, args.undoLineId, line.id, args.undoLineId),
  ]
}

export interface ReceiptLineRow {
  id: string; run_id: string; action_id: string; kind: LineKind
  entity_type: string | null; entity_id: string | null; op: string | null
  fields_before_json: string | null; fields_after_json: string | null; landed_version: number | null
  source_ref: string | null; summary: string; inverse_kind: InverseKind; inverse_reason: string | null
  undone_at: string | null; undo_line_id: string | null; created_at: string
}

export const LINE_COLS = 'id, run_id, action_id, kind, entity_type, entity_id, op, fields_before_json, fields_after_json, ' +
  'landed_version, source_ref, summary, inverse_kind, inverse_reason, undone_at, undo_line_id, created_at'

/** hide_entry's write, gated on the undo line existing (the undo line is
 *  inserted first, under the precondition; this then matches only if it did). */
export function hideEntryStatement(db: D1Database, entryId: string, undoLineId: string, by: string, now: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE activity_entries SET hidden_at = ?, hidden_by = ?
      WHERE id = ? AND hidden_at IS NULL AND EXISTS (SELECT 1 FROM receipt_lines WHERE id = ?)`,
  ).bind(now, by, entryId, undoLineId)
}

// ── row writes (mutations.ts commitRowWrite) ─────────────────────────────────

export interface RowChange {
  table: string
  recordId: string
  mutationId: string
  op: 'update' | 'delete'
  /** The CAS pre-image (readCanonical: private columns already stripped). */
  current: Record<string, unknown>
  /** The columns the write sets (applyPatch's `fields`, co-flips included). */
  fields: readonly string[]
  /** The caller's patch, to drop fields it sets to the value already there. */
  patch?: Record<string, unknown> | null
  /** The table's PK predicate (pkWhere). */
  pk: Gate
  /** commitRowWrite's landed predicate. */
  landed: Gate
  summaryPrefix?: string
}

/** The columns a row write actually changes, as a receipt lists them. A column
 *  the pre-image does not carry (a private column) is not listed: it cannot be
 *  shown or restored. */
export function changedFields(c: Pick<RowChange, 'current' | 'fields' | 'patch'>): string[] {
  const out: string[] = []
  for (const f of c.fields) {
    if (RECEIPT_BOOKKEEPING.has(f) || !(f in c.current) || out.includes(f)) continue
    if (c.patch && Object.prototype.hasOwnProperty.call(c.patch, f) && sameValue(c.current[f], c.patch[f])) continue
    out.push(f)
  }
  return out
}

function rowInverse(table: string, op: 'update' | 'delete', current: Record<string, unknown>): { kind: InverseKind; reason?: string } {
  if (!UNDOABLE_TABLES.has(table)) return { kind: 'none', reason: `${table} rows are PB's own record; no Undo on the Hub` }
  if (!('seq' in current)) return { kind: 'none', reason: `${table} has no version column to check an Undo against` }
  if (op === 'delete' && table !== 'tasks') {
    return { kind: 'none', reason: `deleting a ${NOUN[table] ?? table} cascades its children; restore it by hand` }
  }
  return { kind: 'patch' }
}

/** Receipt statements for one landed row update / delete; [] when the request
 *  is not PB's or the write changes nothing a receipt would list. */
export function rowChangeStatements(env: Env, c: RowChange, now: string): D1PreparedStatement[] {
  if (!originOf(env)) return []
  markReceiptHandled(env) // a write that changes nothing is still accounted for
  const fields = changedFields(c)
  if (!fields.length) return []
  const before: Record<string, unknown> = {}
  for (const f of fields) before[f] = c.current[f] ?? null
  const inv = rowInverse(c.table, c.op, c.current)
  const label = entityLabel(c.table, c.current, c.recordId)
  const verb = c.op === 'delete' ? 'Deleted' : 'Changed'
  const tail = c.op === 'delete'
    ? (c.table === 'tasks' ? ' (its comments and notifications went with it; Undo restores the task only)' : '')
    : `: ${fields.join(', ')}`
  return receiptStatements(env, {
    actionId: c.mutationId,
    entityType: c.table,
    entityId: c.recordId,
    op: c.op,
    before,
    after: { kind: 'row', table: c.table, pk: c.pk, fields, versioned: 'seq' in c.current },
    summary: `${c.summaryPrefix ?? ''}${verb} ${label}${tail}`,
    inverseKind: inv.kind,
    inverseReason: inv.reason ?? null,
    gate: c.landed,
  }, now)
}

/** The Undo of a 'patch' line: the patch that puts the recorded fields back,
 *  limited to the fields the table accepts on the wire (a co-flipped column
 *  such as deleted_at follows its driver back). */
export function inversePatch(line: ReceiptLineRow, accepted: ReadonlySet<string>): Record<string, unknown> {
  const before = JSON.parse(line.fields_before_json ?? '{}') as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(before)) if (accepted.has(k)) out[k] = v
  // A task deleted outright (op=delete) comes back by status; the co-flip
  // clears deleted_at.
  if (line.op === 'delete' && line.entity_type === 'tasks' && 'deleted_at' in before && !('status' in out)) {
    out.status = before.status ?? 'todo'
  }
  return out
}

// ── inserts (mutations.ts applyInsert) ───────────────────────────────────────

/** Receipt statements for one genuine insert (never a dedup adoption: that
 *  path returns before the INSERT and records nothing). */
export function insertStatements(
  env: Env,
  c: { table: string; recordId: string; mutationId: string; payload: Record<string, unknown>; pk: Gate; landed: Gate },
  now: string,
): D1PreparedStatement[] {
  if (!originOf(env)) return []
  const priv = TABLE_PRIVATE_COLS[c.table] ?? new Set<string>()
  const fields = Object.keys(c.payload).filter((f) => IDENT_RX.test(f) && !priv.has(f) && !RECEIPT_BOOKKEEPING.has(f))
  const tombstone = c.table === 'tasks'
  return receiptStatements(env, {
    actionId: c.mutationId,
    entityType: c.table,
    entityId: c.recordId,
    op: 'insert',
    before: null,
    after: { kind: 'row', table: c.table, pk: c.pk, fields, versioned: tombstone },
    summary: `Created ${entityLabel(c.table, c.payload, c.recordId)}`,
    inverseKind: tombstone ? 'tombstone' : 'none',
    inverseReason: tombstone ? null : `no Undo for a new ${NOUN[c.table] ?? c.table} yet; delete it by hand`,
    gate: c.landed,
  }, now)
}

// ── derived project moves (mutations.ts advanceProjectMovement / OwnMovement) ─

/**
 * The line for a project freshness stamp a task or project write caused,
 * written BEFORE the stamp in the stamp's own batch, so it needs no pre-read:
 * the before-image is the row as the statement finds it, and the after-image
 * is the same CASE the stamp applies. Filed under the causing mutation's
 * action id. Written only when a stamped column will actually move (the MAX
 * CASE often leaves it), and, when `gate` is given, only when the causing
 * write landed. No Undo: it is derived; undo the change that caused it.
 *
 * Returns [] for a non-PB request; the caller then runs the stamp alone.
 */
export function projectMoveStatements(
  env: Env,
  c: { mutationId: string; projectId: string; tsUtc: string; clearsStale: boolean; cause: string; gate?: Gate },
  now: string,
): D1PreparedStatement[] {
  const origin = originOf(env)
  if (!origin) return []
  origin.handled = true
  const lmm = 'last_meaningful_movement'
  const nextLmm = `CASE WHEN ${lmm} IS NULL OR ${lmm} < ? THEN ? ELSE ${lmm} END`
  const before = c.clearsStale
    ? `json_object('${lmm}', ${lmm}, 'stale_active_since', stale_active_since)`
    : `json_object('${lmm}', ${lmm})`
  const after = c.clearsStale
    ? `json_object('${lmm}', ${nextLmm}, 'stale_active_since', NULL)`
    : `json_object('${lmm}', ${nextLmm})`
  const moves = `(${lmm} IS NULL OR ${lmm} < ?${c.clearsStale ? ' OR stale_active_since IS NOT NULL' : ''})`
  const extra = c.gate ? ` AND ${c.gate.sql}` : ''
  const extraVals = c.gate ? c.gate.vals : []
  const willMove: Gate = {
    sql: `EXISTS (SELECT 1 FROM projects WHERE id = ? AND ${moves})${extra}`,
    vals: [c.projectId, c.tsUtc, ...extraVals],
  }
  return [
    runUpsertStatement(env.DB, origin, willMove, now),
    env.DB.prepare(
      `INSERT INTO receipt_lines
         (id, run_id, action_id, kind, entity_type, entity_id, op, fields_before_json, fields_after_json,
          landed_version, source_ref, summary, inverse_kind, inverse_reason, created_at)
       SELECT ?, ?, ?, 'change', 'projects', id, 'update', ${before}, ${after}, NULL,
              'derived:project_movement',
              substr('Marked project "' || COALESCE(title, id) || '" as moving (' || ? || ')', 1, 500),
              'none', 'derived from the change above it; undo that change instead', ?
         FROM projects WHERE id = ? AND ${moves}${extra}
       ON CONFLICT DO NOTHING`,
    ).bind(lineId(), origin.runId, c.mutationId, c.tsUtc, c.tsUtc, c.cause, now, c.projectId, c.tsUtc, ...extraVals),
  ]
}

// ── the tombstone's "nobody worked it" predicate ─────────────────────────────

/**
 * True while a created task is still only what PB made: no live comment or
 * update on it, no live child task, no link made by anyone after the create
 * (a link born with the create carries the create's mutation id). Undo puts
 * this in the delete's own WHERE (commitRowWrite guardWhere), so a comment
 * that lands between the check and the write stops the write itself.
 */
export function tombstoneUnworked(recordId: string, createActionId: string): Gate {
  return {
    sql: `NOT EXISTS (SELECT 1 FROM activity_entries WHERE entity_type = 'task' AND entity_id = ?
                        AND kind IN ('comment', 'update') AND hidden_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE parent_id = ? AND deleted_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM links WHERE owner_table = 'tasks' AND owner_id = ? AND deleted_at IS NULL
                            AND (last_mutation_id IS NULL OR last_mutation_id <> ?))`,
    vals: [recordId, recordId, recordId, createActionId],
  }
}

// ── the catch-all: a PB write no boundary receipted ──────────────────────────

// ai-requests/queue is the listener's polling READ that happens to be a POST;
// without the skip every poll wrote a line.
const CATCH_ALL_SKIP = /^\/api\/(receipts|mutations)(\/|$)|^\/api\/ai-requests\/queue$/

/**
 * One summary line for a PB-key write request that no receipt boundary saw:
 * {kind 'change', op 'external', summary '<METHOD> <route pattern>', inverse
 * 'none'}. Called by the /api/* middleware after the handler. Not for reads,
 * failed requests, the receipt routes themselves, or /api/mutations (which
 * answers every write itself). Returns [] when nothing is owed.
 *
 * This runs AFTER the handler's own writes committed, so it cannot be atomic
 * with them: Level 2. A failure here is logged, the write stands.
 */
export function catchAllStatements(env: Env, method: string, pattern: string, status: number, now: string): D1PreparedStatement[] {
  const origin = originOf(env)
  if (!origin || origin.handled) return []
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return []
  if (status < 200 || status >= 300) return []
  if (CATCH_ALL_SKIP.test(pattern)) return []
  origin.handled = true
  const id = lineId()
  const always: Gate = { sql: '1 = 1', vals: [] }
  return [
    runUpsertStatement(env.DB, origin, always, now),
    env.DB.prepare(
      `INSERT INTO receipt_lines (id, run_id, action_id, kind, op, summary, inverse_kind, inverse_reason, created_at)
       VALUES (?, ?, ?, 'change', 'external', ?, 'none', 'route not individually receipted', ?)`,
    ).bind(id, origin.runId, `request:${id}`, clip(`${method} ${pattern}`, 500), now),
  ]
}

export async function receiptCatchAll(env: Env, method: string, pattern: string, status: number): Promise<void> {
  const stmts = catchAllStatements(env, method, pattern, status, nowIso())
  if (!stmts.length) return
  try {
    await env.DB.batch(stmts)
  } catch (e) {
    // Enrichment that degrades WITH a surface (ethos #3 shape 3): the write
    // already committed; the missing summary line is logged here.
    console.error('receipts: catch-all line failed', method, pattern, (e as Error).message)
  }
}

const nowIso = () => nowInstant()

