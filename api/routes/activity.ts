import type { Env, AuthUser } from '../helpers';
import { json, error, actorSlug, isPiRequest, resolveActor } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';
import { isTestFixture } from '../lib/fixtures';
import { ctToday } from '../lib/ct-date';
import { activityVisibilityGate, activityHiddenClause, postActivityEntry } from '../lib/activity-entry';

// GET /api/activity?limit=20&actor=slug
// AM-3 (SEC-T0-1): `canSeePb` true for PI/Nick/service. This endpoint stays
// public (the /pulse kiosk consumes it unauthenticated), but for non-PI
// callers we exclude activity_log rows tied to a 'Peripheral Brain'-category
// project so PB project titles/state don't leak via free-text descriptions.
// Rows that aren't project-related (related_type != 'project') are unaffected.
export async function handleGetActivity(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 500);
  const actor = url.searchParams.get('actor');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';
  let query = 'SELECT * FROM activity_log';
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (actor) {
    where.push('actor = ?');
    params.push(actor);
  }
  if (!canSeePb) {
    // Exclude rows whose related project is PB-category. related_id stores the
    // project id OR slug, so match on either. Non-project rows (related_type
    // != 'project') and rows with no matching PB project pass through.
    where.push(`NOT (related_type = 'project' AND related_id IN (
      SELECT id FROM projects WHERE category = 'Peripheral Brain'
      UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'
    ))`);
  }
  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }
  // Over-fetch when filtering so the final count still honours the caller's limit.
  const fetchLimit = includeFixtures ? limit : Math.min(limit * 3, 500);
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(fetchLimit);
  const result = await env.DB.prepare(query).bind(...params).all();
  let rows = result.results as Array<{ description: string | null }>;
  if (!includeFixtures) {
    rows = rows.filter((r) => !isTestFixture(r.description));
  }
  rows = rows.slice(0, limit);
  return json({ data: rows, count: rows.length });
}

// POST /api/activity/:id/delete — remove an activity_entries row (comment /
// note / update) by id. Authorization: the entry's AUTHOR or the PI — team
// members manage their own posts; the PI can moderate anything (Nick
// 2026-07-06: manual delete for activities). Hard delete: activity_entries
// has no deleted_at column (Z4.2 doctrine — don't force soft). The
// project-visibility gate runs inside idempotentDelete via the row's
// project_id.
export async function handleDeleteActivityEntry(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // activity-hidden-exempt: delete-auth lookup — a dismissed row is still deletable.
  const row = await env.DB.prepare(
    'SELECT id, actor_slug FROM activity_entries WHERE id = ?',
  ).bind(id).first<{ id: string; actor_slug: string }>();
  // Hard-delete is idempotent by definition: absent row = desired end-state
  // (same semantics as idempotentDelete hard mode).
  if (!row) return json({ data: { id, deleted: true, idempotent: true } });

  const caller = actorSlug(user.email);
  if (row.actor_slug !== caller && !(await isPiRequest(request, env))) {
    return error('Only the author or the PI can delete an activity entry', 403);
  }

  // #98: deleting a thread root takes its replies with it. schema-v100 carries
  // no FK (see that file's header), so the cascade is explicit here rather than
  // an invisible engine behaviour. Orphaned children would be unreachable — the
  // reply feed only loads by parent_id — but would still count toward unseen
  // activity and the project last_activity rollup, i.e. invisible rows driving
  // visible badges. Runs before the row itself so a failure can't strand them.
  await env.DB.prepare('DELETE FROM activity_entries WHERE parent_id = ?').bind(id).run();

  return idempotentDelete({
    table: 'activity_entries',
    id,
    mode: 'hard',
    request,
    env,
    actorSlug: caller,
    activityCategory: 'activity',
    activityEntityType: 'activity_entry',
  });
}

// POST /api/activity/:id/edit — author-or-PI edit of a comment/note body.
// Only comments + notes are editable; the auto-generated lifecycle system/
// completion rows are deleted, not edited. Marks metadata_json.edited=true so the
// UI can show an "(edited)" tag — no schema change. Mentions are NOT re-parsed
// (an edit must not re-fire @mention notifications).
export async function handleEditActivityEntry(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as { body?: unknown };
  const newBody = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!newBody) return error('body required', 400);

  // activity-hidden-exempt: edit-auth lookup — the author can edit a dismissed entry.
  const row = await env.DB.prepare(
    'SELECT id, actor_slug, kind, metadata_json FROM activity_entries WHERE id = ?',
  ).bind(id).first<{ id: string; actor_slug: string; kind: string; metadata_json: string | null }>();
  if (!row) return error('Activity entry not found', 404);
  if (row.kind !== 'comment' && row.kind !== 'update') {
    return error('Only comments and notes can be edited', 400);
  }

  const caller = actorSlug(user.email);
  if (row.actor_slug !== caller && !(await isPiRequest(request, env))) {
    return error('Only the author or the PI can edit an activity entry', 403);
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {
    meta = {};
  }
  meta.edited = true;

  const updated = await env.DB.prepare(
    'UPDATE activity_entries SET body = ?, metadata_json = ? WHERE id = ? RETURNING *',
  ).bind(newBody, JSON.stringify(meta), id).first();
  return json({ data: updated });
}

// POST /api/activity/:id/hide — dismiss (hide) or restore (unhide) a thread ROOT
// and every reply under it. Body: { hidden: boolean }. One route, symmetric —
// unhide is the same verb with hidden:false; a hide/unhide pair would imply
// asymmetric permissions, and the owner's model is symmetric + reversible.
//
// "Dismiss" is a FRONTEND verb (owner decision 9.1.5). The rows are RETAINED, not
// deleted — they stay searchable and stay reachable by Hermes's own transcript
// read, so "remember what we talked about this morning" still works on a
// dismissed thread. This only sets the hidden_at gate that the feeds / badges /
// analytics honour via activityHiddenClause; nothing is forgotten.
//
// Only a thread ROOT is hideable — hidden is a property of the whole THREAD,
// carried on the root AND every reply (postActivityEntry inherits it on write),
// so the cascade UPDATE keeps root + children in lockstep and `parent_id IS NULL`
// stays the reliable root test. Hiding a reply is a 400, mirroring "replying to a
// reply is a 400" (CLAUDE.md Rule 77). Authorization: the root's AUTHOR or the PI
// — same as delete/edit.
export async function handleSetActivityHidden(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as { hidden?: unknown };
  if (typeof payload.hidden !== 'boolean') return error('hidden (boolean) required', 400);

  // activity-hidden-exempt: hide-auth lookup — must resolve the root regardless of
  // its current hidden state (unhide reads an already-hidden row).
  const row = await env.DB.prepare(
    'SELECT id, actor_slug, parent_id, kind FROM activity_entries WHERE id = ?',
  ).bind(id).first<{ id: string; actor_slug: string; parent_id: string | null; kind: string }>();
  if (!row) return error('Activity entry not found', 404);
  if (row.parent_id) return error('Only a thread root can be dismissed — not a reply', 400);

  const caller = actorSlug(user.email);
  if (row.actor_slug !== caller && !(await isPiRequest(request, env))) {
    return error('Only the author or the PI can dismiss an activity entry', 403);
  }

  // Cascade to root + all CURRENT replies in one statement (schema-v100 carries no
  // FK by design; the cascade is explicit, like the delete cascade above). Replies
  // posted AFTER this inherit hidden_at from the parent in postActivityEntry, so a
  // late reply cannot leak the thread back into a feed. Timestamp via SQL
  // datetime('now') — mirrors created_at, avoids a raw-date lint site.
  if (payload.hidden) {
    await env.DB.prepare(
      "UPDATE activity_entries SET hidden_at = datetime('now'), hidden_by = ? WHERE id = ? OR parent_id = ?",
    ).bind(caller, id, id).run();
  } else {
    await env.DB.prepare(
      'UPDATE activity_entries SET hidden_at = NULL, hidden_by = NULL WHERE id = ? OR parent_id = ?',
    ).bind(id, id).run();
  }
  return json({ data: { id, hidden: payload.hidden } });
}

// The reply columns every threaded read returns. Mirrors the shape the unified
// feeds already emit (activityRender.tsx:ActivityEntryItemRow) plus parent_id,
// so a reply renders through the SAME card component as a root.
const REPLY_COLS = `ae.id, ae.entity_type, ae.entity_id, ae.project_id, ae.kind,
  ae.visibility, ae.actor_slug, ae.body, ae.mentions_json, ae.update_type,
  ae.metadata_json, ae.parent_id, ae.created_at`;

// GET /api/activity/:parentId/replies — the thread under one root (#98).
//
// Replies come back OLDEST-FIRST: a thread is a conversation and reads top to
// bottom, which is the opposite of the newest-first ROOT feeds. Both orderings
// are deliberate; don't "fix" one to match the other.
//
// Visibility is gated in SQL on BOTH the reply and its root (the rootColumn arm
// of activityVisibilityGate) so an author-only thread never leaks a child, and
// so the thread's own author can still read Hermes's author-only answer.
export async function handleGetActivityReplies(
  parentId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const vis = await activityVisibilityGate(request, env, 'ae', 'root');
  const rows = await env.DB.prepare(
    `SELECT ${REPLY_COLS}
       FROM activity_entries ae
       JOIN activity_entries root ON root.id = ae.parent_id AND ${activityHiddenClause('root')}
      WHERE ae.parent_id = ? AND ${activityHiddenClause('ae')} AND ${vis.clause}
      ORDER BY ae.created_at ASC, ae.id ASC`,
  ).bind(parentId, ...vis.binds).all();
  const data = rows.results ?? [];
  return json({ data, count: data.length });
}

// POST /api/activity/:parentId/replies — reply to a specific comment (#98).
//
// Body: { content: string, visibility?: 'team'|'author', author_slug?: string }
//
// The caller supplies ONLY the parent and the text. entity_type / entity_id /
// project_id are inherited from the parent inside postActivityEntry, so a client
// cannot graft a reply onto an entity other than the one it is replying within.
// Routing through the one write primitive also means a reply gets @mention
// notifications, artifact key-link capture and @hermes dispatch on exactly the
// same terms as a top-level comment — no second implementation to drift.
export async function handleCreateActivityReply(
  parentId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as {
    content?: unknown; visibility?: unknown; author_slug?: unknown;
  };
  const content = typeof payload.content === 'string' ? payload.content : '';
  if (!content.trim()) return error('content required', 400);

  // resolveActor returns `{ slug } | { error }` — discriminate with `in`, the
  // same shape every other caller uses (routes/tasks.ts:581). It has no `ok`
  // field; testing one silently sent EVERY request down the error path with
  // undefined arguments, which surfaced as a 500 on a perfectly valid reply.
  const actor = await resolveActor(env, user, payload.author_slug as string | undefined, {
    allowImpersonation: await isPiRequest(request, env),
  });
  if ('error' in actor) return error(actor.error, 400);

  // Read the parent through the caller's own visibility gate FIRST. Without
  // this, postActivityEntry would happily thread a reply onto an author-only
  // entry the caller cannot see — turning the reply endpoint into an oracle for
  // the existence of other people's private notes.
  const vis = await activityVisibilityGate(request, env, 'ae');
  // activity-hidden-exempt: parent-visibility check for a reply. Replying to a
  // dismissed root is legitimate; postActivityEntry inherits the parent's
  // hidden_at, so the reply is born hidden too — no leak. The visibility gate
  // (author/team) is the real access control here; hidden is orthogonal.
  const visible = await env.DB.prepare(
    `SELECT ae.id FROM activity_entries ae WHERE ae.id = ? AND ${vis.clause}`,
  ).bind(parentId, ...vis.binds).first<{ id: string }>();
  if (!visible) return error('Parent activity entry not found', 404);

  const result = await postActivityEntry({
    env,
    user,
    // Identity is inherited from the parent; these are placeholders that
    // postActivityEntry overwrites. They cannot influence where the reply lands.
    entityType: 'task',
    entityId: '',
    parentId,
    kind: 'comment',
    body: content,
    actorSlug: actor.slug,
    visibility: payload.visibility === 'author' ? 'author' : undefined,
  });
  if (!result.ok) return error(result.error, result.status);
  return json({ data: result.row }, 201);
}

// GET /api/activity/heatmap?slug=&days=
export async function handleActivityHeatmap(url: URL, env: Env): Promise<Response> {
  const slug = url.searchParams.get('slug');
  const days = parseInt(url.searchParams.get('days') || '90');
  const since = ctToday(-days);

  let query = "SELECT DATE(timestamp) as date, COUNT(*) as count FROM activity_log WHERE timestamp >= ? ";
  const params: string[] = [since];

  if (slug) {
    query += "AND actor = ? ";
    params.push(slug);
  }

  query += "GROUP BY DATE(timestamp) ORDER BY date";

  const result = await env.DB.prepare(query).bind(...params).all();
  const data: Record<string, number> = {};
  for (const row of (result.results || []) as { date: string; count: number }[]) {
    data[row.date] = row.count;
  }

  // Also count task completions
  let taskQuery = "SELECT DATE(completed_at) as date, COUNT(*) as count FROM tasks WHERE completed_at IS NOT NULL AND completed_at >= ? ";
  const taskParams: string[] = [since];
  if (slug) {
    taskQuery += "AND (assignee = ? OR completed_by LIKE ?) ";
    taskParams.push(slug, `%${slug}%`);
  }
  taskQuery += "GROUP BY DATE(completed_at)";

  const taskResult = await env.DB.prepare(taskQuery).bind(...taskParams).all();
  for (const row of (taskResult.results || []) as { date: string; count: number }[]) {
    data[row.date] = (data[row.date] || 0) + row.count;
  }

  return json({ data, days, slug: slug || 'all' });
}
