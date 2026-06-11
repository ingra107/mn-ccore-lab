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
//                          ProjectDetail) — the act of looking IS the mark.
// GET  /api/seen/unseen    → [{entity_type, entity_id, new_count, latest_at,
//                          title, project_slug}] for the calling viewer.
//
// Both endpoints are FAIL-SOFT pre-migration: if entity_seen doesn't exist on
// this DB yet, GET returns an empty list and POST no-ops — so the worker can
// deploy ahead of the prod migration without 500s.

import type { Env } from '../helpers';
import { json, error, actorSlugFromRequest } from '../helpers';

const SEEN_TYPES = new Set(['task', 'project']);

export async function handleMarkSeen(request: Request, env: Env): Promise<Response> {
  const viewer = await actorSlugFromRequest(request, env);
  if (!viewer) return error('Authentication required', 401);
  const body = await request.json().catch(() => ({})) as { entity_type?: string; entity_id?: string };
  const entityType = body.entity_type ?? '';
  const entityId = body.entity_id ?? '';
  if (!SEEN_TYPES.has(entityType) || !entityId) {
    return error("entity_type ('task'|'project') and entity_id required", 400);
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
    const rows = await env.DB.prepare(
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
        AND ae.actor_slug != es.viewer_slug
        AND ae.created_at > es.last_seen_at
       LEFT JOIN tasks t ON es.entity_type = 'task' AND t.id = es.entity_id
       LEFT JOIN projects p ON es.entity_type = 'project' AND p.id = es.entity_id
       WHERE es.viewer_slug = ?
         AND (es.entity_type != 'task' OR t.deleted_at IS NULL)
         AND (es.entity_type != 'project' OR p.deleted_at IS NULL)
       GROUP BY es.entity_type, es.entity_id
       ORDER BY latest_at DESC`
    ).bind(viewer).all();
    const data = rows.results ?? [];
    return json({ data, count: data.length });
  } catch (e) {
    console.error('handleGetUnseenActivity failed (entity_seen missing pre-migration?):', e);
    return json({ data: [], count: 0 });
  }
}
