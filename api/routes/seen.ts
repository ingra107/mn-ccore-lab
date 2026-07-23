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
//                          title, project_slug}] for task/project/day rows,
//                          PLUS meeting rows {entity_type: 'meeting',
//                          entity_id, never_seen, latest_at, title,
//                          project_slug: null} — meetings have no
//                          activity_entries feed, so "unseen" is just (no
//                          seen row) OR (updated_at > last_seen_at), with
//                          never_seen=1 marking the former (2026-07-07,
//                          task T11). A 'day' row's own private (@me) Hermes
//                          answer badges via a THIRD arm below (§9.5.1) —
//                          see that arm's comment for the ownership model.
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
import { json, error, actorSlugFromRequest } from '../helpers';

const SEEN_TYPES = new Set(['task', 'project', 'meeting', 'day']);

// #99 / §9.5.1 recency bound for the Hermes arm (reads activity_entries — see
// the arm below). That arm LEFT JOINs entity_seen (asking a question is intent
// to hear the answer, so a never-opened task still signals), which without a
// bound would let a cold start badge every Hermes answer ever given. Same role
// as MEETING_NEVER_SEEN_PAYLOAD_CAP_DAYS below.
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
    return error("entity_type ('task'|'project'|'meeting'|'day') and entity_id required", 400);
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
      // #99 / §9.5.1 — Hermes answers on the REQUESTER'S OWN private (@me)
      // thread. Phase 5 moved typed @hermes off ai_requests onto
      // activity_entries: a private ask now writes visibility='author', which
      // the plain team arm above deliberately EXCLUDES (visibility='team'), so
      // a private Hermes answer badged NOTHING the day that shipped — the same
      // structural-incapability shape as the original bug #99, recurring in the
      // new store. This arm reads activity_entries directly, keyed on the reply
      // row Hermes itself writes (see api/lib/activity-entry.ts dispatchHermes /
      // api/routes/ai-requests.ts handleUpdateAIResponse):
      //   - reply.actor_slug = 'claude-ai' AND reply.parent_id IS NOT NULL — a
      //     reply Hermes wrote. handleUpdateAIResponse UPDATEs this row's body
      //     in place when the answer lands rather than inserting a new one, so
      //     the row's id (and created_at) is fixed at ASK time, not answer
      //     time. schema-v103's `answered_at` (set by that same UPDATE, or by
      //     a follow-up UPDATE on the fallback INSERT path) fixes this: every
      //     recency/ordering use below reads COALESCE(reply.answered_at,
      //     reply.created_at), never bare created_at, so a mark-seen between
      //     ask and answer no longer swallows the badge, a >30-day-late answer
      //     is no longer dropped by the cap, and latest_at reflects answer
      //     time. NULL answered_at (pre-v103 rows) falls back to created_at —
      //     unchanged behavior for anything Hermes hasn't touched since.
      //   - reply.body NOT LIKE the pending-placeholder text — a thread Hermes
      //     hasn't answered YET must not badge (a bare ask ≠ an answer). Matches
      //     activity-entry.ts's HERMES_PENDING_BODY = 'Thinking about this...
      //     (AI response pending)' ("one literal, N consumers — do not reword
      //     without updating all of them"; ai-requests.ts's placeholder lookup
      //     uses the same LIKE-prefix convention rather than importing the
      //     const, so this is consistent with existing practice, not a new one).
      //   - the OWNERSHIP guard — THE WHOLE POINT, PRIVACY-CRITICAL:
      //     root.visibility = 'author' AND root.actor_slug = viewer. A reply
      //     inherits author-only visibility from its root (activity-entry.ts
      //     postActivityEntry's parent-resolution block, and
      //     activityVisibilityGate's rootColumn arm read the same way), so ONLY
      //     the person who authored the private root may ever see Hermes's
      //     answer to it — a different viewer gets zero rows, never a peek.
      //     A TEAM-visible root's Hermes reply also inherits 'team' (not
      //     'author'), so it is already picked up by the plain arm above; this
      //     arm and that one are mutually exclusive by construction and are
      //     never double-counted by the merge step below.
      //   - both hidden_at guards (reply's AND root's) — hidden_at is a THREAD
      //     property (root + every child share one value, updated together —
      //     see activityHiddenClause's doc comment), so either alone is
      //     logically sufficient; both are written so
      //     scripts/check-activity-reads.mjs's guards-per-read count (2 reads:
      //     FROM + JOIN) passes without leaning on that invariant forever.
      //   - scoped to root.entity_type IN ('task','day') — the two surfaces
      //     that currently render this badge (My-Tasks/task-row, and the Today
      //     nav). A private @me Hermes ask under a project/artifact thread
      //     wasn't badged by the old ai_requests arm either (it only ever
      //     joined tasks) — unchanged scope, not a new gap.
      //
      // LEFT JOIN entity_seen, unlike the task/project arm's INNER JOIN: asking
      // a question is itself intent to hear the answer, so a task/day you never
      // opened still signals. The recency bound stops a cold start from
      // resurrecting every private answer ever given, mirroring the meetings
      // never_seen arm.
      env.DB.prepare(
        `SELECT root.entity_type AS entity_type,
                root.entity_id AS entity_id,
                COUNT(*) AS new_count,
                MAX(COALESCE(reply.answered_at, reply.created_at)) AS latest_at,
                CASE WHEN root.entity_type = 'task'
                     THEN COALESCE(t.short_title, t.title)
                     ELSE NULL END AS title,
                NULL AS project_slug
         FROM activity_entries reply
         JOIN activity_entries root
           ON root.id = reply.parent_id
          AND root.visibility = 'author'
          AND root.actor_slug = ?
          AND root.entity_type IN ('task', 'day')
          AND root.hidden_at IS NULL
         LEFT JOIN tasks t ON root.entity_type = 'task' AND t.id = root.entity_id
         LEFT JOIN entity_seen es
           ON es.entity_type = root.entity_type AND es.entity_id = root.entity_id
          AND es.viewer_slug = ?
         WHERE reply.actor_slug = 'claude-ai'
           AND reply.parent_id IS NOT NULL
           AND reply.hidden_at IS NULL
           AND reply.body NOT LIKE 'Thinking about this%'
           AND (root.entity_type != 'task' OR t.deleted_at IS NULL)
           AND COALESCE(reply.answered_at, reply.created_at) > datetime('now', ?)
           AND (es.last_seen_at IS NULL OR COALESCE(reply.answered_at, reply.created_at) > es.last_seen_at)
         GROUP BY root.entity_type, root.entity_id
         ORDER BY latest_at DESC`
      ).bind(
        viewer,
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
