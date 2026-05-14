// W2a — inbox_events sync routes.
//
// Three endpoints mirror the tasks.ts pattern (handleGetTasks +
// handleSyncBulkTasks + handleDeleteTask) but for the inbox_events table.
// Schema v57 (2026-04-29) created the table; this route ships the API
// surface so brain.db sync can round-trip a captured event end-to-end.
//
// Endpoints:
//   GET    /api/inbox-events?seq_after=N        — pull list_since
//   POST   /api/inbox-events/sync-bulk          — push bulk upsert
//   POST   /api/inbox-events/:id/delete         — soft-delete tombstone
//
// Per-row freshness guard + per-row status (CX-A2 pattern from tasks.ts)
// so brain.db's IdentityBoundary.mark_synced_upsert refuses to mark
// rejected-stale rows synced.

import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity } from '../helpers';

const INBOX_EVENT_ALLOWED_SOURCES = new Set([
  'telegram', 'gmail', 'hub_pwa', 'file_watcher', 'pomodoro',
  'chat', 'today_md', 'hub_ui',
]);

// GET /api/inbox-events
//   ?seq_after=N        — switches to seq-cursor mode (ORDER BY seq ASC, LIMIT)
//   ?include_deleted=1  — include soft-deletes (sync mirrors tombstones)
//   ?source=...         — UI filter
//   ?triaged=0|1        — UI filter (triaged_at IS NULL when 0)
//   ?limit=N            — default 2000 in seq mode, no cap otherwise
export async function handleInboxEvents(url: URL, env: Env): Promise<Response> {
  const seqAfterRaw = url.searchParams.get('seq_after');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const source = url.searchParams.get('source');
  const triagedRaw = url.searchParams.get('triaged');
  const limitRaw = url.searchParams.get('limit');

  const deletedFilter = includeDeleted ? '1=1' : 'deleted_at IS NULL';
  let query = `SELECT * FROM inbox_events WHERE ${deletedFilter}`;
  const params: (string | number)[] = [];

  if (seqAfterRaw !== null) {
    const seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
    query += ' AND seq > ?';
    params.push(seqAfter);
  }

  if (source) { query += ' AND source = ?'; params.push(source); }
  if (triagedRaw === '0') {
    query += ' AND triaged_at IS NULL';
  } else if (triagedRaw === '1') {
    query += ' AND triaged_at IS NOT NULL';
  }

  if (seqAfterRaw !== null) {
    const limit = limitRaw
      ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000)
      : 2000;
    query += ' ORDER BY seq ASC LIMIT ?';
    params.push(limit);
  } else {
    query += ' ORDER BY captured_at DESC';
    if (limitRaw) {
      const lim = Math.min(Math.max(Number.parseInt(limitRaw, 10) || 100, 1), 5000);
      query += ' LIMIT ?';
      params.push(lim);
    }
  }

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results?.length ?? 0 });
}

// POST /api/inbox-events/sync-bulk
//
// Mirrors handleSyncBulkTasks (CX-A2 per-row status + freshness guard). A
// stale client (older client_updated_at than the row's existing updated_at)
// is rejected via the WHERE clause; the response status flips to
// 'rejected_stale' so brain.db's IdentityBoundary doesn't mark it synced.
export async function handleSyncBulkInboxEvents(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    events: Array<{
      id: string;
      source: string;
      source_external_id?: string | null;
      raw_text?: string | null;
      raw_payload_json?: string | null;
      raw_hash?: string | null;
      suggested_project_id?: string | null;
      suggested_action?: string | null;
      confidence?: number | null;
      captured_at?: string | null;
      triaged_at?: string | null;
      triage_outcome?: string | null;
      resulting_task_id?: string | null;
      triaged_by?: string | null;
      notes?: string | null;
      client_updated_at?: string | null;
      created_at?: string | null;
    }>;
    clear_existing?: boolean;
  };

  if (!body.events?.length) return error('events array required', 400);
  if (body.clear_existing) {
    await env.DB.prepare('DELETE FROM inbox_events').run();
  }

  // Validate source enum up-front so a bad payload short-circuits with 400.
  for (const e of body.events) {
    if (!INBOX_EVENT_ALLOWED_SOURCES.has(e.source)) {
      return error(
        `event ${e.id}: unknown source ${e.source}; allowed: ${Array.from(INBOX_EVENT_ALLOWED_SOURCES).join(',')}`,
        400,
      );
    }
  }

  const BATCH_SIZE = 50;
  let inserted = 0;
  let rejectedStale = 0;
  const results: Array<{ client_id: string; status: string; reason?: string }> = [];

  for (let i = 0; i < body.events.length; i += BATCH_SIZE) {
    const batch = body.events.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const preRows = await env.DB.prepare(
      `SELECT id, updated_at FROM inbox_events WHERE id IN (${placeholders})`
    ).bind(...batch.map(e => e.id)).all<{ id: string; updated_at: string | null }>();
    const preState = new Map<string, string | null>(
      (preRows.results || []).map(r => [r.id, r.updated_at])
    );

    const stmts = batch.map(e =>
      env.DB.prepare(
        `INSERT INTO inbox_events (
           id, source, source_external_id, raw_text, raw_payload_json, raw_hash,
           suggested_project_id, suggested_action, confidence,
           captured_at, triaged_at, triage_outcome, resulting_task_id, triaged_by,
           notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           source_external_id = excluded.source_external_id,
           raw_text = COALESCE(excluded.raw_text, inbox_events.raw_text),
           raw_payload_json = COALESCE(excluded.raw_payload_json, inbox_events.raw_payload_json),
           raw_hash = COALESCE(excluded.raw_hash, inbox_events.raw_hash),
           suggested_project_id = excluded.suggested_project_id,
           suggested_action = excluded.suggested_action,
           confidence = excluded.confidence,
           captured_at = excluded.captured_at,
           triaged_at = excluded.triaged_at,
           triage_outcome = excluded.triage_outcome,
           resulting_task_id = excluded.resulting_task_id,
           triaged_by = excluded.triaged_by,
           notes = excluded.notes,
           updated_at = COALESCE(excluded.updated_at, datetime('now'))
         WHERE inbox_events.updated_at IS NULL
            OR excluded.updated_at IS NULL
            OR excluded.updated_at >= inbox_events.updated_at`
      ).bind(
        e.id, e.source, e.source_external_id ?? null,
        e.raw_text ?? null, e.raw_payload_json ?? null, e.raw_hash ?? null,
        e.suggested_project_id ?? null, e.suggested_action ?? null, e.confidence ?? null,
        e.captured_at ?? null, e.triaged_at ?? null, e.triage_outcome ?? null,
        e.resulting_task_id ?? null, e.triaged_by ?? null,
        e.notes ?? null, e.created_at ?? null,
        e.client_updated_at ?? null,
      )
    );
    await env.DB.batch(stmts);

    const postRows = await env.DB.prepare(
      `SELECT id, updated_at FROM inbox_events WHERE id IN (${placeholders})`
    ).bind(...batch.map(e => e.id)).all<{ id: string; updated_at: string | null }>();
    const postState = new Map<string, string | null>(
      (postRows.results || []).map(r => [r.id, r.updated_at])
    );

    for (const e of batch) {
      const post = postState.get(e.id);
      if (post === undefined) {
        results.push({ client_id: e.id, status: 'error', reason: 'row_absent_post_write' });
        continue;
      }
      const pre = preState.get(e.id);
      if (pre === undefined) {
        inserted += 1;
        results.push({ client_id: e.id, status: 'inserted' });
        continue;
      }
      if (post === pre) {
        rejectedStale += 1;
        const sentTs = e.client_updated_at ?? null;
        results.push({
          client_id: e.id,
          status: 'rejected_stale',
          reason: sentTs && pre ? `client=${sentTs} hub=${pre}` : 'no_update_applied',
        });
      } else {
        inserted += 1;
        results.push({ client_id: e.id, status: 'updated' });
      }
    }
  }

  await logActivity(
    env, 'sync',
    `Bulk sync: ${inserted}/${body.events.length} inbox_events applied (${rejectedStale} rejected stale)`,
    user.email, null, null,
  );

  return json({ data: { ok: true, inserted, rejected_stale: rejectedStale, results } });
}

// POST /api/inbox-events/:id/delete — soft-delete tombstone.
export async function handleDeleteInboxEvent(
  id: string,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id, deleted_at FROM inbox_events WHERE id = ?'
  ).bind(id).first<{ id: string; deleted_at: string | null }>();

  if (!existing) return error('inbox_event not found', 404);
  if (existing.deleted_at) {
    return json({ data: { ok: true, idempotent: true, id } });
  }

  await env.DB.prepare(
    "UPDATE inbox_events SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  await logActivity(env, 'inbox_event', `Deleted inbox_event`, user.email, id, 'inbox_event');
  return json({ data: { ok: true, id } });
}
