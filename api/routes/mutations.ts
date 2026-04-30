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
import { json, error } from '../helpers';

const ALLOWED_TABLES = new Set([
  'tasks', 'projects', 'inbox_events', 'day_capacity', 'project_state_log',
]);

const ALLOWED_OPS = new Set(['insert', 'update', 'delete', 'append']);

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
    'title', 'short_name', 'status', 'stage', 'category', 'pi',
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
};

interface Mutation {
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
  // Validate envelope
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
        await recordProcessed(env, mut, r);
        return r;
      }
    } else {
      const depRow = await env.DB.prepare(
        'SELECT outcome FROM processed_mutations WHERE mutation_id = ?'
      ).bind(mut.depends_on).first<{ outcome: string }>();
      if (!depRow || (depRow.outcome !== 'accepted' && depRow.outcome !== 'merged_clean')) {
        const r = mkResult(mut.mutation_id, 'dependency_failed',
          { reason: `depends_on ${mut.depends_on} ${depRow?.outcome ?? 'missing'}` });
        await recordProcessed(env, mut, r);
        return r;
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
        await recordProcessed(env, mut, r);
        return r;
      }
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

  await recordProcessed(env, mut, result);
  return result;
}

// ── Apply functions (per-op; per-table column dispatch inside) ──────────────

async function applyInsert(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  if (!mut.payload) return mutErr(mut.mutation_id, 'insert requires payload');

  const cols = ['id', ...Object.keys(mut.payload), 'last_mutation_id'];
  const vals = [mut.record_id, ...Object.values(mut.payload), mut.mutation_id];
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${mut.table} (${cols.join(', ')}) VALUES (${placeholders})`;

  await env.DB.prepare(sql).bind(...vals).run();
  const canonical = await readCanonical(env, mut.table, mut.record_id);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: canonical?.seq as number | undefined,
    canonical_payload: canonical || undefined,
  });
}

async function applyUpdate(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  if (!mut.patch) return mutErr(mut.mutation_id, 'update requires patch');

  const current = await readCanonical(env, mut.table, mut.record_id);
  if (!current) {
    return mutErr(mut.mutation_id, `${mut.table} record ${mut.record_id} not found`);
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
      return mkResult(mut.mutation_id, 'merged_clean', {
        result_seq: r.seq as number | undefined,
        canonical_payload: r,
      });
    }
  }

  // Clean apply (current_seq == base_seq, or no base_seq for append)
  const r = await applyPatch(env, mut, current);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: r.seq as number | undefined,
    canonical_payload: r,
  });
}

async function applyDelete(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
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

  await env.DB.prepare(
    `UPDATE ${mut.table} SET deleted_at = datetime('now'), updated_at = datetime('now'), last_mutation_id = ? WHERE id = ?`
  ).bind(mut.mutation_id, mut.record_id).run();

  const r = await readCanonical(env, mut.table, mut.record_id);
  return mkResult(mut.mutation_id, 'accepted', {
    result_seq: r?.seq as number | undefined,
    canonical_payload: r || undefined,
  });
}

async function applyPatch(
  env: Env, mut: Mutation, current: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const patchKeys = Object.keys(mut.patch || {});
  const setClauses = [...patchKeys.map(k => `${k} = ?`), 'updated_at = datetime(\'now\')', 'last_mutation_id = ?'];
  const vals = [...patchKeys.map(k => (mut.patch as Record<string, unknown>)[k]), mut.mutation_id, mut.record_id];
  const idCol = mut.table === 'day_capacity' ? 'date' : 'id';
  await env.DB.prepare(
    `UPDATE ${mut.table} SET ${setClauses.join(', ')} WHERE ${idCol} = ?`
  ).bind(...vals).run();

  const r = await readCanonical(env, mut.table, mut.record_id);
  return r || current;
}

async function readCanonical(
  env: Env, table: string, recordId: string,
): Promise<Record<string, unknown> | null> {
  const idCol = table === 'day_capacity' ? 'date' : 'id';
  const row = await env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${idCol} = ?`
  ).bind(recordId).first<Record<string, unknown>>();
  return row;
}

async function hashTouched(
  row: Record<string, unknown>, fields: string[],
): Promise<string> {
  // Match Python scripts/db/outbox.py::_canonical_json_hash:
  // sort_keys + tight separators, sha256.
  const subset: Record<string, unknown> = {};
  for (const f of fields) {
    if (row[f] !== undefined) subset[f] = row[f];
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

async function recordProcessed(
  env: Env, mut: Mutation, result: MutationResult,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) VALUES (?, ?, datetime('now'), ?, ?, ?, ?)`
  ).bind(
    mut.mutation_id, mut.origin_machine, result.status,
    JSON.stringify(result), mut.table, mut.record_id,
  ).run();
}
