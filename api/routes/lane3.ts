// GET /api/lane3/:table?seq_after=N&limit=L
//
// Generic seq-cursor list endpoint for non-session Lane 3 semantic tables.
// PB only schedules tables listed in PULL_ONLY_TABLES; this route is broader
// because hub_only_no_local_cache tables are endpoint-capable but not pulled
// into brain.db until promoted. Drift between this allow-list and PB
// classification fails tests/integration/test_lane3_contract.py
// (test_hub_lane3_generic_endpoint_allowlist_matches_non_session_registry).
//
// Returns {rows, cursor, has_more} matching the /api/sessions envelope.
//
// `sessions` keeps its own /api/sessions handler because it has tombstone
// filtering (deleted_at IS NULL); the other 8 Lane 3 tables don't have
// deleted_at columns — supersession is the deletion model for them.
//
// Companion to:
//   - PB scripts/db/lane3_registry.py LANE3_TABLES
//   - PB scripts/db/sync/__init__.py PULL_ONLY_TABLES
//   - PB scripts/db/sync/drivers/hub.py _apply_pull_semantic_table
//
// Drift detected by PB tests/integration/test_lane3_contract.py.

import type { Env } from '../helpers';
import { json, error, isPiRequest } from '../helpers';


// Mirrors PB scripts/db/lane3_registry.py LANE3_TABLES minus 'sessions'.
// Update both files together when promoting a table from
// hub_only_no_local_cache to pull_supported.
export const LANE3_PULL_TABLES = new Set([
  'agent_knowledge',
  'memory_facts',
  'pomodoro_sessions',
  'decisions',
  'kg_entities',
  'kg_relations',
  'kg_relation_type_registry',
  'trajectories',
]);


// PI-only: Lane 3 tables contain private brain.db semantic data (agent
// knowledge, memory facts, pomodoro, KG, decisions). API-key callers (PB
// sync service) are granted PI-level access via isPiRequest's Bearer check.
export async function handleLane3List(
  table: string,
  url: URL,
  env: Env,
  request?: Request,
): Promise<Response> {
  if (request && !(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }

  if (!LANE3_PULL_TABLES.has(table)) {
    return error(
      `Lane 3 table '${table}' not eligible for generic pull. ` +
      `Eligible: ${Array.from(LANE3_PULL_TABLES).sort().join(', ')}.`,
      400,
    );
  }

  const seqAfterRaw = url.searchParams.get('seq_after');
  const limitRaw = url.searchParams.get('limit');

  if (seqAfterRaw === null) {
    return error('seq_after is required', 400);
  }
  const seqAfter = Number.parseInt(seqAfterRaw, 10);
  if (!Number.isFinite(seqAfter) || seqAfter < 0) {
    return error('seq_after must be a non-negative integer', 400);
  }

  const limit = limitRaw
    ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000)
    : 2000;

  // SQL injection guard: `table` is validated against the hardcoded
  // LANE3_PULL_TABLES set above. Never derived from unvalidated input.
  const query = `SELECT * FROM ${table} WHERE seq > ? ORDER BY seq ASC LIMIT ?`;
  const result = await env.DB
    .prepare(query)
    .bind(seqAfter, limit)
    .all<Record<string, unknown>>();
  const rows = result.results ?? [];

  const cursor =
    rows.length > 0 ? (rows[rows.length - 1].seq as number) : seqAfter;
  const has_more = rows.length === limit;

  return json({ rows, cursor, has_more });
}
