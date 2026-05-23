// A3 mutation protocol -- POST /api/mutations
//
// Per Peripheral-Brain workflow-restructure plan rev 4 sec A3.0 + A3.2.
// Single endpoint that handles every brain.db -> Hub write. Replaces the
// 14+ existing direct INSERT/UPDATE call sites.
//
// Idempotency: every (mutation_id, outcome) recorded in processed_mutations.
// Retries return the original response verbatim.
//
// Conflict resolution: client sends base_seq + base_row_hash for UPDATE.
// Hub:
//   - current_seq == base_seq -> apply (accepted)
//   - current_seq > base_seq + current_hash == base_row_hash -> apply (merged_clean)
//   - current_seq > base_seq + current_hash != base_row_hash -> conflict (caller resolves)
//
// Echo suppression: every successful apply stamps the row with
// last_mutation_id = mutation.mutation_id. PB pull-side checks local
// outbox.acked_at on each mutation_id encountered to skip self-echoes.
//
// HUB-R1 lint guard (mirrors PB R10): direct INSERT/UPDATE on the 5
// domain tables outside this route is a hard fail. Migrate every existing
// write path through this endpoint as part of A3 ship.

import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, assertProtectedNotNull } from '../helpers';

const ALLOWED_TABLES = new Set([
  'tasks', 'projects', 'inbox_events', 'day_capacity', 'project_state_log',
  // Stage 3 Phase 1 — 9 semantic tables
  'sessions', 'agent_knowledge', 'memory_facts', 'pomodoro_sessions', 'decisions',
  'kg_entities', 'kg_relations', 'kg_relation_type_registry', 'trajectories',
]);

const ALLOWED_OPS = new Set(['insert', 'update', 'delete', 'append']);

// Per-table primary key column lookup.
// Tables with PK = 'id' (tasks, projects, inbox_events, project_state_log,
// kg_entities, memory_facts) are omitted — they fall through to the default.
// Composite PKs (agent_knowledge, pomodoro_sessions, kg_relations, trajectories)
// use string[] — Stage 3 Phase 3 v3 (codex pass-2 N3 + M5 fix, 2026-05-07).
// Mirrors PB scripts/db/outbox.py:_TABLE_PK_COLUMN_MAP for consistency.
const PK_COLUMN: Record<string, string | string[]> = {
  day_capacity: 'date',
  sessions: 'session_id',
  decisions: 'context_id',
  kg_relation_type_registry: 'relation_type',
  // Composite PKs — Stage 3 Phase 3 v3
  agent_knowledge: ['category', 'topic', 'valid_from'],
  pomodoro_sessions: ['start_time', 'source'],
  kg_relations: ['source_id', 'target_id', 'relation_type'],
  trajectories: ['task', 'created_at'],
};

function pkColumn(table: string): string | string[] {
  return PK_COLUMN[table] ?? 'id';
}

function isCompositePk(pk: string | string[]): pk is string[] {
  return Array.isArray(pk);
}

// Mirror of Python scripts/db/query.py::_composite_record_id.
// PB encodes natural-key parts as base64url(JSON.stringify([part1, part2, ...]))
// because PK fields like agent_knowledge.topic and trajectories.task are
// unconstrained TEXT and can contain delimiter characters (codex pass-2 N3).
//
// Usage: Hub receives record_id, calls this to get ordered PK values back.
//
// IMPORTANT: Uses Web-standard APIs (atob + TextDecoder) instead of Node's
// Buffer. Cloudflare Pages Functions do NOT have Buffer even when
// wrangler.toml sets compatibility_flags = ["nodejs_compat"] for the Worker
// deploy — Pages and Workers are separate runtimes. atob+TextDecoder are
// available in both without any compat flags. (Regression: 4790715d shipped
// Buffer.from which vitest passed in Node env but Pages smoke failed with
// "Buffer is not defined"; fixed in this commit.)
function decodeCompositeRecordId(recordId: string): unknown[] {
  let json: string;
  try {
    // base64url → standard base64: replace URL-safe chars, restore padding.
    const b64 = recordId.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binStr = atob(padded);
    const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
    json = new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    throw new Error(`composite recordId base64url decode failed: ${(e as Error).message}`);
  }
  let parts: unknown;
  try {
    parts = JSON.parse(json);
  } catch (e) {
    throw new Error(`composite recordId JSON parse failed: ${(e as Error).message}`);
  }
  if (!Array.isArray(parts)) {
    throw new Error(`composite recordId must decode to JSON array, got ${typeof parts}`);
  }
  return parts;
}

// ── UTC timestamp normalization (Increment 1A Task 4) ──────────────────────
// Kills the live LMM churn bug: client_ts from brain.db pre-1A is naive
// America/Chicago, while stored last_meaningful_movement is UTC. A raw lexical
// MAX on mixed-zone strings picks the wrong winner (CT '16:30' < UTC '21:00'
// lexically even though 16:30 CT == 21:30 UTC, which is later). Fix: normalize
// BOTH operands to canonical UTC space-sep BEFORE the DB-side CASE compare,
// keeping the single-UPDATE atomicity (no SELECT-then-write lost-update window).

/**
 * Returns the America/Chicago UTC offset in minutes for the wall-clock instant
 * described by `ts` (YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS, no offset).
 * Returns -300 during CDT (UTC-5) and -360 during CST (UTC-6). Cloudflare
 * Workers ship full ICU so DST resolution via Intl is correct.
 */
function ctOffsetMinutesAt(ts: string): -300 | -360 {
  // Parse the naive wall-clock into a Date by pretending it is UTC (the only
  // parse path that is zone-neutral). We just need the calendar date to look up
  // DST, so the resulting Date is a proxy for the CT civil date — close enough.
  const normalized = ts.replace(' ', 'T');
  const proxy = new Date(normalized + 'Z'); // treat as UTC to get a Date object
  if (isNaN(proxy.getTime())) return -360; // safe fallback: CST

  // Use Intl to resolve the CT offset at this proxy instant. The CT wall-clock
  // is within ±1h of the true instant, which is always sufficient to determine
  // which DST side we're on (DST transitions happen at 2am CT, far from noon).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(proxy);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  // shortOffset format: "GMT-5" (CDT) or "GMT-6" (CST)
  const match = tzPart.match(/GMT([+-])(\d+)/);
  if (!match) return -360;
  const sign = match[1] === '-' ? -1 : 1;
  return (sign * parseInt(match[2], 10) * 60) as -300 | -360;
}

/**
 * Normalize a timestamp to canonical UTC 'YYYY-MM-DD HH:MM:SS' (space-sep,
 * no trailing Z, no fractional seconds). Honors an explicit UTC offset or Z
 * suffix; treats a naive value (no offset) as legacy America/Chicago (the
 * brain.db pre-Increment-1A emit zone). Returns null on unparseable input.
 *
 * The on-disk LMM format in D1 is 'YYYY-MM-DD HH:MM:SS' (SQLite datetime()).
 * Storing in this canonical form lets SQLite's lexical `<` on two UTC values
 * act as a correct temporal compare.
 */
function normalizeToUtcSpaceSep(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const trimmed = ts.trim();
  // Detect an explicit offset: Z suffix OR +HH:MM / -HH:MM after the time part.
  const hasOffset = /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed.slice(10));
  let d: Date;
  if (hasOffset) {
    d = new Date(trimmed);
  } else {
    // Naive wall-clock → treat as America/Chicago. Append the CT offset so the
    // Date constructor gets an unambiguous absolute instant.
    const ctOffsetMin = ctOffsetMinutesAt(trimmed); // -300 (CDT) or -360 (CST)
    const sign = ctOffsetMin <= 0 ? '-' : '+';
    const abs = Math.abs(ctOffsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    const withOffset = trimmed.replace(' ', 'T') + `${sign}${hh}:${mm}`;
    d = new Date(withOffset);
  }
  if (isNaN(d.getTime())) return null;
  // toISOString() → 'YYYY-MM-DDTHH:MM:SS.mmmZ'; convert to space-sep, no frac, no Z.
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}
// ── end UTC timestamp normalization ─────────────────────────────────────────

// Build a composite WHERE clause: "col1 = ? AND col2 = ? AND col3 = ?"
// Returns { clause: string, vals: unknown[] }.
function compositeWhere(cols: string[], parts: unknown[]): { clause: string; vals: unknown[] } {
  if (cols.length !== parts.length) {
    throw new Error(
      `composite PK column count ${cols.length} != recordId parts count ${parts.length}`
    );
  }
  const clause = cols.map(c => `${c} = ?`).join(' AND ');
  return { clause, vals: parts };
}

// Per-table column whitelists. Mutations carrying fields not in the
// whitelist are rejected with status='error' (rather than silently dropped).
// Keeps schema drift visible.
const TABLE_FIELDS: Record<string, Set<string>> = {
  tasks: new Set([
    'title', 'description', 'description_json', 'assignee', 'assigned_by',
    'project_id', 'meeting_id',
    'due_date', 'deadline', 'status', 'completed', 'completed_at', 'completed_by',
    'priority', 'effort', 'source', 'source_thread_id', 'related_message_ids',
    'short_title', 'notes', 'blocked_by',
    'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc',
    'key_link_3', 'key_link_3_desc', 'group_override',
    'waiting_on', 'promised_to', 'promise_date',
    'next_checkin_date', 'nick_followup_date',
    'requires_nick_brain', 'estimated_minutes',
    'deadline_type', 'next_artifact', 'inbox_event_id',
    'created_at',
  ]),
  projects: new Set([
    'title', 'short_name', 'status', 'stage', 'category', 'pi', 'pi_context', 'strategic_context',
    'slug', 'description', 'stage_notes',
    'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc',
    'key_link_3', 'key_link_3_desc',
    'state', 'next_artifact', 'last_meaningful_movement', 'stale_active_since',
    'created_at',
  ]),
  inbox_events: new Set([
    'source', 'source_external_id', 'raw_text', 'raw_payload_json', 'raw_hash',
    'suggested_project_id', 'suggested_action', 'confidence',
    'captured_at', 'triaged_at', 'triage_outcome', 'resulting_task_id',
    'triaged_by', 'notes', 'created_at',
  ]),
  day_capacity: new Set([
    'date', 'day_type', 'declared_at', 'source', 'created_at',
  ]),
  project_state_log: new Set([
    'project_id', 'old_state', 'new_state', 'reason', 'actor', 'created_at',
  ]),
  sessions: new Set([
    'session_id', 'started_at', 'ended_at', 'summary', 'context',
    'projects_touched', 'skills_used', 'token_estimate', 'machine_id',
    'created_at',
  ]),
  agent_knowledge: new Set([
    'category', 'topic', 'knowledge', 'source',
    'learned_at', 'updated_at', 'confidence', 'tags',
    'valid_from', 'valid_to', 'superseded_by', 'machine_id',
    'created_at',
  ]),
  memory_facts: new Set([
    'id', 'text', 'category', 'confidence', 'status',
    'confusion_risk', 'is_negative_constraint',
    'superseded_by', 'superseded_at', 'supersession_reason',
    'source_type', 'source_session_id',
    'access_count', 'days_active', 'last_relevance_score',
    'created_at', 'updated_at', 'promoted_at', 'last_accessed',
    'source_machine_id',
  ]),
  pomodoro_sessions: new Set([
    'task_id', 'project_id', 'start_time', 'end_time',
    'duration_min', 'completed', 'notes', 'created_at',
    'source', 'confidence_score', 'phase', 'machine_id',
  ]),
  decisions: new Set([
    'context_id', 'date', 'title', 'topic', 'tags', 'content',
    'file_path', 'indexed_at', 'outcome', 'outcome_date',
    'machine_id', 'created_at',
  ]),
  kg_entities: new Set([
    'id', 'entity_type', 'name', 'canonical_name', 'attributes',
    'description', 'importance_score', 'access_count', 'last_accessed',
    'source_type', 'source_id', 'created_at', 'updated_at',
    'valid_from', 'valid_until',
  ]),
  kg_relations: new Set([
    'source_id', 'target_id', 'relation_type', 'attributes',
    'confidence', 'weight', 'valid_from', 'valid_until',
    'superseded_by', 'extraction_source', 'extraction_ref',
    'extracted_from', 'created_at', 'last_validated',
  ]),
  kg_relation_type_registry: new Set([
    'relation_type', 'inverse_name', 'is_transitive', 'is_temporal',
    'default_weight', 'category', 'description', 'staleness_days',
    'created_at', 'updated_at',
  ]),
  trajectories: new Set([
    'task', 'steps', 'outcome', 'insight', 'project_id',
    'created_at', 'access_count', 'last_accessed', 'machine_id',
  ]),
};

export interface Mutation {
  mutation_id: string;
  origin_machine: string;
  table: string;
  op: 'insert' | 'update' | 'delete' | 'append';
  record_id: string;
  base_seq: number | null;
  base_row_hash: string | null;
  patch?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  depends_on?: string | null;
  client_ts: string;
  issued_at: string;
}

interface MutationResult {
  mutation_id: string;
  status: 'accepted' | 'merged_clean' | 'conflict' | 'dependency_failed' | 'error';
  result_seq?: number;
  canonical_payload?: Record<string, unknown>;
  current_payload?: Record<string, unknown>;
  reason?: string;
}

export async function handleMutations(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  let body: { mutations?: Mutation[] };
  try {
    body = await request.json();
  } catch {
    return error('JSON body required', 400);
  }

  if (!Array.isArray(body.mutations) || body.mutations.length === 0) {
    return error('mutations array required', 400);
  }

  const results: MutationResult[] = [];
  // depends_on chain tracking within this batch
  const inBatchResults = new Map<string, MutationResult>();

  for (const mut of body.mutations) {
    const result = await processOne(env, mut, inBatchResults, user);
    results.push(result);
    inBatchResults.set(mut.mutation_id, result);
  }

  return json({ results });
}

async function processOne(
  env: Env,
  mut: Mutation,
  inBatchResults: Map<string, MutationResult>,
  user: AuthUser,
): Promise<MutationResult> {
  // Validate envelope — ALL required fields checked BEFORE any DB access.
  // Fail-fast here prevents partial-batch commits: if a later mutation in the
  // batch has a malformed envelope (missing origin_machine / client_ts /
  // issued_at), it returns mutErr before any D1 write occurs. Without this,
  // earlier mutations in the batch commit successfully and the missing field
  // only surfaces as D1_TYPE_ERROR inside recordProcessedAtomic (after the
  // apply has already run), producing an inconsistent partial state.
  // (Incident: 2026-05-11 mechanic cleanup; escalation in
  // Peripheral-Brain/Context/Mechanic/escalations/
  //   2026-05-11_tests-sync-flush-async-prod-hub-leak.md secondary finding.)
  if (!mut.mutation_id || !mut.mutation_id.startsWith('mut_')) {
    return mutErr(mut.mutation_id || '<missing>', 'invalid mutation_id (must be mut_<ULID>)');
  }
  if (!ALLOWED_TABLES.has(mut.table)) {
    return mutErr(mut.mutation_id, `unknown table ${mut.table}`);
  }
  if (!ALLOWED_OPS.has(mut.op)) {
    return mutErr(mut.mutation_id, `unknown op ${mut.op}`);
  }
  if (!mut.record_id) {
    return mutErr(mut.mutation_id, 'record_id required');
  }
  // Required envelope fields that feed into processed_mutations INSERT.
  // Undefined values would produce D1_TYPE_ERROR after the apply already ran.
  if (!mut.origin_machine) {
    return mutErr(mut.mutation_id, 'origin_machine required');
  }
  if (!mut.client_ts) {
    return mutErr(mut.mutation_id, 'client_ts required');
  }
  if (!mut.issued_at) {
    return mutErr(mut.mutation_id, 'issued_at required');
  }

  // Idempotency: previously processed?
  const prior = await env.DB.prepare(
    'SELECT original_response_json FROM processed_mutations WHERE mutation_id = ?'
  ).bind(mut.mutation_id).first<{ original_response_json: string }>();
  if (prior) {
    try {
      return JSON.parse(prior.original_response_json) as MutationResult;
    } catch {
      // Manifest corruption -- shouldn't happen but never throw
      return mutErr(mut.mutation_id, 'idempotency record unparseable');
    }
  }

  // depends_on chain: must wait for predecessor success before applying
  if (mut.depends_on) {
    const inBatch = inBatchResults.get(mut.depends_on);
    if (inBatch) {
      if (inBatch.status !== 'accepted' && inBatch.status !== 'merged_clean') {
        const r = mkResult(mut.mutation_id, 'dependency_failed',
          { reason: `depends_on ${mut.depends_on} ${inBatch.status}` });
        const idem = await recordProcessedAtomic(env, mut, r);
        return idem ?? r;
      }
    } else {
      const depRow = await env.DB.prepare(
        'SELECT outcome FROM processed_mutations WHERE mutation_id = ?'
      ).bind(mut.depends_on).first<{ outcome: string }>();
      if (!depRow || (depRow.outcome !== 'accepted' && depRow.outcome !== 'merged_clean')) {
        const r = mkResult(mut.mutation_id, 'dependency_failed',
          { reason: `depends_on ${mut.depends_on} ${depRow?.outcome ?? 'missing'}` });
        const idem = await recordProcessedAtomic(env, mut, r);
        return idem ?? r;
      }
    }
  }

  // Validate fields against table whitelist
  const fields = mut.op === 'insert' ? mut.payload : mut.patch;
  if (fields) {
    const allowed = TABLE_FIELDS[mut.table];
    if (allowed) {
      const unknown = Object.keys(fields).filter(k => !allowed.has(k));
      if (unknown.length > 0) {
        const r = mutErr(mut.mutation_id, `unknown fields for ${mut.table}: ${unknown.join(',')}`);
        const idem = await recordProcessedAtomic(env, mut, r);
        return idem ?? r;
      }
    }
    // AM-1 (SEC-T0-5): reject NULL/empty on protected fields. Covers BOTH
    // insert payloads and update patches (fields is payload|patch above).
    // applyInsert (:434) and applyPatch (:785) both spread values with no
    // guard, so this is the single gate that prevents a protected column
    // (tasks.status/priority/assignee, projects.status/stage/category) from
    // being silently nulled via the A3 write path.
    const protectedErr = assertProtectedNotNull(mut.table, fields);
    if (protectedErr) {
      const r = mutErr(mut.mutation_id, protectedErr);
      const idem = await recordProcessedAtomic(env, mut, r);
      return idem ?? r;
    }
  }

  // Dispatch by op
  let result: MutationResult;
  try {
    if (mut.op === 'insert') {
      result = await applyInsert(env, mut, user);
    } else if (mut.op === 'update' || mut.op === 'append') {
      result = await applyUpdate(env, mut, user);
    } else if (mut.op === 'delete') {
      result = await applyDelete(env, mut, user);
    } else {
      result = mutErr(mut.mutation_id, `op ${mut.op} not implemented`);
    }
  } catch (e) {
    result = mutErr(mut.mutation_id, `apply error: ${(e as Error).message}`);
  }

  // Bug Y fix (2026-04-30 stress test): atomic write of processed_mutations
  // via ON CONFLICT DO NOTHING. If a concurrent request raced past the SELECT
  // idempotency gate at the top of this function and beat us to the INSERT,
  // we silently no-op AND return THEIR canonical response (read back from
  // processed_mutations). The two requests carry identical mutation_id, so
  // applyInsert's ON CONFLICT(id) above already produced the same final row
  // state; we just need to make the response shape consistent.
  const idempotent = await recordProcessedAtomic(env, mut, result);
  return idempotent ?? result;
}

// ── Apply functions (per-op; per-table column dispatch inside) ──────────────

export async function applyInsert(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  if (!mut.payload) return mutErr(mut.mutation_id, 'insert requires payload');

  // I18 dedup (2026-05-03): for tasks inserts, reject duplicate (title, project_id)
  // pairs when an active (non-deleted, non-done) row already exists. This closes
  // the RC2 leak where two machines running mechanic_triage both push an
  // "Approve: MECHANIC: I3" task and Hub stores both as separate rows.
  //
  // Edge cases:
  //   - project_id IS NULL: two tasks with same title but both null project_id
  //     ARE duplicates of each other (SQL IS NULL match).
  //   - deleted rows: excluded (deleted_at IS NOT NULL). A soft-deleted row
  //     with the same title is fine to re-create.
  //   - status='done': excluded. A completed task with same title should not
  //     block a new open task of the same name (recurring tasks, re-opens).
  //   - Race condition: the INSERT below uses ON CONFLICT(id) DO NOTHING, so
  //     two concurrent inserts with the same record_id are already covered by
  //     Bug Y idempotency. The dedup check here covers the separate-PK case
  //     (two DIFFERENT record_ids for the same conceptual task).
  if (mut.table === 'tasks') {
    const title = (mut.payload as Record<string, unknown>).title as string | undefined;
    const projectId = (mut.payload as Record<string, unknown>).project_id as string | null | undefined;
    if (title) {
      // Use IS ? instead of = ? so NULL project_id matches NULL (SQL equality
      // NULL = NULL is false; IS NULL = IS NULL is true).
      const dup = await env.DB.prepare(
        `SELECT id FROM tasks WHERE title = ? AND project_id IS ? AND deleted_at IS NULL AND status != 'done' LIMIT 1`
      ).bind(title, projectId ?? null).first<{ id: string }>();
      if (dup) {
        // Return the existing row as the canonical result. Outbox treats
        // this as accepted-idempotent: the conceptual task exists on Hub,
        // the PB-side can adopt the existing Hub id via alias.
        const canonical = await readCanonical(env, 'tasks', dup.id);
        return mkResult(mut.mutation_id, 'accepted', {
          result_seq: canonical?.seq as number | undefined,
          canonical_payload: canonical || undefined,
          reason: `deduped: active task with same (title, project_id) exists as ${dup.id}`,
        });
      }
    }
  }

  const idCol = pkColumn(mut.table);
  let pkCols: string[];
  let pkVals: unknown[];
  let conflictTarget: string;

  if (isCompositePk(idCol)) {
    const parts = decodeCompositeRecordId(mut.record_id);
    const { vals: cv } = compositeWhere(idCol, parts);
    pkCols = idCol;
    pkVals = cv;
    conflictTarget = `(${idCol.join(', ')})`;
  } else {
    pkCols = [idCol];
    pkVals = [mut.record_id];
    conflictTarget = `(${idCol})`;
  }

  const payloadCols = Object.keys(mut.payload);
  const payloadVals = Object.values(mut.payload);
  const cols = [...pkCols, ...payloadCols, 'last_mutation_id'];
  const vals = [...pkVals, ...payloadVals, mut.mutation_id];
  const placeholders = cols.map(() => '?').join(', ');

  // Bug Y fix (2026-04-30 stress test): ON CONFLICT DO NOTHING. If two
  // concurrent requests race past the processed_mutations SELECT-gate,
  // both call applyInsert with the same mutation_id + record_id. The
  // first INSERT wins; the second would D1_ERROR UNIQUE on tasks.id.
  // With DO NOTHING, the second silently no-ops and we read back the
  // same canonical state. End-to-end idempotent.
  const sql = `INSERT INTO ${mut.table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT${conflictTarget} DO NOTHING`;

  await env.DB.prepare(sql).bind(...vals).run();
  const canonical = await readCanonical(env, mut.table, mut.record_id);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: canonical?.seq as number | undefined,
    canonical_payload: canonical || undefined,
  });
}

// Exported so Hub-side internal callers (e.g., handoffs.ts task reassignment)
// can route domain-table writes through the mutation protocol instead of
// raw UPDATE. Routes through here pick up: last_mutation_id stamping,
// updated_at refresh, canonical_payload return shape, and seq advancement.
// Codex item HUB-R1 (2026-04-30): handoffs.ts:65 was a direct UPDATE
// outside mutations.ts; now uses this export.
// Tables where an update mutation arriving before the corresponding insert
// (insert-update race window) should be accepted via upsert rather than
// dead-lettered. Sessions is the canonical case: PB writes the insert when
// the session opens, then writes an update (ended_at, summary, etc.) when
// it closes. Because Hub sync is async, the update can arrive while the
// insert is still in the outbox queue. Rather than dead-lettering ~260
// mutations per canary window, we upsert: INSERT the row with the patch
// fields if absent, UPDATE if present. Stage 3 Phase 3.6 fix 2026-05-11.
const UPSERT_ON_MISS_TABLES = new Set(['sessions']);

export async function applyUpdate(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  if (!mut.patch) return mutErr(mut.mutation_id, 'update requires patch');

  const current = await readCanonical(env, mut.table, mut.record_id);
  if (!current) {
    // For tables that support upsert-on-miss (insert-update race window),
    // synthesize an INSERT ... ON CONFLICT DO UPDATE instead of dead-lettering.
    if (UPSERT_ON_MISS_TABLES.has(mut.table)) {
      const idCol = pkColumn(mut.table) as string; // scalar PK only in this set
      const patchKeys = Object.keys(mut.patch);
      const patchVals = Object.values(mut.patch);
      // sessions.started_at: if the patch doesn't carry started_at (typical
      // session-close update: ended_at + summary only), default to datetime('now')
      // so the upsert-on-miss row is never left with started_at=NULL in production.
      // The real insert will later arrive and set the authoritative started_at via
      // ON CONFLICT DO UPDATE (which does NOT touch started_at on conflict, preserving
      // whatever the close-update set here or the insert provides).
      const needsStartedAt = mut.table === 'sessions' && !patchKeys.includes('started_at');
      const allCols = [idCol, ...patchKeys, ...(needsStartedAt ? ['started_at'] : []), 'last_mutation_id'];
      const allVals = [mut.record_id, ...patchVals, mut.mutation_id];
      const placeholders = allCols.map((c) => (c === 'started_at' && needsStartedAt) ? "datetime('now')" : '?').join(', ');
      // ON CONFLICT DO UPDATE: apply patch fields so a later real-insert
      // doesn't overwrite the already-applied ended_at/summary data.
      const updateSet = [...patchKeys.map(k => `${k} = excluded.${k}`), `last_mutation_id = excluded.last_mutation_id`, `updated_at = datetime('now')`].join(', ');
      await env.DB.prepare(
        `INSERT INTO ${mut.table} (${allCols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${idCol}) DO UPDATE SET ${updateSet}`
      ).bind(...allVals).run();
      const canonical = await readCanonical(env, mut.table, mut.record_id);
      return mkResult(mut.mutation_id, 'accepted', {
        result_seq: canonical?.seq as number | undefined,
        canonical_payload: canonical || undefined,
        reason: 'upserted: row absent at update time (insert-update race)',
      });
    }
    return mutErr(mut.mutation_id, `${mut.table} record ${mut.record_id} not found`);
  }

  // Tombstone resurrection guard (codex Fix 1, 2026-05-11):
  // Reject updates to soft-deleted rows unless the patch intends to undelete.
  // Three allowed paths that indicate intent to undelete:
  //   1. Patch contains deleted_at = null (explicit undelete, e.g. hub-ui send).
  //   2. Patch contains status = <live value> (not 'deleted') — the I7-INVERSE
  //      bridge in applyPatch co-clears deleted_at for PB outbox patterns where
  //      PB sends status='todo' without touching deleted_at.
  //   3. Patch contains both status = <live> AND explicit deleted_at value (test
  //      suite explicit-deleted_at precedence case).
  //
  // Rejected: patches that don't address the deletion (e.g. due_date change on
  // a tombstoned row, or a plain status='deleted' re-stamp). These would apply
  // silently and leave the row in an inconsistent state.
  if (current.deleted_at) {
    const patchRecord = (mut.patch ?? {}) as Record<string, unknown>;
    const hasExplicitDeletedAt = Object.prototype.hasOwnProperty.call(patchRecord, 'deleted_at');
    const hasLiveStatus =
      Object.prototype.hasOwnProperty.call(patchRecord, 'status') &&
      patchRecord.status !== 'deleted' &&
      patchRecord.status !== null &&
      patchRecord.status !== undefined;
    // Also allow idempotent re-stamp of status='deleted' on already-deleted rows
    // (e.g. PB re-sends the outbox mutation, applyPatch co-flip is a no-op).
    const isIdempotentDelete =
      Object.prototype.hasOwnProperty.call(patchRecord, 'status') &&
      patchRecord.status === 'deleted';
    const isUndeletePatch = hasExplicitDeletedAt || hasLiveStatus || isIdempotentDelete;
    if (!isUndeletePatch) {
      return mutErr(mut.mutation_id, `${mut.table} record ${mut.record_id} is deleted — cannot update; send deleted_at=null to undelete`);
    }
  }

  const currentSeq = (current.seq as number) ?? 0;

  // Conflict check (only for update with base_seq)
  if (mut.op === 'update' && mut.base_seq !== null && mut.base_seq !== undefined) {
    if (currentSeq > mut.base_seq) {
      const baseFields = Object.keys(mut.patch);
      if (mut.base_row_hash) {
        const currentHash = await hashTouched(current, baseFields);
        if (currentHash !== mut.base_row_hash) {
          // Real conflict -- a touched field changed since base_seq
          return mkResult(mut.mutation_id, 'conflict', {
            result_seq: currentSeq,
            current_payload: current,
            reason: `current_seq=${currentSeq} > base_seq=${mut.base_seq}, base_row_hash mismatch`,
          });
        }
      }
      // Hash matches OR no base_row_hash -> merged_clean
      const r = await applyPatch(env, mut, current);
      // Advance parent project staleness fields on task completion.
      // Symmetric Hub-side counterpart to brain.db::_advance_project_movement
      // (commit 83946bc2). Uses MAX semantics so forward-only regardless of
      // which machine's completion lands first. Fires for both PB-push and
      // Hub-UI completion mutations (no feedback loop: the project UPDATE is a
      // direct D1 write, not routed through the mutation protocol).
      await advanceProjectMovement(env, mut, current);
      return mkResult(mut.mutation_id, 'merged_clean', {
        result_seq: r.seq as number | undefined,
        canonical_payload: r,
      });
    }
  }

  // Clean apply (current_seq == base_seq, or no base_seq for append)
  const r = await applyPatch(env, mut, current);
  // Advance parent project staleness fields on task completion.
  // See comment on the merged_clean path above — same semantics.
  await advanceProjectMovement(env, mut, current);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: r.seq as number | undefined,
    canonical_payload: r,
  });
}

export async function applyDelete(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  // Soft delete via deleted_at (the 5 domain tables all support it post-W2a).
  // Idempotent: already-deleted returns accepted.
  const current = await readCanonical(env, mut.table, mut.record_id);
  if (!current) {
    // Not found -- treat as already-gone (idempotent delete)
    return mkResult(mut.mutation_id, 'accepted', { reason: 'already absent' });
  }
  if (current.deleted_at) {
    return mkResult(mut.mutation_id, 'accepted', {
      reason: 'already deleted',
      result_seq: current.seq as number,
      canonical_payload: current,
    });
  }

  const idCol = pkColumn(mut.table);
  let deleteWhere: string;
  let deleteVals: unknown[];

  if (isCompositePk(idCol)) {
    const parts = decodeCompositeRecordId(mut.record_id);
    const { clause, vals: wv } = compositeWhere(idCol, parts);
    deleteWhere = clause;
    deleteVals = [mut.mutation_id, ...wv];
  } else {
    deleteWhere = `${idCol} = ?`;
    deleteVals = [mut.mutation_id, mut.record_id];
  }

  // Cascade cleanup for tasks and projects (codex Fixes 2+3, 2026-05-11).
  // PB-origin deletes route through applyDelete, bypassing the route-level
  // cascade in handleDeleteTask / handleDeleteProject. Move the cascade here
  // so both callers (Hub-UI route + /api/mutations PB path) clean up dependents.
  // Wrapped in try/catch so a missing child table doesn't abort the soft-delete.
  if (mut.table === 'tasks') {
    try {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM task_comments WHERE task_id = ?').bind(mut.record_id),
        env.DB.prepare('DELETE FROM task_updates WHERE task_id = ?').bind(mut.record_id),
        env.DB.prepare("DELETE FROM notifications WHERE source_type IN ('task','task_comment') AND source_id = ?").bind(mut.record_id),
      ]);
    } catch (e) {
      console.error('applyDelete task cascade failed:', e);
    }
    // task_subtasks is conditional (may not exist in all envs)
    try {
      await env.DB.prepare('DELETE FROM task_subtasks WHERE task_id = ?').bind(mut.record_id).run();
    } catch { /* table may not exist */ }
  } else if (mut.table === 'projects') {
    // B7 (SEC-T0-7): mirror the full child-table cascade from handleDeleteProject
    // so PB-origin project deletes (this path) clean up the same dependents the
    // Hub-UI route does. `mut.record_id` is the project's canonical id; child
    // rows may key by id OR slug, so resolve the slug and match both.
    // (entity_aliases is a PB-side brain.db table, not present in Hub D1, so
    // there's no Hub alias row to clear here.)
    try {
      const proj = await env.DB.prepare('SELECT slug FROM projects WHERE id = ?').bind(mut.record_id).first<{ slug: string | null }>();
      const slug = proj?.slug ?? mut.record_id;
      await env.DB.batch([
        env.DB.prepare('DELETE FROM comments WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM project_updates WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM project_documents WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM milestones WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM conference_submissions WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM submission_events WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM regulatory_items WHERE project_id = ? OR project_id = ?').bind(mut.record_id, slug),
        env.DB.prepare('DELETE FROM project_dependencies WHERE from_slug = ? OR to_slug = ? OR from_slug = ? OR to_slug = ?').bind(slug, slug, mut.record_id, mut.record_id),
        env.DB.prepare("UPDATE tasks SET project_id = NULL, updated_at = datetime('now') WHERE (project_id = ? OR project_id = ?) AND deleted_at IS NULL").bind(mut.record_id, slug),
      ]);
    } catch (e) {
      console.error('applyDelete project cascade failed:', e);
    }
  }

  await env.DB.prepare(
    `UPDATE ${mut.table} SET deleted_at = datetime('now'), updated_at = datetime('now'), last_mutation_id = ? WHERE ${deleteWhere}`
  ).bind(...deleteVals).run();

  const r = await readCanonical(env, mut.table, mut.record_id);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: r?.seq as number | undefined,
    canonical_payload: r || undefined,
  });
}

/**
 * Server-side mutation envelope factory.
 *
 * Used by Hub UI routes that originate writes inside the Worker
 * (handleCreateTask, handleUpdateProject, etc.) — NOT for PB-origin
 * writes which go through processOne with PB-supplied envelopes.
 *
 * Mints mutation_id, sets origin_machine='hub_ui:<route>', records the
 * mutation in processed_mutations, and stamps last_mutation_id on the row.
 *
 * Codex 2026-05-04 Phase 3.1. The one mutation ledger.
 */
export async function applyMutation(
  env: Env,
  args: {
    table: 'tasks' | 'projects';
    record_id: string;
    op: 'insert' | 'update' | 'delete';
    patch?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    route: string;
    user: AuthUser;
  },
): Promise<MutationResult> {
  const mutation_id = generateId('mut');
  const origin_machine = `hub_ui:${args.route}`;
  const mut: Mutation = {
    mutation_id,
    origin_machine,
    table: args.table,
    record_id: args.record_id,
    op: args.op,
    base_seq: null,  // Hub-origin: no PB local seq
    base_row_hash: null,
    patch: args.patch,
    payload: args.payload,
    depends_on: null,
    client_ts: new Date().toISOString(),
    issued_at: new Date().toISOString(),
  };
  // Route through processOne so idempotency + processed_mutations recording fires.
  return await processOne(env, mut, new Map(), args.user);
}

/**
 * Advance the parent project's last_meaningful_movement and clear
 * stale_active_since when a task transitions to done/completed.
 *
 * Symmetric Hub-side counterpart to brain.db::_advance_project_movement
 * (PB commit 83946bc2). Requirement coverage:
 *
 *   1. Transition guard: only fires when status transitions TO 'done' / completed
 *      flips 0→1. Does NOT re-fire on idempotent re-sends of already-done rows
 *      (current.status === 'done' already → skip). No feedback loop: this is a
 *      direct D1 UPDATE, not routed through the mutations protocol, so no
 *      processed_mutations row is created and PB's outbox echo-suppression is
 *      irrelevant here.
 *
 *   2. MAX semantics (forward-only): CASE WHEN clause ensures we never move
 *      last_meaningful_movement backward. If the project already has a later
 *      movement timestamp (e.g. from an even more recent completion), the CASE
 *      preserves the existing value.
 *
 *   3. Pull-back correctness: brain.db's hub.py pull-back (~line 1817) gates on
 *      `if d1_v and d1_v != existing` for last_meaningful_movement. After this
 *      write, D1 will carry a truthy value → pull correctly propagates to
 *      brain.db. NOTE: stale_active_since clearing (NULL) does NOT propagate via
 *      the current pull-back (truthy gate skips NULL). A companion fix to
 *      hub.py::_w1col loop is REQUIRED for full symmetry — see STATUS:
 *      scope-question note in the session response.
 */
async function advanceProjectMovement(
  env: Env,
  mut: Mutation,
  current: Record<string, unknown>,
): Promise<void> {
  // Only applies to task mutations.
  if (mut.table !== 'tasks') return;

  // Determine whether this patch is transitioning a task TO done/completed.
  // Guard 1: patch must assert done. Accept either signal (status or completed
  // flag) since callers vary — Hub-UI sends both; PB outbox may send status only.
  const patch = (mut.patch ?? {}) as Record<string, unknown>;
  const patchingDone =
    patch.status === 'done' || patch.completed === 1 || patch.completed === true;
  if (!patchingDone) return;

  // Guard 2: must be a genuine transition, not an idempotent re-stamp of an
  // already-done task. This prevents double-advancing timestamps on outbox
  // re-delivers and Hub UI re-clicks on a completed checkbox.
  const alreadyDone = current.status === 'done' || current.completed === 1;
  if (alreadyDone) return;

  // Resolve parent project id. Tasks store project_id as the project's PK or slug.
  const projectId = current.project_id as string | null | undefined;
  if (!projectId) return;

  // Use client_ts as the movement timestamp so both brain.db-originated and
  // Hub-UI-originated completions use the actual completion time rather than
  // Hub server processing time. This makes convergence deterministic when both
  // machines complete the same task nearly simultaneously.
  //
  // UTC-normalize the incoming timestamp (Increment 1A Task 4): client_ts from
  // brain.db pre-1A is naive America/Chicago (e.g. '2026-05-22T16:11:46');
  // last_meaningful_movement on disk is UTC space-sep (SQLite datetime('now')).
  // A raw lexical compare on mixed-zone strings picks the wrong winner — a CT
  // '16:30' string sorts before a UTC '21:00' string even though the CT instant
  // IS later (16:30 CT == 21:30 UTC). Normalizing to UTC space-sep makes the
  // DB-side lexical `<` a correct temporal compare. Fallback to server-now
  // (already UTC) if client_ts is missing or unparseable.
  const tsUtc =
    normalizeToUtcSpaceSep(mut.client_ts) ??
    new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  // ATOMIC MAX in UTC space — single UPDATE, DB-side CASE compare. Because both
  // sides are now canonical UTC space-sep, the lexical `<` IS a correct temporal
  // compare. This preserves the live code's lost-update safety (the compare and
  // write are one statement; concurrent completions can never move LMM backward)
  // while killing the mixed-zone wrong-winner bug. stale_active_since + updated_at
  // unconditional (movement = project unstale), matching prior behavior.
  //
  // Uses id = ? OR slug = ? because tasks.project_id may store the project's
  // slug (assigned via the Hub UI resolve path in tasks.ts resolvedProjectId =
  // proj.slug || proj.id) rather than the PK. Matching only id = ? silently
  // misses slug-backed tasks, leaving last_meaningful_movement un-advanced.
  // Both bindings carry the same projectId value; D1 will match at most one row.
  // Non-fatal wrapper: a missing projects row (orphaned task) or transient D1
  // error must not abort the task mutation that already succeeded. Log clearly
  // so operational issues surface in wrangler tail without aborting the caller.
  await env.DB.prepare(`
    UPDATE projects
    SET last_meaningful_movement = CASE
        WHEN last_meaningful_movement IS NULL OR last_meaningful_movement < ?
        THEN ?
        ELSE last_meaningful_movement
      END,
      stale_active_since = NULL,
      updated_at = datetime('now')
    WHERE id = ? OR slug = ?
  `).bind(tsUtc, tsUtc, projectId, projectId).run().catch((e: Error) => {
    console.error('advanceProjectMovement: project update failed:', e.message);
  });
}

async function applyPatch(
  env: Env, mut: Mutation, current: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const patchKeys = Object.keys(mut.patch || {});
  const setClauses = [...patchKeys.map(k => `${k} = ?`), 'updated_at = datetime(\'now\')', 'last_mutation_id = ?'];
  // vals only covers SET clause bindings; WHERE clause bindings appended separately below
  // (composite PKs need multiple WHERE values; scalar PKs need one).
  const vals = [...patchKeys.map(k => (mut.patch as Record<string, unknown>)[k]), mut.mutation_id];

  // I7 fix (2026-05-03): brain.db uses tasks.status='deleted' as its soft-delete
  // signal, but the outbox emits op='update' + patch={status:'deleted'} rather
  // than op='delete'. Hub D1's invariant checker (I7) fires when deleted_at IS
  // NULL despite status='deleted'. Bridge the gap: whenever an update mutation
  // for the tasks table carries status='deleted' AND the row doesn't already have
  // deleted_at set, co-apply deleted_at=NOW(). Idempotent: already-deleted rows
  // are untouched (current.deleted_at check). Does NOT replicate the
  // POST /tasks/:id/delete cascade (task_comments / task_updates / notifications)
  // because those tables are Hub-UI artefacts with no brain.db equivalent — the
  // cascade is cosmetic, not part of the sync contract.
  //
  // I7-INVERSE fix (2026-05-03): symmetric recovery path. When status transitions
  // FROM 'deleted' to any live status (todo/in_progress/done/blocked/etc.) AND the
  // row has a stale deleted_at, clear it. Without this, a corrective mutation that
  // sets status='todo' on a previously-deleted row leaves deleted_at non-null —
  // the pull-side tombstone branch fires on deleted_at IS NOT NULL and re-deletes
  // the row on the receiving machine.
  //
  // Precedence rule: if the patch EXPLICITLY sets deleted_at, that value wins and
  // neither co-flip fires (explicit always beats implicit). This preserves the
  // semantic where a caller intentionally sets deleted_at to a specific timestamp
  // or NULL directly via the patch payload.
  const patchedStatus = (mut.patch as Record<string, unknown>)?.status as string | undefined;
  const explicitDeletedAt = Object.prototype.hasOwnProperty.call(mut.patch ?? {}, 'deleted_at');

  const isTaskDeleteByStatus =
    mut.table === 'tasks' &&
    patchedStatus === 'deleted' &&
    !current.deleted_at &&
    !explicitDeletedAt;

  const isTaskUndeleteByStatus =
    mut.table === 'tasks' &&
    patchedStatus !== undefined &&
    patchedStatus !== 'deleted' &&
    !!current.deleted_at &&
    !explicitDeletedAt;

  if (isTaskDeleteByStatus) {
    setClauses.push("deleted_at = datetime('now')");
  } else if (isTaskUndeleteByStatus) {
    // Use literal NULL (not a ? placeholder) so the parameter binding index
    // for subsequent params (last_mutation_id, id) stays correct.
    setClauses.push("deleted_at = NULL");
  }

  // D7 (2026-05-22): stamp stage_entered_at whenever a project's stage genuinely
  // changes, regardless of write path (Hub UI, PB sync push, batch — all route
  // through applyPatch). Literal SET clause keeps the ? binding indices intact,
  // same approach as the deleted_at co-flips above. Only fires on a real
  // transition (patch.stage differs from current.stage), so editing other fields
  // never resets the counter — this is the fix for the Manuscripts daysInStage bug.
  const patchedStage = (mut.patch as Record<string, unknown>)?.stage;
  const isProjectStageChange =
    mut.table === 'projects' &&
    typeof patchedStage === 'string' &&
    patchedStage !== current.stage;
  if (isProjectStageChange) {
    setClauses.push("stage_entered_at = datetime('now')");
  }

  const idCol = pkColumn(mut.table);
  let patchWhere: string;
  let patchWhereVals: unknown[];

  if (isCompositePk(idCol)) {
    const parts = decodeCompositeRecordId(mut.record_id);
    const { clause, vals: wv } = compositeWhere(idCol, parts);
    patchWhere = clause;
    patchWhereVals = wv;
  } else {
    patchWhere = `${idCol} = ?`;
    patchWhereVals = [mut.record_id];
  }

  await env.DB.prepare(
    `UPDATE ${mut.table} SET ${setClauses.join(', ')} WHERE ${patchWhere}`
  ).bind(...vals, ...patchWhereVals).run();

  const r = await readCanonical(env, mut.table, mut.record_id);
  return r || current;
}

async function readCanonical(
  env: Env, table: string, recordId: string,
): Promise<Record<string, unknown> | null> {
  const pk = pkColumn(table);
  if (isCompositePk(pk)) {
    const parts = decodeCompositeRecordId(recordId);
    const { clause, vals } = compositeWhere(pk, parts);
    const row = await env.DB.prepare(
      `SELECT * FROM ${table} WHERE ${clause}`
    ).bind(...vals).first<Record<string, unknown>>();
    return row;
  }
  const row = await env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${pk} = ?`
  ).bind(recordId).first<Record<string, unknown>>();
  return row;
}

// Exported for tests/mutations.hash.test.ts. Internal call sites use it
// without import (same module). The cross-language hash contract test
// (Peripheral-Brain tests/db/test_a3_hash_contract.py + this Hub test)
// verifies byte-for-byte alignment with Python compute_base_hash.
export async function hashTouched(
  row: Record<string, unknown>, fields: string[],
): Promise<string> {
  // Match Python scripts/db/outbox.py::canonical_json_hash byte-for-byte:
  // sort_keys + tight separators, NULLs preserved (a row with field=null
  // must hash differently than a row missing the field). compute_base_hash
  // and this function MUST stay aligned -- mismatch = false conflict
  // rejection on every UPDATE that touches a NULL column.
  const subset: Record<string, unknown> = {};
  for (const f of fields) {
    // Coerce undefined -> null so hash includes NULLs (matches Python's
    // dict.get() returning None for missing keys after dict() materialization).
    subset[f] = row[f] === undefined ? null : row[f];
  }
  const sorted = Object.keys(subset).sort().reduce((acc, k) => {
    acc[k] = subset[k];
    return acc;
  }, {} as Record<string, unknown>);
  const blob = JSON.stringify(sorted);
  const buf = new TextEncoder().encode(blob);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mkResult(
  mutation_id: string,
  status: MutationResult['status'],
  extras: Partial<MutationResult> = {},
): MutationResult {
  return { mutation_id, status, ...extras };
}

function mutErr(mutation_id: string, reason: string): MutationResult {
  return { mutation_id, status: 'error', reason };
}

async function recordProcessedAtomic(
  env: Env, mut: Mutation, result: MutationResult,
): Promise<MutationResult | null> {
  // Bug Y fix (2026-04-30 stress test): atomic claim of mutation_id row.
  // Returns:
  //   null  -- our INSERT won; caller's `result` is canonical
  //   Stored result -- a concurrent request beat us; return THEIR result
  //
  // Without this, two concurrent requests with the same mutation_id (which
  // PB-side flush_async daemon races CAN produce -- Bug X) would both pass
  // the SELECT-then-INSERT idempotency gate, both INSERT processed_mutations,
  // and the second would D1_ERROR UNIQUE constraint -> Worker returns 500
  // -> PB outbox records error -> dead-letters after 3 retries on rows
  // that were ACTUALLY accepted on Hub. Caught by 40-task /process stress
  // test 2026-04-30 (159 phantom dead-letters).
  const ins = await env.DB.prepare(
    `INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) VALUES (?, ?, datetime('now'), ?, ?, ?, ?) ON CONFLICT(mutation_id) DO NOTHING`
  ).bind(
    mut.mutation_id, mut.origin_machine, result.status,
    JSON.stringify(result), mut.table, mut.record_id,
  ).run();

  // D1's RunResult exposes meta.changes -- non-zero means our row was inserted.
  const changes = (ins.meta?.changes as number | undefined) ?? 0;
  if (changes > 0) {
    return null; // we won; caller returns its own result
  }

  // Race lost: another request wrote the canonical processed_mutations row.
  // Fetch + return their stored result so both Worker invocations return
  // the same shape to the client.
  const prior = await env.DB.prepare(
    'SELECT original_response_json FROM processed_mutations WHERE mutation_id = ?'
  ).bind(mut.mutation_id).first<{ original_response_json: string }>();
  if (prior) {
    try {
      return JSON.parse(prior.original_response_json) as MutationResult;
    } catch {
      // Stored row is corrupt -- fall back to our own freshly-computed result
      // (which is functionally identical since the mutation is deterministic).
      return result;
    }
  }
  // Defensive: unreachable in practice (we just lost a race so the row
  // MUST exist), but never throw from this helper.
  return result;
}
