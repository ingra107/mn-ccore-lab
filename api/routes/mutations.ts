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

async function applyInsert(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
  if (!mut.payload) return mutErr(mut.mutation_id, 'insert requires payload');

  const cols = ['id', ...Object.keys(mut.payload), 'last_mutation_id'];
  const vals = [mut.record_id, ...Object.values(mut.payload), mut.mutation_id];
  const placeholders = cols.map(() => '?').join(', ');
  // Bug Y fix (2026-04-30 stress test): ON CONFLICT DO NOTHING. If two
  // concurrent requests race past the processed_mutations SELECT-gate,
  // both call applyInsert with the same mutation_id + record_id. The
  // first INSERT wins; the second would D1_ERROR UNIQUE on tasks.id.
  // With DO NOTHING, the second silently no-ops and we read back the
  // same canonical state. End-to-end idempotent.
  // day_capacity uses `date` as PK; all other tables use `id`.
  const idCol = mut.table === 'day_capacity' ? 'date' : 'id';
  const sql = `INSERT INTO ${mut.table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${idCol}) DO NOTHING`;

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
export async function applyUpdate(env: Env, mut: Mutation, user: AuthUser): Promise<MutationResult> {
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
  const isTaskDeleteByStatus =
    mut.table === 'tasks' &&
    (mut.patch as Record<string, unknown>)?.status === 'deleted' &&
    !current.deleted_at;

  if (isTaskDeleteByStatus) {
    setClauses.push("deleted_at = datetime('now')");
  }

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
