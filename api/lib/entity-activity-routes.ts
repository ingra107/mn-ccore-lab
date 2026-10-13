// entity-activity-routes.ts — the GET/POST pair for an entity whose conversation
// lives on the unified activity store and nowhere else (#125).
//
// `day` (days.ts) and `meeting` (meeting-activity.ts) were two copies of the same
// pair, byte for byte: the same two-alias visibility-gate SQL, the same hidden-count
// query, the same POST body shape. Only the id validation and the default audience
// differed. They now differ in a config, not in code.
//
// What this owns, once: the feed read (roots newest-first, a viewer-specific
// reply_count, `?include_hidden=1` as the "Show hidden" affordance, `hidden_count`
// for the reveal control) and the post (resolveActor, then the ONE write primitive,
// postActivityEntry, so @me visibility, @mentions and the @hermes dispatch work on
// the same terms as on a task comment).
//
// The task and artifact feeds do NOT fit this shape: a task feed also has a project
// guard and a whole-picture variant, an artifact feed is read through its own
// artifact routes. They keep their handlers.
//
// ⚠️ The post keeps the `@hermes` token in `content`. The STORED body is what
// HERMES_DETECT_RE is tested against; stripping it is a silent no-op that typechecks.
//
// Two visibility gates, one per alias, never a regex-rewrite of one into the other
// (the documented footgun that corrupted the task-project subquery).

import type { Env, AuthUser } from '../helpers';
import { json, error, resolveActor, isPiRequest } from '../helpers';
import {
  replySummaryColumns,
  activityVisibilityGate,
  activityHiddenClause,
  postActivityEntry,
  type EntityType,
} from './activity-entry';
import type { Visibility } from '../../shared/activityKinds';

export interface EntityActivityConfig {
  /** An error message when `id` is not a usable id for this entity, else null. */
  validateId(id: string): string | null;
  /** The audience of a post that does not say: `day` is private, `meeting` is the team. */
  defaultVisibility(requested: string | undefined): Visibility;
}

export function makeEntityActivityRoutes(entityType: Extract<EntityType, 'day' | 'meeting'>, cfg: EntityActivityConfig) {
  /** GET /<entity>/:id/activity: the conversation ROOTS, newest first, each with a viewer-specific reply_count. */
  async function get(id: string, request: Request, env: Env): Promise<Response> {
    const bad = cfg.validateId(id);
    if (bad) return error(bad, 400);
    const includeHidden = new URL(request.url).searchParams.get('include_hidden') === '1';
    const visAe = await activityVisibilityGate(request, env, 'ae');
    const rs = replySummaryColumns(await activityVisibilityGate(request, env, 'r', 'ae'), includeHidden);
    const result = await env.DB.prepare(
      `SELECT ae.id, ae.entity_type, ae.entity_id, ae.project_id, ae.kind, ae.visibility, ae.actor_slug, ae.body, ae.mentions_json, ae.update_type, ae.metadata_json, ae.parent_id, ae.hidden_at, ae.created_at,
              ${rs.sql}
       FROM activity_entries ae
       WHERE ae.entity_type = ? AND ae.entity_id = ? AND ae.parent_id IS NULL AND ${activityHiddenClause('ae', includeHidden)} AND ${visAe.clause}
       ORDER BY ae.created_at DESC, ae.id DESC`
    ).bind(...rs.binds, entityType, id, ...visAe.binds).all();
    // hidden_count: dismissed roots this viewer could reveal.
    // activity-hidden-exempt: reveal-affordance count DELIBERATELY selects dismissed
    // roots (hidden_at IS NOT NULL); requester-gated by visibility, count only.
    const hiddenRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activity_entries ae
        WHERE ae.entity_type = ? AND ae.entity_id = ? AND ae.parent_id IS NULL
          AND ae.hidden_at IS NOT NULL AND ${visAe.clause}`
    ).bind(entityType, id, ...visAe.binds).first<{ n: number }>();
    return json({ data: result.results || [], hidden_count: hiddenRow?.n ?? 0 });
  }

  /** POST /<entity>/:id/activity: say something. Body: { content, author_slug?, visibility? }. */
  async function post(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
    const bad = cfg.validateId(id);
    if (bad) return error(bad, 400);
    const body = (await request.json().catch(() => ({}))) as { content?: string; author_slug?: string; visibility?: string };
    if (!body.content?.trim()) return error('content required', 400);

    const actor = await resolveActor(env, user, body.author_slug, {
      allowImpersonation: await isPiRequest(request, env),
    });
    if ('error' in actor) return error(actor.error, 400);

    const posted = await postActivityEntry({
      env,
      user,
      entityType,
      entityId: id,
      kind: 'comment',
      body: body.content,
      actorSlug: actor.slug,
      visibility: cfg.defaultVisibility(body.visibility),
    });
    if (!posted.ok) return error(posted.error, posted.status);
    // `hermes` tells the composer whether an @hermes ask actually dispatched, so a
    // bare "@hermes" reports itself instead of looking like a silent success.
    return json({ data: posted.row, ...(posted.hermes ? { hermes: posted.hermes } : {}) }, 201);
  }

  return { get, post };
}
