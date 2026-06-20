// GET /links -- typed-link pull endpoint for PB sync (Phase 2, 2026-06-20)
//
// PB's pull leg (scripts/db/sync/drivers/hub.py::_apply_pull_links) calls:
//   GET /links?seq_after=N&limit=K&include_deleted=1
// and expects:
//   { data: [ { id, seq, owner_table, owner_id, role, type, canonical_url,
//               short_title, source_raw, sort_order, deleted_at,
//               created_at, updated_at, last_mutation_id }, ... ],
//     count: N }
//
// Parameters:
//   seq_after       integer  Only return rows with seq > N (incremental pull).
//                            Default = 0 (full pull). Must be non-negative.
//   include_deleted 1        Include soft-deleted rows (tombstones). Default off.
//   limit           integer  Cap on returned rows. Default 2000, max 5000.
//   owner_table     text     Filter by owner_table ('tasks'|'projects'). Optional.
//   owner_id        text     Filter by owner_id. Optional (requires owner_table).
//
// Auth: PI/API-key gate (same as /api/mutations -- this is a PB-facing endpoint).
//
// Decision doc: Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md

import type { Env } from '../types';
import { json, error, isPiRequest } from '../helpers';

// Columns returned to the sync pull leg -- matches brain.db links columns that
// are identity-mapped to Hub (omits brain.db-local bookkeeping: sync_status,
// local_version, synced_at).
const LINKS_SELECT_COLS = [
  'id', 'owner_table', 'owner_id', 'role', 'type',
  'canonical_url', 'short_title', 'source_raw', 'sort_order',
  'deleted_at', 'seq', 'last_mutation_id',
  'created_at', 'updated_at',
].join(', ');

export async function handleGetLinks(url: URL, request: Request, env: Env): Promise<Response> {
  // PI/API-key gate -- links are PB-owned data; restrict to the sync lane.
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden -- PI access only', 403);
  }

  const seqAfterRaw = url.searchParams.get('seq_after');
  const limitRaw = url.searchParams.get('limit');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const ownerTable = url.searchParams.get('owner_table');
  const ownerId = url.searchParams.get('owner_id');

  // Validate seq_after.
  let seqAfter = 0;
  if (seqAfterRaw !== null) {
    seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
  }

  // Validate owner_table if provided.
  if (ownerTable && ownerTable !== 'tasks' && ownerTable !== 'projects') {
    return error("owner_table must be 'tasks' or 'projects'", 400);
  }

  // Cap limit (default 2000, max 5000 -- mirrors tasks pull handler).
  const limit = limitRaw
    ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000)
    : 2000;

  // Build query. include_deleted controls tombstone visibility; sync pull
  // always sends include_deleted=1 so it can mirror deletions.
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }
  if (seqAfter > 0) {
    conditions.push('seq > ?');
    params.push(seqAfter);
  }
  if (ownerTable) {
    conditions.push('owner_table = ?');
    params.push(ownerTable);
  }
  if (ownerId) {
    conditions.push('owner_id = ?');
    params.push(ownerId);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // ORDER BY seq ASC preserves the pull-cursor contract: clients advance their
  // local cursor to the max seq in the returned batch (same as tasks/projects).
  const query = `SELECT ${LINKS_SELECT_COLS} FROM links ${whereClause} ORDER BY seq ASC LIMIT ?`;
  params.push(limit);

  try {
    const result = await env.DB.prepare(query).bind(...params).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    return json({ data: rows, count: rows.length });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // Table-not-found: migration not yet applied to this environment.
    if (/no such table/i.test(msg)) {
      return json({ data: [], count: 0 });
    }
    console.error('handleGetLinks error:', msg);
    return error(`DB error: ${msg}`, 500);
  }
}
