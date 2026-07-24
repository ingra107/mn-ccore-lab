// W2a — inbox_events sync routes.
//
// Three endpoints mirror the tasks.ts pattern (handleGetTasks +
// handleSyncBulkTasks + handleDeleteTask) but for the inbox_events table.
// Schema v57 (2026-04-29) created the table; this route ships the API
// surface so brain.db sync can round-trip a captured event end-to-end.
//
// Endpoints:
//   GET    /api/inbox-events?seq_after=N        — pull list_since
//   POST   /api/inbox-events                    — browser single-capture (A2 wave 3)
//   POST   /api/inbox-events/sync-bulk          — push bulk upsert
//   POST   /api/inbox-events/:id/delete         — soft-delete tombstone
//
// Per-row freshness guard + per-row status (CX-A2 pattern from tasks.ts)
// so brain.db's IdentityBoundary.mark_synced_upsert refuses to mark
// rejected-stale rows synced.

import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity, isPiRequest, generateId, resolveActor } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';
import { postActivityEntry } from '../lib/activity-entry';
import { HERMES_DETECT_RE } from '../lib/hermes-mention';
import { ctDateString } from '../lib/ct-date';

// A typed @hermes in a capture is a QUESTION, not a note to file (PB backlog
// #907). The browser capture boxes intercept it client-side and route it to the
// day feed; a producer that does NOT run the Hub bundle -- the mobile PWA, an
// integration -- reaches this endpoint instead, where the ask used to land as an
// untriaged row and die with no answer AND no error. Nick lost two that way on
// 2026-07-23. The silent half is the damage, not the missing feature.
//
// Why this was not simply "detect and dispatch": sync-bulk is a BULK, REPLAYABLE
// upsert, so a naive detect re-fires Hermes on every backfill, retry and full
// resync. Three guards make a dispatch happen at most once per capture:
//
//   1. FIRST ARRIVAL ONLY -- keyed off the pre/post-write id diff the handler
//      already computes. `pre === undefined` is precisely "this id did not exist
//      before this request", so the client-supplied event id IS the idempotency
//      key. A replay takes the ON CONFLICT UPDATE path and can never be a first
//      arrival.
//   2. NEVER ON A FULL RESYNC -- `clear_existing` truncates the table first, so
//      every row would look new. That is a resync, not fresh captures.
//   3. FRESH CAPTURES ONLY -- a machine pushing a local backlog would otherwise
//      fire every historical @hermes note at once.
//
// A failed dispatch NEVER fails the sync: the row is already durably stored, and
// losing the answer must not also lose the note.
const HERMES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Civil YYYY-MM-DD day-feed key from an ISO capture stamp, in the LAB's
 * timezone.
 *
 * MUST be America/Chicago, not UTC. The Today feed is keyed by the browser's
 * LOCAL day (`todayKey()` in src/lib/taskGrouping.ts), so a UTC key silently
 * files every evening-CDT capture under TOMORROW, where it never appears on
 * Today -- the same invisible-misroute this whole fix exists to end. Caught by
 * a live probe at 20:31 CDT that landed on 2026-07-24.
 */
function dayKeyFromCapture(capturedAt: string | null | undefined): string {
  const parsed = capturedAt ? new Date(capturedAt) : new Date();
  return ctDateString(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
}

/** Guard 3. An unparseable or absent stamp means "now" -- the common case. */
function isFreshCapture(capturedAt: string | null | undefined): boolean {
  if (!capturedAt) return true;
  const t = new Date(capturedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= HERMES_MAX_AGE_MS;
}

const INBOX_EVENT_ALLOWED_SOURCES = new Set([
  'telegram', 'gmail', 'hub_pwa', 'file_watcher', 'pomodoro',
  'chat', 'today_md', 'hub_ui',
]);

// GET /api/inbox-events
//   PI-or-API-key gate: inbox_events contain raw_payload_json and notes
//   fields that are private to Nick's capture pipeline. Team JWT callers → 403.
//   API-key callers (PB sync) are granted access via isPiRequest Bearer check.
//   ?seq_after=N        — switches to seq-cursor mode (ORDER BY seq ASC, LIMIT)
//   ?include_deleted=1  — include soft-deletes (sync mirrors tombstones)
//   ?source=...         — UI filter
//   ?triaged=0|1        — UI filter (triaged_at IS NULL when 0)
//   ?limit=N            — default 2000 in seq mode, no cap otherwise
export async function handleInboxEvents(url: URL, env: Env, request: Request): Promise<Response> {
  // Z1.6 (2026-05-28): request is now required (was optional). The fail-closed
  // path collapses to the standard PI gate — callers MUST forward the raw
  // request. defineRoute() registration in api/index.ts already does this
  // unconditionally via R(c).
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
  const seqAfterRaw = url.searchParams.get('seq_after');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const source = url.searchParams.get('source');
  const triagedRaw = url.searchParams.get('triaged');
  const limitRaw = url.searchParams.get('limit');

  const deletedFilter = includeDeleted ? '1=1' : 'deleted_at IS NULL';
  // Explicit column list (not SELECT *) — Z3.3 lint compliance. This route is
  // PI-only gated and legitimately returns raw_payload_json + notes to Nick.
  // safeRow would strip them, so we use an explicit projection instead.
  let query = `SELECT id, source, source_external_id, raw_text, raw_payload_json,
    raw_hash, suggested_project_id, suggested_action, confidence,
    captured_at, triaged_at, triage_outcome, resulting_task_id, triaged_by,
    notes, last_mutation_id, seq, deleted_at, updated_at, created_at
    FROM inbox_events WHERE ${deletedFilter}`;
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
//
// PI-or-API-key gate (M-2): mirrors the PI gate on the GET sibling.
// raw_payload_json/notes fields are private to Nick's capture pipeline;
// team JWT callers must NOT write to them.  API-key (PB sync) path is
// granted access via isPiRequest's Bearer check.
export async function handleSyncBulkInboxEvents(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
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
  // #907 guard 1+2+3: collected during the write loop, dispatched after it, so a
  // Hermes failure can never roll back or delay a durable capture.
  const hermesAsks: Array<{ id: string; text: string; day: string }> = [];

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
        // #907: FIRST ARRIVAL of this id -- the only point at which a capture
        // can be new. Guard 2 (`clear_existing`) and guard 3 (freshness) sit
        // alongside it; see the block comment at the top of this file.
        const askText = e.raw_text ?? '';
        if (
          !body.clear_existing
          && HERMES_DETECT_RE.test(askText)
          && isFreshCapture(e.captured_at)
        ) {
          hermesAsks.push({ id: e.id, text: askText, day: dayKeyFromCapture(e.captured_at) });
        }
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

  // #907: dispatch AFTER every write has landed. The capture is already durable
  // at this point, so a Hermes outage costs the answer, never the note.
  const hermes: Array<{ client_id: string; dispatched: boolean; reason?: string }> = [];
  if (hermesAsks.length) {
    const actor = await resolveActor(env, user, undefined, { allowImpersonation: true });
    const actorSlug = 'error' in actor ? null : actor.slug;
    for (const ask of hermesAsks) {
      if (!actorSlug) {
        hermes.push({ client_id: ask.id, dispatched: false, reason: 'actor_unresolved' });
        continue;
      }
      try {
        // Same lane the browser boxes use: the body goes VERBATIM (token
        // intact) to the day feed, whose HERMES_DETECT_RE fires the in-thread
        // answer. Day threads default private.
        const posted = await postActivityEntry({
          env,
          user,
          entityType: 'day',
          entityId: ask.day,
          kind: 'comment',
          body: ask.text,
          actorSlug,
          visibility: 'author',
        });
        hermes.push(
          posted.ok
            ? { client_id: ask.id, dispatched: posted.hermes?.dispatched ?? true, reason: posted.hermes?.reason }
            : { client_id: ask.id, dispatched: false, reason: posted.error },
        );
      } catch (err) {
        console.error('inbox-events: @hermes dispatch failed:', err);
        hermes.push({ client_id: ask.id, dispatched: false, reason: 'dispatch_threw' });
      }
    }
  }

  await logActivity(
    env, 'sync',
    `Bulk sync: ${inserted}/${body.events.length} inbox_events applied (${rejectedStale} rejected stale)`
      + (hermes.length ? `; ${hermes.filter(h => h.dispatched).length}/${hermes.length} @hermes dispatched` : ''),
    user.email, null, null,
  );

  return json({
    data: {
      ok: true,
      inserted,
      rejected_stale: rejectedStale,
      results,
      // Present only when a capture carried @hermes, so the caller can surface
      // the outcome instead of the ask dying silently -- the #907 complaint.
      ...(hermes.length ? { hermes } : {}),
    },
  });
}

// POST /api/inbox-events — browser-facing single-capture endpoint.
//
// Auth: 'authed' (CF-Access browser JWT OR Bearer API key). NOT PI-gated:
// any authenticated Hub user can capture a note (e.g. from the Today-bar).
//
// Body: { raw_text: string, source?: string }
//   source defaults to 'hub_ui'; must be in INBOX_EVENT_ALLOWED_SOURCES.
//
// seq advance: automatic via trg_inbox_events_seq_insert (schema-v57):
//   AFTER INSERT WHEN NEW.seq = 0 → sets seq = MAX(seq)+1.
//   Plain INSERT omits seq → DEFAULT 0 → trigger fires. Row is immediately
//   pull-visible to PB sync (GET /api/inbox-events?seq_after=N).
export async function handleCreateInboxEvent(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { raw_text?: unknown; source?: unknown };

  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : '';
  if (!rawText) {
    return error('raw_text is required and must be non-empty', 400);
  }

  const source = typeof body.source === 'string' ? body.source : 'hub_ui';
  if (!INBOX_EVENT_ALLOWED_SOURCES.has(source)) {
    return error(
      `unknown source "${source}"; allowed: ${Array.from(INBOX_EVENT_ALLOWED_SOURCES).join(', ')}`,
      400,
    );
  }

  const id = generateId('inbox_event');
  await env.DB.prepare(
    `INSERT INTO inbox_events (id, source, raw_text, captured_at, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
  ).bind(id, source, rawText).run();

  const row = await env.DB.prepare(
    `SELECT id, source, raw_text, captured_at, seq, created_at, updated_at
     FROM inbox_events WHERE id = ?`
  ).bind(id).first();

  return json({ data: row }, 201);
}

// POST /api/inbox-events/:id/delete — soft-delete tombstone.
// Note: idempotentDelete soft mode sets deleted_at only (not updated_at).
// The sync layer detects deletions via deleted_at IS NOT NULL in the seq-cursor
// pull (handleInboxEvents ?include_deleted=1), so the updated_at omission is
// intentional — the seq column advances on write via the outbox lane, not here.
export async function handleDeleteInboxEvent(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  return idempotentDelete({
    table: 'inbox_events',
    id,
    mode: 'soft',
    request,
    env,
    actorSlug: user.email,
    activityCategory: 'inbox_event',
    activityEntityType: 'inbox_event',
    gateProject: false, // inbox_events has no project_id column
  });
}
