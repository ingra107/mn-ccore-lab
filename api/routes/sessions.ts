import type { Env } from '../helpers';
import { json, error } from '../helpers';

// Session row shape as stored in D1
export interface Session {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  context: string | null;
  projects_touched: string | null;
  skills_used: string | null;
  token_estimate: number | null;
  machine_id: string | null;
  seq: number;
  created_at: string;
  updated_at: string;
  last_mutation_id: string | null;
  deleted_at: string | null;
}

// GET /api/sessions?seq_after=N&limit=L
//
// Sync-cursor pull path for brain.db's hub.py post-Phase-2 cutover.
// When ?seq_after=N is present, filters seq > N, orders by seq ASC,
// applies limit (default 2000, max 5000). Returns the max seq in the
// result set as the next cursor for incremental pull.
//
// Tombstone filtering: rows with deleted_at IS NOT NULL are excluded (schema-v65+).
// No fixture filtering: sessions are not QA fixtures.
export async function handleGetSessions(url: URL, env: Env): Promise<Response> {
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

  const query = 'SELECT * FROM sessions WHERE seq > ? AND deleted_at IS NULL ORDER BY seq ASC LIMIT ?';
  const result = await env.DB.prepare(query).bind(seqAfter, limit).all<Session>();
  const rows = result.results ?? [];

  const cursor = rows.length > 0 ? rows[rows.length - 1].seq : seqAfter;
  const has_more = rows.length === limit;

  return json({ rows, cursor, has_more });
}
