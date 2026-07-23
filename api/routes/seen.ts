// api/routes/seen.ts — per-viewer seen tracking (schema v81, 2026-06-11).
//
// Two DISTINCT attention signals (Nick: "a new task assignment is different
// vs new activity on a task or project"):
//   • NEW (gold)       = assigned to you, never opened — tasks.acknowledged_at,
//                        handled by the acknowledge lane, NOT here.
//   • new activity (●) = an entity you HAVE seen has team-visible
//                        activity_entries by OTHERS newer than your last look.
//
// POST /api/seen           {entity_type, entity_id} → upsert last_seen_at=now.
//                          Fired by every detail-open (task panel/drawer,
//                          ProjectDetail, meeting notes) — the act of looking
//                          IS the mark.
// GET  /api/seen/unseen    → [{entity_type, entity_id, new_count, latest_at,
//                          title, project_slug}] for task/project rows, PLUS
//                          meeting rows {entity_type: 'meeting', entity_id,
//                          never_seen, latest_at, title, project_slug: null}
//                          — meetings have no activity_entries feed, so
//                          "unseen" is just (no seen row) OR (updated_at >
//                          last_seen_at), with never_seen=1 marking the
//                          former (2026-07-07, task T11).
//
// Both endpoints are FAIL-SOFT pre-migration: if entity_seen doesn't exist on
// this DB yet, GET returns an empty list and POST no-ops — so the worker can
// deploy ahead of the prod migration without 500s.
//
// #740 (2026-07-16, backend half of #548): #548 added a CLIENT-side recency
// cap (src/lib/seen.ts MEETING_UNSEEN_RECENCY_CAP_DAYS=14) that filters the
// cold-start never_seen-meeting flood in the browser — it bounds what the
// browser PROCESSES, not what this route SHIPS over the wire. Every
// never-opened meeting since the dawn of the table was still being
// serialized into the response on every poll. MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS
// below bounds the payload at the SQL layer, mirroring the client window
// with margin (see the constant's own comment for why margin, and why the
// bound applies ONLY to the never_seen=1 arm).

import type { Env } from '../helpers';
import { json, error, actorSlugFromRequest, getAuthUser } from '../helpers';

const SEEN_TYPES = new Set(['task', 'project', 'meeting']);

// #99 recency bound for the Hermes arm. That arm LEFT JOINs entity_seen (asking
// a question is intent to hear the answer, so a never-opened task still
// signals), which without a bound would let a cold start badge every Hermes
// answer ever given. Same role as MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS below.
const HERMES_UNSEEN_CAP_DAYS = 30;

// Server-side payload bound for the never_seen (cold-start, no entity_seen
// row) meetings arm. Mirrors src/lib/seen.ts's MEETING_UNSEEN_RECENCY_CAP_DAYS
// (14, #548) but wider — the server bound must be a SUPERSET of what the
// client keeps, never narrower, because the client's own filter is what
// actually decides badging; the server's job here is only to stop shipping
// years-old never-opened meetings over the wire on every poll. The margin
// (30 vs 14) absorbs clock skew between D1's datetime('now') and the
// browser's Date.now(), plus room for the client cap to widen later without
// this bound silently starving it. Applies ONLY to never_seen=1 rows — a
// previously-seen meeting with new activity since last look has NO recency
// cap on either side (#548's client filter doesn't touch it either): that's
// a legitimate, unbounded-recency "new activity" signal, not the cold-start
// flood this exists to bound.
const MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS = 30;

export async function handleMarkSeen(request: Request, env: Env): Promise<Response> {
  const viewer = await actorSlugFromRequest(request, env);
  if (!viewer) return error('Authentication required', 401);
  const body = await request.json().catch(() => ({})) as { entity_type?: string; entity_id?: string };
  const entityType = body.entity_type ?? '';
  const entityId = body.entity_id ?? '';
  if (!SEEN_TYPES.has(entityType) || !entityId) {
    return error("entity_type ('task'|'project'|'meeting') and entity_id required", 400);
  }
  try {
    await env.DB.prepare(
      `INSERT INTO entity_seen (entity_type, entity_id, viewer_slug, last_seen_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(entity_type, entity_id, viewer_slug) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    ).bind(entityType, entityId, viewer).run();
    return json({ data: { ok: true } });
  } catch (e) {
    console.error('handleMarkSeen failed (entity_seen missing pre-migration?):', e);
    return json({ data: { ok: false } });
  }
}

export async function handleGetUnseenActivity(request: Request, env: Env): Promise<Response> {
  const viewer = await actorSlugFromRequest(request, env);
  if (!viewer) return json({ data: [], count: 0 });
  // #99: ai_requests.requested_by stores the EMAIL the ask was made with, while
  // every other table here keys on the canonical slug. Both are matched so a row
  // written through either shape still reaches its own author.
  const viewerEmail = (await getAuthUser(request, env))?.email ?? viewer;
  try {
    const [taskProjectRows, meetingRows, hermesRows] = await Promise.all([
      env.DB.prepare(
        `SELECT es.entity_type, es.entity_id,
                COUNT(*) AS new_count,
                MAX(ae.created_at) AS latest_at,
                CASE WHEN es.entity_type = 'task'
                     THEN COALESCE(t.short_title, t.title)
                     ELSE COALESCE(p.short_name, p.title) END AS title,
                p.slug AS project_slug
         FROM entity_seen es
         JOIN activity_entries ae
           ON ae.entity_type = es.entity_type AND ae.entity_id = es.entity_id
          AND ae.visibility = 'team'
          AND ae.hidden_at IS NULL
          AND ae.actor_slug != es.viewer_slug
          AND ae.created_at > es.last_seen_at
         LEFT JOIN tasks t ON es.entity_type = 'task' AND t.id = es.entity_id
         LEFT JOIN projects p ON es.entity_type = 'project' AND p.id = es.entity_id
         WHERE es.viewer_slug = ?
           AND (es.entity_type != 'task' OR t.deleted_at IS NULL)
           AND (es.entity_type != 'project' OR p.deleted_at IS NULL)
         GROUP BY es.entity_type, es.entity_id
         ORDER BY latest_at DESC`
      ).bind(viewer).all(),
      // Meetings have no activity_entries feed — "unseen" is a direct
      // updated_at vs last_seen_at compare, with never_seen=1 when no seen
      // row exists yet (LEFT JOIN, not the INNER JOIN above).
      //
      // #740: the never_seen=1 arm (no entity_seen row at all) is additionally
      // bound to MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS — without it this arm is
      // an unbounded LEFT JOIN over every never-opened meeting ever. The
      // already-seen arm (es.last_seen_at IS NOT NULL) is deliberately left
      // uncapped — "new activity since I last looked" has no natural staleness
      // window and #548's client-side cap doesn't touch it either.
      env.DB.prepare(
        `SELECT 'meeting' AS entity_type, m.id AS entity_id,
                CASE WHEN es.last_seen_at IS NULL THEN 1 ELSE 0 END AS never_seen,
                m.updated_at AS latest_at, m.title, NULL AS project_slug
         FROM meetings m
         LEFT JOIN entity_seen es
           ON es.entity_type = 'meeting' AND es.entity_id = m.id AND es.viewer_slug = ?
         WHERE m.notes IS NOT NULL
           AND (
             (es.last_seen_at IS NULL AND m.updated_at > datetime('now', ?))
             OR (es.last_seen_at IS NOT NULL AND m.updated_at > es.last_seen_at)
           )
         ORDER BY latest_at DESC`
      ).bind(viewer, `-${MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS} days`).all(),
      // #99 — Hermes answers on a task. A typed "@hermes …" prefix in a task
      // composer does NOT write activity_entries: it routes to /api/ai-requests
      // as source_type='daily_thought' with a task_* source_id (see
      // src/lib/hermesRouting.ts), read back by TaskHermesReplies. The two arms
      // above only ever look at activity_entries, so a Hermes answer was
      // STRUCTURALLY incapable of producing a signal — you asked, it answered,
      // and nothing anywhere said so. That is bug #99.
      //
      // Scoped to the ASKER. ai_requests has no visibility column, so requester
      // identity is the only privacy model available; badging someone else's
      // exchange would both leak it and be meaningless to them.
      //
      // LEFT JOIN, unlike the task/project arm's INNER JOIN: asking a question
      // is itself intent to hear the answer, so a task you never opened still
      // signals. The recency bound stops a cold start from resurrecting every
      // answer ever given, mirroring the meetings never_seen arm.
      env.DB.prepare(
        `SELECT 'task' AS entity_type, ar.source_id AS entity_id,
                COUNT(*) AS new_count,
                MAX(ar.responded_at) AS latest_at,
                COALESCE(t.short_title, t.title) AS title,
                NULL AS project_slug
         FROM ai_requests ar
         JOIN tasks t ON t.id = ar.source_id AND t.deleted_at IS NULL
         LEFT JOIN entity_seen es
           ON es.entity_type = 'task' AND es.entity_id = ar.source_id AND es.viewer_slug = ?
         WHERE ar.source_type = 'daily_thought'
           AND ar.status = 'completed'
           AND ar.responded_at IS NOT NULL
           AND (lower(ar.requested_by) = lower(?) OR lower(ar.requested_by) = lower(?))
           AND ar.responded_at > datetime('now', ?)
           AND (es.last_seen_at IS NULL OR ar.responded_at > es.last_seen_at)
         GROUP BY ar.source_id
         ORDER BY latest_at DESC`
      ).bind(
        viewer,
        viewerEmail,
        viewer,
        `-${HERMES_UNSEEN_CAP_DAYS} days`,
      ).all(),
    ]);
    // meetings has no deleted_at column (checked v2..v95) — if soft-delete
    // lands there later, this arm needs the same guard as t/p.deleted_at above.
    // Re-sort the merged arms globally: each arm is ordered internally, but
    // concatenation alone would rank every task/project above every meeting.
    // #99: the activity arm and the Hermes arm can BOTH report the same task —
    // new comments and a new Hermes answer on one row. They must be COLLAPSED
    // here, because the client maps rows by entity_id (useEntitySeen.ts:62-65),
    // so two rows for one task would silently drop one signal; and since the
    // list is sorted newest-first, the surviving one would be the OLDER. Sum the
    // counts, keep the latest timestamp, and the badge stays honest: what it
    // claims is what is actually new (Rule 73 badge honesty).
    type UnseenRow = { entity_type?: string; entity_id?: string; new_count?: number; latest_at?: string };
    const merged = new Map<string, UnseenRow>();
    const ordered: UnseenRow[] = [];
    for (const row of [
      ...(taskProjectRows.results ?? []),
      ...(meetingRows.results ?? []),
      ...(hermesRows.results ?? []),
    ] as UnseenRow[]) {
      const key = `${row.entity_type}:${row.entity_id}`;
      const prior = merged.get(key);
      if (!prior) {
        merged.set(key, { ...row });
        ordered.push(merged.get(key)!);
        continue;
      }
      prior.new_count = (prior.new_count ?? 0) + (row.new_count ?? 0);
      if (String(row.latest_at ?? '') > String(prior.latest_at ?? '')) prior.latest_at = row.latest_at;
    }
    // Re-sort the merged arms globally: each arm is ordered internally, but
    // concatenation alone would rank every task/project above every meeting.
    const data = ordered.sort((a, b) =>
      String(b.latest_at ?? '').localeCompare(String(a.latest_at ?? '')));
    return json({ data, count: data.length });
  } catch (e) {
    console.error('handleGetUnseenActivity failed (entity_seen missing pre-migration?):', e);
    return json({ data: [], count: 0 });
  }
}
