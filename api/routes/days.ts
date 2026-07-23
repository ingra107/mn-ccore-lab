// days.ts — the `day` entity feed (Hermes wave, Phase 3).
//
// A "day" is a civil-date bucket (YYYY-MM-DD) for Today-bar conversations. There
// is NO `days` table by design (§3.1): the date key IS its own existence proof,
// so postActivityEntry validates the SHAPE, and every reader here re-validates
// the date param against the same regex. project_id is always NULL for day rows,
// which structurally excludes them from every project-keyed reader (health,
// insights, project feed) — a Today-bar ask must never move a project score.
//
// The feed is shape-identical to the task/artifact activity feeds so the frontend
// reuses ActivityThread / ActivityEntryItem with no new renderer.

import type { Env, AuthUser } from '../helpers';
import { json, error, resolveActor, isPiRequest } from '../helpers';
import { activityVisibilityGate, activityHiddenClause, postActivityEntry } from '../lib/activity-entry';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/days/:date/activity — the day's conversation ROOTS (newest-first),
// each with a viewer-specific reply_count. Mirrors handleGetTaskActivity: two
// visibility gates (one per alias), ?include_hidden=1 as the "Show hidden"
// affordance, hidden_count for the reveal control. Day threads default PRIVATE,
// so the visibility gate means user X sees X's own day threads (+ any shared);
// the PI/API-key caller sees all (Rule 70).
export async function handleGetDayActivity(date: string, request: Request, env: Env): Promise<Response> {
  if (!DATE_RE.test(date)) return error('date must be a YYYY-MM-DD civil date', 400);
  const includeHidden = new URL(request.url).searchParams.get('include_hidden') === '1';
  const visAe = await activityVisibilityGate(request, env, 'ae');
  const visR = await activityVisibilityGate(request, env, 'r');
  const result = await env.DB.prepare(
    `SELECT ae.id, ae.entity_type, ae.entity_id, ae.project_id, ae.kind, ae.visibility, ae.actor_slug, ae.body, ae.mentions_json, ae.update_type, ae.metadata_json, ae.parent_id, ae.hidden_at, ae.created_at,
            (SELECT COUNT(*) FROM activity_entries r
              WHERE r.parent_id = ae.id AND ${activityHiddenClause('r', includeHidden)} AND ${visR.clause}) AS reply_count
     FROM activity_entries ae
     WHERE ae.entity_type = 'day' AND ae.entity_id = ? AND ae.parent_id IS NULL AND ${activityHiddenClause('ae', includeHidden)} AND ${visAe.clause}
     ORDER BY ae.created_at DESC, ae.id DESC`
  ).bind(...visR.binds, date, ...visAe.binds).all();
  // hidden_count: dismissed roots this viewer could reveal (see the task feed).
  // activity-hidden-exempt: reveal-affordance count DELIBERATELY selects dismissed
  // roots (hidden_at IS NOT NULL); requester-gated by visibility, count only.
  const hiddenRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM activity_entries ae
      WHERE ae.entity_type = 'day' AND ae.entity_id = ? AND ae.parent_id IS NULL
        AND ae.hidden_at IS NOT NULL AND ${visAe.clause}`
  ).bind(date, ...visAe.binds).first<{ n: number }>();
  return json({ data: result.results || [], hidden_count: hiddenRow?.n ?? 0 });
}

// POST /api/days/:date/activity — start (or add to) a day conversation. Routes
// through the ONE write primitive (postActivityEntry), so @me/visibility,
// @mention notifications and the @hermes dispatch all work on the SAME terms as
// a task/artifact comment — no second implementation to drift. Body:
//   { content, author_slug?, visibility? }
//
// ⚠️ The caller KEEPS the `@hermes` token in `content` (§3.4). Under unification
// the stored body is what HERMES_DETECT_RE is tested against — strip it and
// Hermes never fires (a silent no-op that typechecks).
export async function handlePostDayActivity(date: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  if (!DATE_RE.test(date)) return error('date must be a YYYY-MM-DD civil date', 400);
  const body = (await request.json().catch(() => ({}))) as { content?: string; author_slug?: string; visibility?: string };
  if (!body.content?.trim()) return error('content required', 400);

  const actor = await resolveActor(env, user, body.author_slug, {
    allowImpersonation: await isPiRequest(request, env),
  });
  if ('error' in actor) return error(actor.error, 400);

  const posted = await postActivityEntry({
    env,
    user,
    entityType: 'day',
    entityId: date,
    kind: 'comment',
    body: body.content,
    actorSlug: actor.slug,
    // Day threads default PRIVATE (owner §0.1 / §7 Q1). The pre-wave daily_thought
    // lane stored the thought in requester-scoped ai_requests, so a morning thought
    // was never team-visible; keep that now that it lands in team-readable
    // activity_entries. An explicit share ({ visibility:'team' }) opts in.
    visibility: body.visibility === 'team' ? 'team' : 'author',
  });
  if (!posted.ok) return error(posted.error, posted.status);
  return json({ data: posted.row }, 201);
}
