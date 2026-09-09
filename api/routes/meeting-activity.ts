// meeting-activity.ts — the `meeting` entity feed (#124).
//
// Nick, on a meeting page: "I need a way to interact with meetings … whether
// it's activity logs or something with hermes or a quick session, just like we
// do with comments and stuff elsewhere." A meeting was the last first-class
// surface in the Hub with no conversation on it — you could read the debrief
// and you could not ask anything about it.
//
// So it becomes an entity_type on the ONE activity store, exactly as `day` did.
// Every property follows from that and nothing here re-implements it: @me
// visibility, @mentions, threaded replies, dismiss, and the @hermes dispatch all
// come from postActivityEntry. The read shape is identical to the task / day /
// artifact feeds, so the frontend reuses ActivityThread with no new renderer.
//
// Unlike `day`, a meeting has a real table, so existence is a real lookup
// (postActivityEntry does it). project_id stays NULL — see the meeting branch
// there for why a multi-project meeting must not charge its talk to one project.

import type { Env, AuthUser } from '../helpers';
import { json, error, resolveActor, isPiRequest } from '../helpers';
import { activityVisibilityGate, activityHiddenClause, postActivityEntry } from '../lib/activity-entry';

// GET /api/meetings/:id/activity — the meeting's conversation ROOTS
// (newest-first), each with a viewer-specific reply_count. Two visibility gates,
// one per alias — never regex-rewrite one clause into the other alias (the
// documented footgun that corrupted the task-project subquery).
export async function handleGetMeetingActivity(id: string, request: Request, env: Env): Promise<Response> {
  if (!id?.trim()) return error('meeting id required', 400);
  const includeHidden = new URL(request.url).searchParams.get('include_hidden') === '1';
  const visAe = await activityVisibilityGate(request, env, 'ae');
  const visR = await activityVisibilityGate(request, env, 'r');
  const result = await env.DB.prepare(
    `SELECT ae.id, ae.entity_type, ae.entity_id, ae.project_id, ae.kind, ae.visibility, ae.actor_slug, ae.body, ae.mentions_json, ae.update_type, ae.metadata_json, ae.parent_id, ae.hidden_at, ae.created_at,
            (SELECT COUNT(*) FROM activity_entries r
              WHERE r.parent_id = ae.id AND ${activityHiddenClause('r', includeHidden)} AND ${visR.clause}) AS reply_count
     FROM activity_entries ae
     WHERE ae.entity_type = 'meeting' AND ae.entity_id = ? AND ae.parent_id IS NULL AND ${activityHiddenClause('ae', includeHidden)} AND ${visAe.clause}
     ORDER BY ae.created_at DESC, ae.id DESC`
  ).bind(...visR.binds, id, ...visAe.binds).all();
  // activity-hidden-exempt: reveal-affordance count DELIBERATELY selects dismissed
  // roots (hidden_at IS NOT NULL); requester-gated by visibility, count only.
  const hiddenRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM activity_entries ae
      WHERE ae.entity_type = 'meeting' AND ae.entity_id = ? AND ae.parent_id IS NULL
        AND ae.hidden_at IS NOT NULL AND ${visAe.clause}`
  ).bind(id, ...visAe.binds).first<{ n: number }>();
  return json({ data: result.results || [], hidden_count: hiddenRow?.n ?? 0 });
}

// POST /api/meetings/:id/activity — say something on a meeting. Body:
//   { content, author_slug?, visibility? }
//
// Defaults TEAM-visible, unlike `day`. A meeting page is a shared team surface —
// the whole point of talking there is that the people who were in the room can
// read it. A private note is still one keystroke away: the `@me ` body prefix
// (or the composer's lock toggle), and the @hermes-prefix composer posts
// visibility:'author' the way the task lane already does.
//
// ⚠️ The caller KEEPS the `@hermes` token in `content`. The STORED body is what
// HERMES_DETECT_RE is tested against — stripping it is a silent no-op that
// typechecks.
export async function handlePostMeetingActivity(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  if (!id?.trim()) return error('meeting id required', 400);
  const body = (await request.json().catch(() => ({}))) as { content?: string; author_slug?: string; visibility?: string };
  if (!body.content?.trim()) return error('content required', 400);

  const actor = await resolveActor(env, user, body.author_slug, {
    allowImpersonation: await isPiRequest(request, env),
  });
  if ('error' in actor) return error(actor.error, 400);

  const posted = await postActivityEntry({
    env,
    user,
    entityType: 'meeting',
    entityId: id,
    kind: 'comment',
    body: body.content,
    actorSlug: actor.slug,
    visibility: body.visibility === 'author' ? 'author' : 'team',
  });
  if (!posted.ok) return error(posted.error, posted.status);
  // `hermes` tells the composer whether an @hermes ask actually dispatched, so a
  // bare "@hermes" reports itself instead of looking like a silent success.
  return json({ data: posted.row, ...(posted.hermes ? { hermes: posted.hermes } : {}) }, 201);
}
