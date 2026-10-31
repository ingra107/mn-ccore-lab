// receipts.ts -- the routes over what PB changed (schema-v154).
//
// Nick, 2026-10-30: "instead of me having to do like the process task
// everyday". v1 contract: PB Context/Decisions/2026-10-30-receipts-and-
// headless-process.md. The Hub writes every change line itself, in the batch
// of the write (api/lib/receipts.ts); these routes are the rest:
//
//   POST /api/receipts/runs                    PB key or Nick: open a run
//   POST /api/receipts/runs/:id/finish         PB key or Nick: close it
//   POST /api/receipts/runs/:id/lines          PB key or Nick: an external op,
//                                              a failure, an item left for Nick
//   POST /api/receipts/claims                  PB key or Nick: claim a source
//   POST /api/receipts/claims/:key/settle      PB key or Nick: settle a claim
//   GET  /api/receipts/overnight               Nick only: runs + lines
//   POST /api/receipts/lines/:id/undo          Nick only: one line's Undo
//   POST /api/receipts/seen                    Nick only: mark runs seen
//
// "Nick only" is his signed-in session (site admin with the PI flag), not the
// PB key: PB never undoes or acknowledges its own receipt. The tables are
// Nick-only one layer down too (table-scope.ts nickOnly).

import type { Context } from 'hono'
import type { Env } from '../types'
import type { AuthUser } from '../helpers'
import { json, error } from '../helpers'
import { defineRoute } from '../lib/route-dsl'
import { isSiteAdmin } from '../lib/viewer-db'
import { nowInstant } from '../lib/time'
import {
  LINE_KINDS, CLAIM_STATES, LINE_COLS, lineId, runId as mintRunId, undoStatements, hideEntryStatement,
  inversePatch, tombstoneUnworked, type ReceiptLineRow, type InverseKind, type LineKind, type Gate,
} from '../lib/receipts'
import { applyReceiptUndo, hashTouched, wireFields, RECEIPT_UNDO_REFUSED, type UndoGuard } from './mutations'
import { handleUndoCurrentDraft } from './current-draft'

const NAME_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/
const RUN_ID_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
const SOURCE_KEY_RX = /^(comment|question|inbox|file):[^\s]{1,290}$/
const DEFAULT_LEASE_S = 900
const MAX_LEASE_S = 3600
const RUNS_PAGE = 20
const RUNS_PAGE_MAX = 100
const LINES_PER_RUN = 50
const REVERSIBLE: ReadonlySet<InverseKind> = new Set(['patch', 'tombstone', 'hide_entry', 'current_draft_undo'])

function refuse(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, code, ...extra }, status)
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null

function parseJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null
  try { return JSON.parse(s) as Record<string, unknown> } catch { return null }
}

/** A receipt line as every route returns it. */
export function lineOut(l: ReceiptLineRow, seenAt: string | null = null): Record<string, unknown> {
  return {
    id: l.id,
    run_id: l.run_id,
    action_id: l.action_id,
    kind: l.kind,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    op: l.op,
    fields_before: parseJson(l.fields_before_json),
    fields_after: parseJson(l.fields_after_json),
    landed_version: l.landed_version,
    source_ref: l.source_ref,
    summary: l.summary,
    inverse_kind: l.inverse_kind,
    inverse_reason: l.inverse_reason,
    undoable: REVERSIBLE.has(l.inverse_kind) && !l.undone_at,
    // seen_at is the run's high-water mark: a line written after the tap is new.
    seen: seenAt !== null && l.created_at <= seenAt,
    undone_at: l.undone_at,
    undo_line_id: l.undo_line_id,
    created_at: l.created_at,
  }
}

async function readLine(env: Env, id: string): Promise<ReceiptLineRow | null> {
  return await env.DB.prepare(`SELECT ${LINE_COLS} FROM receipt_lines WHERE id = ?`).bind(id).first<ReceiptLineRow>()
}

// ── runs ─────────────────────────────────────────────────────────────────────

// POST /api/receipts/runs  { lane, machine, run_id? }
export async function handleStartRun(request: Request, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const lane = typeof body.lane === 'string' && NAME_RX.test(body.lane) ? body.lane : null
  const machine = typeof body.machine === 'string' && NAME_RX.test(body.machine) ? body.machine : null
  if (!lane) return error('lane is required: 1-80 of [A-Za-z0-9_.:-]', 400)
  if (!machine) return error('machine is required: 1-80 of [A-Za-z0-9_.:-]', 400)
  let id = mintRunId()
  if (body.run_id !== undefined) {
    if (typeof body.run_id !== 'string' || !RUN_ID_RX.test(body.run_id) || body.run_id.startsWith('unattributed:')) {
      return error('run_id must be 1-160 of [A-Za-z0-9_.:-] and not start with unattributed:', 400)
    }
    id = body.run_id
  }
  const now = nowInstant()
  await env.DB.prepare(
    `INSERT INTO receipt_runs (id, lane, machine, started_at, origin, active_at) VALUES (?, ?, ?, ?, 'pb', ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(id, lane, machine, now, now).run()
  // A reused run_id (a lane with a stable id) reopens its run: open again,
  // and active now, so the 90-day prune keeps it while it still runs.
  await env.DB.prepare(
    `UPDATE receipt_runs SET finished_at = NULL, active_at = ? WHERE id = ? AND lane = ? AND machine = ? AND active_at < ?`,
  ).bind(now, id, lane, machine, now).run()
  const row = await env.DB.prepare('SELECT id, lane, machine, started_at FROM receipt_runs WHERE id = ?')
    .bind(id).first<{ id: string; lane: string; machine: string; started_at: string }>()
  if (!row) return error('run not recorded', 500)
  if (row.lane !== lane || row.machine !== machine) {
    return refuse('run_exists', 'That run_id names a run on another lane or machine', 409, { run_id: id })
  }
  return json({ run_id: row.id, lane: row.lane, machine: row.machine, started_at: row.started_at }, row.started_at === now ? 201 : 200)
}

// POST /api/receipts/runs/:id/finish
export async function handleFinishRun(id: string, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const row = await env.DB.prepare(
    `UPDATE receipt_runs SET finished_at = COALESCE(finished_at, ?), active_at = MAX(active_at, ?)
      WHERE id = ? AND origin = 'pb'
     RETURNING id, finished_at`,
  ).bind(nowInstant(), nowInstant(), id).first<{ id: string; finished_at: string }>()
  if (!row) return error('Run not found (an unattributed run never finishes)', 404)
  return json({ run_id: row.id, finished_at: row.finished_at })
}

// POST /api/receipts/runs/:id/lines
//   { kind, summary, source_ref?, inverse_kind?, inverse_reason?, action_id?, op?, entity_type?, entity_id? }
// For what the Hub cannot see: an external op (a file move, a commit), a
// failure, an item left for Nick. A Hub-side change line is never posted.
export async function handlePostLine(runIdParam: string, request: Request, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const kind = body.kind as LineKind
  if (!LINE_KINDS.includes(kind)) return error(`kind must be one of ${LINE_KINDS.join(', ')}`, 400)
  const summary = str(body.summary, 500)
  if (!summary) return error('summary is required (1-500 characters)', 400)
  const sourceRef = body.source_ref == null ? null : str(body.source_ref, 500)
  if (body.source_ref != null && !sourceRef) return error('source_ref must be 1-500 characters', 400)
  if (sourceRef && (sourceRef.startsWith('undo:') || sourceRef.startsWith('current_draft_change:') || sourceRef.startsWith('derived:'))) {
    return error('source_ref prefixes undo:, current_draft_change: and derived: are the Hub\'s own', 400)
  }
  const op = kind === 'change' ? 'external' : null
  if (body.op !== undefined && body.op !== op) {
    return error(kind === 'change' ? 'a posted change line is op external; the Hub records its own writes' : 'a failure or left_for_nick line has no op', 400)
  }
  const inverseKind = (body.inverse_kind ?? 'none') as InverseKind
  if (inverseKind !== 'none' && !(kind === 'change' && inverseKind === 'revert_commit')) {
    return error('inverse_kind is none, or revert_commit on an external change', 400)
  }
  const inverseReason = str(body.inverse_reason, 500) ??
    (kind === 'change' ? null : kind === 'failure' ? 'a failure; nothing was changed' : 'left for Nick; nothing was changed')
  if (!inverseReason) return error('inverse_reason is required on a change line', 400)
  const entityType = body.entity_type == null ? null : str(body.entity_type, 80)
  const entityId = body.entity_id == null ? null : str(body.entity_id, 300)
  if ((entityType === null) !== (entityId === null)) return error('entity_type and entity_id travel together', 400)
  const id = lineId()
  const actionId = body.action_id == null ? id : str(body.action_id, 200)
  if (!actionId) return error('action_id must be 1-200 characters', 400)

  const run = await env.DB.prepare('SELECT id FROM receipt_runs WHERE id = ?').bind(runIdParam).first<{ id: string }>()
  if (!run) return error('Run not found', 404)
  await env.DB.prepare(
    `INSERT INTO receipt_lines (id, run_id, action_id, kind, entity_type, entity_id, op, source_ref, summary,
                                inverse_kind, inverse_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  ).bind(id, runIdParam, actionId, kind, entityType, entityId, op, sourceRef, summary, inverseKind, inverseReason, nowInstant()).run()
  const landed = await env.DB.prepare(
    `SELECT id FROM receipt_lines WHERE action_id = ? AND kind = ? AND COALESCE(entity_type, '') = ? AND COALESCE(entity_id, '') = ?
       AND COALESCE(op, '') = ? AND COALESCE(source_ref, '') = ?`,
  ).bind(actionId, kind, entityType ?? '', entityId ?? '', op ?? '', sourceRef ?? '').first<{ id: string }>()
  if (!landed) return error('line not recorded', 500)
  return json({ line_id: landed.id, replayed: landed.id !== id }, landed.id === id ? 201 : 200)
}

// ── claims ───────────────────────────────────────────────────────────────────

type ClaimRow = { source_key: string; run_id: string; claimed_at: string; lease_until: string | null; state: string; generation: number }

const claimOut = (c: ClaimRow) => ({
  source_key: c.source_key, run_id: c.run_id, state: c.state, generation: c.generation,
  claimed_at: c.claimed_at, lease_until: c.lease_until,
})

// POST /api/receipts/claims  { source_key, run_id, lease_seconds? }
// One statement decides: a new key is claimed (generation 1); a failed claim,
// or a claimed one whose lease ran out, is re-claimed (generation + 1); a live
// claim, a done one and one left for Nick are held (409).
export async function handleClaim(request: Request, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const key = typeof body.source_key === 'string' && SOURCE_KEY_RX.test(body.source_key) ? body.source_key : null
  if (!key) return error('source_key must be comment:<id>:<rev> | question:<id>:<rev> | inbox:<id> | file:<machine>:<sha256>', 400)
  const run = typeof body.run_id === 'string' ? body.run_id : ''
  const lease = body.lease_seconds === undefined ? DEFAULT_LEASE_S : Number(body.lease_seconds)
  if (!Number.isInteger(lease) || lease < 1 || lease > MAX_LEASE_S) return error(`lease_seconds must be 1-${MAX_LEASE_S}`, 400)
  const known = await env.DB.prepare('SELECT id FROM receipt_runs WHERE id = ?').bind(run).first<{ id: string }>()
  if (!known) return error('run_id names no run; open one with POST /api/receipts/runs', 400)
  const now = new Date()
  const claimedAt = now.toISOString()
  const leaseUntil = new Date(now.getTime() + lease * 1000).toISOString()
  // Two single statements, each atomic: the insert claims a new key; the
  // takeover moves a failed or lapsed claim on. Not one upsert: viewer-db
  // refuses ON CONFLICT DO UPDATE on a scoped table for Nick's session.
  const cols = 'source_key, run_id, claimed_at, lease_until, state, generation'
  const won = await env.DB.prepare(
    `INSERT INTO receipt_claims (${cols}) VALUES (?, ?, ?, ?, 'claimed', 1)
     ON CONFLICT(source_key) DO NOTHING
     RETURNING ${cols}`,
  ).bind(key, run, claimedAt, leaseUntil).first<ClaimRow>()
    ?? await env.DB.prepare(
      `UPDATE receipt_claims SET run_id = ?, claimed_at = ?, lease_until = ?, state = 'claimed', generation = generation + 1
        WHERE source_key = ? AND (state = 'failed' OR (state = 'claimed' AND lease_until < ?))
       RETURNING ${cols}`,
    ).bind(run, claimedAt, leaseUntil, key, claimedAt).first<ClaimRow>()
  if (won) return json(claimOut(won), 201)
  const held = await env.DB.prepare(
    'SELECT source_key, run_id, claimed_at, lease_until, state, generation FROM receipt_claims WHERE source_key = ?',
  ).bind(key).first<ClaimRow>()
  return refuse('held', held?.state === 'claimed' ? 'Another run holds this source' : `This source is ${held?.state ?? 'held'}`,
    409, held ? claimOut(held) : {})
}

// GET /api/receipts/claims?keys=k1,k2  (or repeated ?key=k)
// The claims that exist for these source keys; absent keys are omitted. A key
// holding a comma must use the repeated key= form (keys= splits on commas);
// ':' and '/' need nothing. At most CLAIM_LOOKUP_MAX distinct keys. lane and
// machine come from the claim's run (null once the run is pruned at 90 days).
// updated_at is claimed_at: a claim's row records when it was last claimed or
// taken over, and settling it records no time. Read-only.
export const CLAIM_LOOKUP_MAX = 200
const D1_BIND_CHUNK = 90 // D1 allows 100 bound parameters per statement
export async function handleGetClaims(url: URL, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const keys = [...new Set([
    ...url.searchParams.getAll('keys').flatMap((v) => v.split(',')),
    ...url.searchParams.getAll('key'),
  ].map((k) => k.trim()).filter(Boolean))]
  if (keys.length === 0) return error('keys required', 400)
  if (keys.length > CLAIM_LOOKUP_MAX) return error(`at most ${CLAIM_LOOKUP_MAX} keys`, 400)
  const stmts: D1PreparedStatement[] = []
  for (let i = 0; i < keys.length; i += D1_BIND_CHUNK) {
    const chunk = keys.slice(i, i + D1_BIND_CHUNK)
    stmts.push(env.DB.prepare(
      `SELECT c.source_key AS key, c.state, c.generation, r.lane, r.machine, c.claimed_at AS updated_at
       FROM receipt_claims c LEFT JOIN receipt_runs r ON r.id = c.run_id
       WHERE c.source_key IN (${chunk.map(() => '?').join(', ')})`,
    ).bind(...chunk))
  }
  const results = await env.DB.batch(stmts)
  const byKey = new Map<string, Record<string, unknown>>()
  for (const r of results) for (const row of (r.results ?? []) as Record<string, unknown>[]) byKey.set(String(row.key), row)
  return json({ data: keys.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!) })
}

// POST /api/receipts/claims/:key/settle  { state: done|failed|left, generation }
// Fenced on the generation: a run whose claim was taken over cannot settle it.
export async function handleSettleClaim(key: string, request: Request, env: Env, allowed: boolean): Promise<Response> {
  if (!allowed) return error('Forbidden', 403)
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const state = body.state as string
  if (!CLAIM_STATES.includes(state as never) || state === 'claimed') return error('state must be done, failed or left', 400)
  const generation = Number(body.generation)
  if (!Number.isInteger(generation) || generation < 1) return error('generation is required', 400)
  const row = await env.DB.prepare(
    `UPDATE receipt_claims SET state = ?, lease_until = NULL
      WHERE source_key = ? AND generation = ? AND state = 'claimed'
     RETURNING source_key, run_id, claimed_at, lease_until, state, generation`,
  ).bind(state, key, generation).first<ClaimRow>()
  if (row) return json(claimOut(row))
  const cur = await env.DB.prepare(
    'SELECT source_key, run_id, claimed_at, lease_until, state, generation FROM receipt_claims WHERE source_key = ?',
  ).bind(key).first<ClaimRow>()
  if (!cur) return error('Claim not found', 404)
  return refuse('stale_generation', 'This claim was settled or taken over since', 409, claimOut(cur))
}

// ── the overnight read (Nick only) ───────────────────────────────────────────

type RunRow = { id: string; lane: string; machine: string; origin: string; started_at: string; finished_at: string | null; seen_at: string | null }
type Counts = { change: number; failure: number; left_for_nick: number; undone: number; unseen: number }
const zero = (): Counts => ({ change: 0, failure: 0, left_for_nick: 0, undone: 0, unseen: 0 })

// A line is unseen when it was written after its run's seen_at.
const UNSEEN = `l.created_at > COALESCE(r.seen_at, '')`

// GET /api/receipts/overnight?since=&lane=&unseen=1&cursor=&limit=  -> runs page
// GET /api/receipts/overnight?run=<id>&after=<line id>        -> more lines of one run
export async function handleOvernight(url: URL, env: Env, isNick: boolean): Promise<Response> {
  if (!isNick) return error('Forbidden', 403)
  const runParam = url.searchParams.get('run')
  if (runParam) return linesPage(env, runParam, url.searchParams.get('after'))

  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 24 * 3600 * 1000)
  if (Number.isNaN(since.getTime())) return error('since must be an ISO timestamp', 400)
  const sinceIso = since.toISOString()
  const lane = url.searchParams.get('lane')
  const unseenOnly = url.searchParams.get('unseen') === '1' ? 1 : null
  const limitN = Number(url.searchParams.get('limit') ?? RUNS_PAGE)
  const limit = Number.isInteger(limitN) && limitN >= 1 ? Math.min(limitN, RUNS_PAGE_MAX) : RUNS_PAGE
  const cursor = url.searchParams.get('cursor')
  let cStarted: string | null = null
  let cId: string | null = null
  if (cursor) {
    const i = cursor.indexOf('|')
    if (i < 1) return error('cursor is not one this route issued', 400)
    cStarted = cursor.slice(0, i)
    cId = cursor.slice(i + 1)
  }

  // A run is in the window when it started in it or wrote a line in it (the
  // day's unattributed run starts at its first write and keeps collecting).
  const inWindow = `(r.started_at >= ? OR EXISTS (SELECT 1 FROM receipt_lines l WHERE l.run_id = r.id AND l.created_at >= ?))`
  const runs = (await env.DB.prepare(
    `SELECT r.id, r.lane, r.machine, r.origin, r.started_at, r.finished_at, r.seen_at FROM receipt_runs r
      WHERE ${inWindow}
        AND (? IS NULL OR r.lane = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM receipt_lines l WHERE l.run_id = r.id AND ${UNSEEN}))
        AND (? IS NULL OR r.started_at < ? OR (r.started_at = ? AND r.id < ?))
      ORDER BY r.started_at DESC, r.id DESC
      LIMIT ?`,
  ).bind(sinceIso, sinceIso, lane, lane, unseenOnly, cStarted, cStarted, cStarted, cId, limit + 1).all<RunRow>()).results ?? []
  const page = runs.slice(0, limit)
  const nextCursor = runs.length > limit ? `${page[page.length - 1].started_at}|${page[page.length - 1].id}` : null

  const counts = new Map<string, Counts>()
  const lines = new Map<string, ReceiptLineRow[]>()
  if (page.length) {
    const ids = page.map((r) => r.id)
    const marks = ids.map(() => '?').join(', ')
    const agg = (await env.DB.prepare(
      `SELECT l.run_id AS run_id, l.kind AS kind, COUNT(*) AS n, SUM(l.undone_at IS NOT NULL) AS undone,
              SUM(${UNSEEN}) AS unseen
         FROM receipt_lines l JOIN receipt_runs r ON r.id = l.run_id
        WHERE l.run_id IN (${marks}) GROUP BY l.run_id, l.kind`,
    ).bind(...ids).all<{ run_id: string; kind: LineKind; n: number; undone: number; unseen: number }>()).results ?? []
    for (const a of agg) {
      const c = counts.get(a.run_id) ?? zero()
      c[a.kind] = a.n
      c.undone += a.undone ?? 0
      c.unseen += a.unseen ?? 0
      counts.set(a.run_id, c)
    }
    // Each run's first LINES_PER_RUN lines, in the order they happened.
    const rows = (await env.DB.prepare(
      `SELECT ${LINE_COLS} FROM (
         SELECT l.*, ROW_NUMBER() OVER (PARTITION BY l.run_id ORDER BY l.created_at, l.id) AS rn
           FROM receipt_lines l WHERE l.run_id IN (${marks})
       ) WHERE rn <= ? ORDER BY run_id, created_at, id`,
    ).bind(...ids, LINES_PER_RUN).all<ReceiptLineRow>()).results ?? []
    for (const l of rows) lines.set(l.run_id, [...(lines.get(l.run_id) ?? []), l])
  }

  const lanes = (await env.DB.prepare(
    `SELECT r.lane AS lane, COUNT(DISTINCT r.id) AS runs,
            COALESCE(SUM(l.kind = 'change'), 0) AS changes,
            COALESCE(SUM(l.kind = 'failure'), 0) AS failures,
            COALESCE(SUM(l.kind = 'left_for_nick'), 0) AS left_for_nick,
            COALESCE(SUM(${UNSEEN}), 0) AS unseen_lines,
            COUNT(DISTINCT CASE WHEN ${UNSEEN} THEN r.id END) AS unseen_runs
       FROM receipt_runs r LEFT JOIN receipt_lines l ON l.run_id = r.id
      WHERE ${inWindow}
      GROUP BY r.lane ORDER BY r.lane`,
  ).bind(sinceIso, sinceIso).all<Record<string, unknown>>()).results ?? []

  return json({
    since: sinceIso,
    lane,
    runs: page.map((r) => {
      const c = counts.get(r.id) ?? zero()
      const ls = lines.get(r.id) ?? []
      const total = c.change + c.failure + c.left_for_nick
      return {
        run_id: r.id, lane: r.lane, machine: r.machine, origin: r.origin,
        started_at: r.started_at, finished_at: r.finished_at, seen_at: r.seen_at,
        state: c.failure > 0 ? 'failed' : (r.origin === 'pb' && !r.finished_at ? 'open' : 'ok'),
        counts: c,
        lines: ls.map((l) => lineOut(l, r.seen_at)),
        more_lines: total > ls.length,
        next_after: total > ls.length ? ls[ls.length - 1]?.id ?? null : null,
      }
    }),
    lanes,
    next_cursor: nextCursor,
  })
}

async function linesPage(env: Env, run: string, after: string | null): Promise<Response> {
  const r = await env.DB.prepare('SELECT id, seen_at FROM receipt_runs WHERE id = ?').bind(run).first<{ id: string; seen_at: string | null }>()
  if (!r) return error('Run not found', 404)
  let anchor: { created_at: string; id: string } | null = null
  if (after) {
    anchor = await env.DB.prepare('SELECT created_at, id FROM receipt_lines WHERE id = ? AND run_id = ?')
      .bind(after, run).first<{ created_at: string; id: string }>()
    if (!anchor) return error('after names no line of this run', 400)
  }
  const rows = (await env.DB.prepare(
    `SELECT ${LINE_COLS} FROM receipt_lines WHERE run_id = ?
       AND (? IS NULL OR created_at > ? OR (created_at = ? AND id > ?))
     ORDER BY created_at, id LIMIT ?`,
  ).bind(run, anchor?.id ?? null, anchor?.created_at ?? null, anchor?.created_at ?? null, anchor?.id ?? null, LINES_PER_RUN + 1)
    .all<ReceiptLineRow>()).results ?? []
  const page = rows.slice(0, LINES_PER_RUN)
  return json({
    run_id: run,
    lines: page.map((l) => lineOut(l, r.seen_at)),
    next_after: rows.length > LINES_PER_RUN ? page[page.length - 1].id : null,
  })
}

// POST /api/receipts/seen  { until? }  (Nick only)
export async function handleSeen(request: Request, env: Env, isNick: boolean): Promise<Response> {
  if (!isNick) return error('Forbidden', 403)
  const body = (await readBody(request)) ?? {}
  const until = body.until === undefined ? new Date() : new Date(String(body.until))
  if (Number.isNaN(until.getTime())) return error('until must be an ISO timestamp', 400)
  // A high-water mark, never a flag: every line written up to `until` is seen,
  // and a line that lands after it shows as new (lineOut / UNSEEN).
  const u = until.toISOString()
  const res = await env.DB.prepare(
    'UPDATE receipt_runs SET seen_at = ? WHERE started_at <= ? AND (seen_at IS NULL OR seen_at < ?)',
  ).bind(u, u, u).run()
  return json({ updated: res.meta?.changes ?? 0, until: u })
}

// ── Undo (Nick only) ─────────────────────────────────────────────────────────

/** True when the line was stamped by an undo (the race loser reads this). */
async function stampedBy(env: Env, id: string): Promise<string | null> {
  const l = await readLine(env, id)
  return l?.undo_line_id ?? null
}

function isConstraint(msg: string): boolean {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT|receipt_line_immutable/i.test(msg)
}

async function afterUndo(env: Env, line: ReceiptLineRow, undoId: string): Promise<Response> {
  const by = await stampedBy(env, line.id)
  if (by === undoId) return json({ undo_line_id: undoId, line_id: line.id })
  if (by) return refuse('already_undone', 'That change was already undone', 409, { undo_line_id: by })
  return refuse('changed_since', 'The item changed after this receipt line; nothing was written', 409)
}

// POST /api/receipts/lines/:id/undo
export async function handleUndoLine(lineIdParam: string, request: Request, env: Env, user: AuthUser, isNick: boolean): Promise<Response> {
  if (!isNick) return error('Forbidden', 403)
  const line = await readLine(env, lineIdParam)
  if (!line) return error('Line not found', 404)
  if (line.undone_at) return refuse('already_undone', 'That change was already undone', 409, { undo_line_id: line.undo_line_id })
  if (!REVERSIBLE.has(line.inverse_kind)) {
    return refuse('not_reversible', line.inverse_reason ?? 'This line has no Undo', 409, { inverse_kind: line.inverse_kind })
  }
  const undoId = lineId()
  const now = nowInstant()
  const actor = user.slug ?? user.email ?? 'nick'

  if (line.inverse_kind === 'patch' || line.inverse_kind === 'tombstone') {
    const table = line.entity_type!
    const recordId = line.entity_id!
    const after = parseJson(line.fields_after_json) ?? {}
    const fields = Object.keys(after)
    const pk: Gate = { sql: 'id = ?', vals: [recordId] }
    const isPatch = line.inverse_kind === 'patch'
    const patch = isPatch ? inversePatch(line, wireFields(table)) : undefined
    if (isPatch && !Object.keys(patch!).length) {
      return refuse('not_reversible', 'None of the recorded fields can be written back', 409)
    }
    const want = await hashTouched(after, fields)
    // The tombstone's "nobody worked it" predicate rides the delete's own WHERE
    // (guard.where), and the pre-check below asks the same SQL for a clear 409.
    const unworked = isPatch ? null : tombstoneUnworked(recordId, line.action_id)
    const guard: UndoGuard = {
      ...(unworked ? { where: unworked } : {}),
      check: async (current) => {
        if (Number(current.seq) !== Number(line.landed_version)) return 'changed_since'
        if (await hashTouched(current, fields) !== want) return 'changed_since'
        if (!isPatch) {
          // A tombstone takes only a task nobody has worked: no live comment
          // or update on it since it was created.
          if (current.deleted_at || !unworked) return 'changed_since'
          const ok = await env.DB.prepare(`SELECT CASE WHEN ${unworked.sql} THEN 1 ELSE 0 END AS ok`)
            .bind(...unworked.vals).first<{ ok: number }>()
          if (!ok?.ok) return 'changed_since'
        }
        return null
      },
      statements: (landed) => undoStatements(env.DB, {
        undoLineId: undoId,
        line,
        summary: isPatch ? `Undid: ${line.summary}` : `Undid (deleted again): ${line.summary}`,
        op: isPatch ? 'update' : 'delete',
        fieldsBefore: isPatch ? after : null,
        after: isPatch
          ? { kind: 'row', table, pk, fields: Object.keys(parseJson(line.fields_before_json) ?? {}), versioned: true }
          : { kind: 'row', table, pk, fields: ['deleted_at', 'status'], versioned: true },
        gate: landed,
        now,
      }),
    }
    let result
    try {
      result = await applyReceiptUndo(env, {
        table, record_id: recordId, op: isPatch ? 'update' : 'delete', patch, user, guard,
      })
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (isConstraint(msg)) return afterUndo(env, line, undoId)
      throw e
    }
    if (result.status === 'error') {
      const reason = result.reason ?? ''
      // cas_contention: the row (or the tombstone's predicate) moved on every
      // attempt, so nothing was written -- it changed since.
      if (reason.startsWith(RECEIPT_UNDO_REFUSED) || result.code === 'cas_contention') return refuse('changed_since', 'The item changed after this receipt line; nothing was written', 409)
      if (isConstraint(reason)) return afterUndo(env, line, undoId)
      return refuse('not_reversible', `The Hub refused the Undo: ${reason}`, 409, { refusal_code: result.code ?? null })
    }
    return afterUndo(env, line, undoId)
  }

  if (line.inverse_kind === 'hide_entry') {
    const entryId = line.entity_id!
    const after = parseJson(line.fields_after_json) ?? {}
    const body = typeof after.body === 'string' ? after.body : ''
    // The undo line lands only if the entry is still visible, still says what
    // PB posted, and nobody has replied; the hide and the stamp follow it.
    const gate: Gate = {
      sql: `EXISTS (SELECT 1 FROM activity_entries WHERE id = ? AND hidden_at IS NULL AND substr(body, 1, 2000) = ?)
            AND NOT EXISTS (SELECT 1 FROM activity_entries WHERE parent_id = ? AND hidden_at IS NULL)`,
      vals: [entryId, body, entryId],
    }
    try {
      await env.DB.batch([
        ...undoStatements(env.DB, {
          undoLineId: undoId, line, summary: `Hid: ${line.summary}`, op: 'update',
          fieldsBefore: { hidden_at: null },
          after: { kind: 'value', after: { hidden_at: now, hidden_by: actor }, version: null },
          gate, now,
        }).slice(0, 1),
        hideEntryStatement(env.DB, entryId, undoId, actor, now),
        ...undoStatements(env.DB, {
          undoLineId: undoId, line, summary: '', op: 'update', fieldsBefore: null,
          after: { kind: 'value', after: null, version: null }, gate, now,
        }).slice(1),
      ])
    } catch (e) {
      if (isConstraint((e as Error).message ?? '')) return afterUndo(env, line, undoId)
      throw e
    }
    return afterUndo(env, line, undoId)
  }

  // current_draft_undo: the product's own undo route, with the receipt's
  // line + stamp in its batch.
  const changeId = (line.source_ref ?? '').slice('current_draft_change:'.length)
  const synthetic = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ change_id: changeId, idempotency_key: `receipt-undo:${line.id}`, origin: 'receipt_undo' }),
  })
  let res: Response
  try {
    res = await handleUndoCurrentDraft(line.entity_id!, synthetic, user, env, true, (undoChangeId) => undoStatements(env.DB, {
      undoLineId: undoId, line, summary: `Undid: ${line.summary}`, op: 'update',
      fieldsBefore: parseJson(line.fields_after_json),
      after: { kind: 'value', after: { undone_by_change: undoChangeId }, version: null },
      gate: { sql: 'EXISTS (SELECT 1 FROM current_draft_changes WHERE id = ?)', vals: [undoChangeId] },
      now,
    }))
  } catch (e) {
    if (isConstraint((e as Error).message ?? '')) return afterUndo(env, line, undoId)
    throw e
  }
  if (res.ok) return afterUndo(env, line, undoId)
  const err = await res.clone().json().catch(() => ({})) as { code?: string; error?: string }
  if (err.code === 'already_undone') return afterUndo(env, line, undoId)
  if (err.code === 'current_draft_moved' || err.code === 'previous_draft_gone') {
    return refuse('changed_since', err.error ?? 'The product\'s current draft changed after this receipt line', 409)
  }
  return refuse('not_reversible', err.error ?? `The current-draft undo answered ${res.status}`, 409, { refusal_code: err.code ?? null })
}

// ── registration (api/index.ts calls this; it does not edit the registry) ────

/** Who is calling, as the /api/* middleware resolved it. */
export interface ReceiptCaller {
  /** A valid PB_API_KEY (SERVICE(c)). */
  pbKey: boolean
  /** c.get('callerKind'): 'member' for a signed-in team member. */
  callerKind: string | null | undefined
  slug: string | null | undefined
  /** PI(c): the PI flag from isPiRequest. */
  pi: boolean
}

/**
 * The receipt OWNER: Nick's own signed-in session and nobody else -- not the
 * PB key (PB never reads, undoes or acknowledges its own receipt), not a
 * second PI, not a member. isSiteAdmin is the one test for "this is Nick"
 * (slug nick-ingraham with the PI flag); the mail-watch / packets rule.
 */
export function isReceiptOwner(c: ReceiptCaller): boolean {
  return !c.pbKey && c.callerKind === 'member' && isSiteAdmin({ slug: c.slug ?? '', pi: c.pi })
}

/** Who may open runs, post lines and claim sources: the PB key, or Nick. */
export function isReceiptWriter(c: ReceiptCaller): boolean {
  return c.pbKey || isReceiptOwner(c)
}

export interface ReceiptRouteCtx<C> {
  env: (c: C) => Env
  request: (c: C) => Request
  user: (c: C) => AuthUser
  caller: (c: C) => ReceiptCaller
}

export function registerReceiptRoutes<C extends Context = Context>(ctx: ReceiptRouteCtx<C>): void {
  const writer = (c: C) => isReceiptWriter(ctx.caller(c))
  const owner = (c: C) => isReceiptOwner(ctx.caller(c))
  defineRoute({ method: 'POST', path: '/api/receipts/runs', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handleStartRun(ctx.request(c), ctx.env(c), writer(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/runs/:id/finish', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handleFinishRun(c.req.param('id') ?? '', ctx.env(c), writer(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/runs/:id/lines', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handlePostLine(c.req.param('id') ?? '', ctx.request(c), ctx.env(c), writer(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/claims', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handleClaim(ctx.request(c), ctx.env(c), writer(c)) })
  defineRoute({ method: 'GET', path: '/api/receipts/claims', auth: 'pi', entity: 'pb',
    handler: (c: C) => handleGetClaims(new URL(ctx.request(c).url), ctx.env(c), writer(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/claims/:key/settle', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handleSettleClaim(decodeURIComponent(c.req.param('key') ?? ''), ctx.request(c), ctx.env(c), writer(c)) })
  defineRoute({ method: 'GET', path: '/api/receipts/overnight', auth: 'pi', entity: 'pb',
    handler: (c: C) => handleOvernight(new URL(ctx.request(c).url), ctx.env(c), owner(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/lines/:id/undo', auth: 'pi', entity: 'pb',
    handler: (c: C) => handleUndoLine(c.req.param('id') ?? '', ctx.request(c), ctx.env(c), ctx.user(c), owner(c)) })
  defineRoute({ method: 'POST', path: '/api/receipts/seen', auth: 'pi', entity: 'pb', noVersionBump: true,
    handler: (c: C) => handleSeen(ctx.request(c), ctx.env(c), owner(c)) })
}
