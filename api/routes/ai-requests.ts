import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, projectRefToCanonical } from '../helpers';
import { postActivityEntry } from '../lib/activity-entry';
import type { EntityType } from '../lib/activity-entry';

// GET /api/ai-requests?status=&project_slug=
export async function handleGetAIRequests(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const projectSlug = url.searchParams.get('project_slug');

  let query = 'SELECT * FROM ai_requests WHERE 1=1';
  const params: string[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (projectSlug) {
    query += ' AND project_slug = ?';
    params.push(projectSlug);
  }

  query += ' ORDER BY created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// POST /api/ai-requests — create a new AI request
export async function handleCreateAIRequest(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    source_type: string;
    source_id: string;
    project_slug?: string;
    prompt: string;
    context?: string;
  };

  if (!body.source_type || !body.source_id || !body.prompt?.trim()) {
    return error('source_type, source_id, and prompt are required', 400);
  }

  // Z3.2: canonicalize project_slug before insert so stored refs are stable
  // slugs (not raw ids or stale aliases). Unresolvable refs store NULL.
  const canonicalProjectSlug = body.project_slug
    ? await projectRefToCanonical(env, body.project_slug)
    : null;

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.source_type,
    body.source_id,
    canonicalProjectSlug,
    body.prompt.trim(),
    body.context || null,
    user.email,
  ).run();

  const created = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/ai-requests/:id/response — update with AI response (for external processor)
//
// T4 (2026-06-11): on response for source_type='task_comment'|'project_comment',
// post the response into the unified activity timeline via postActivityEntry so
// Hermes answers actually reach feeds. The 'Thinking...' placeholder left by
// dispatchHermes() is UPDATED in-place (body + responded_at equivalent) rather
// than adding a second row. If no placeholder is found, a fresh comment is
// inserted instead.
//
// Lookup chain:
//   ai_requests.source_id = the triggering activity_entry.id (@hermes mention)
//   → triggering entry gives us entity_type + entity_id + visibility
//   → search for the Thinking placeholder: same entity, actor='claude-ai', kind='comment',
//     body starts with 'Thinking about this'
//
// fireSideEffects=false: the AI reply must NOT re-fire mention notifications or
// re-dispatch Hermes (which would loop indefinitely).
export async function handleUpdateAIResponse(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { response: string; status?: string };

  if (!body.response?.trim()) {
    return error('response is required', 400);
  }

  const status = body.status || 'completed';
  if (!['completed', 'failed'].includes(status)) {
    return error('status must be completed or failed', 400);
  }

  // 1. Mark the ai_requests row completed.
  await env.DB.prepare(
    "UPDATE ai_requests SET response = ?, status = ?, responded_at = datetime('now') WHERE id = ?"
  ).bind(body.response.trim(), status, id).run();

  const updated = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first<{
    id: string;
    source_type: string;
    source_id: string;
    project_slug: string | null;
  }>();
  if (!updated) {
    return error('AI request not found', 404);
  }

  // 2. Post the response into the unified timeline for comment-sourced requests.
  if (
    status === 'completed' &&
    (updated.source_type === 'task_comment' || updated.source_type === 'project_comment')
  ) {
    await _postHermesResponse(env, updated, body.response.trim());
  }

  return json({ data: updated });
}

/**
 * T4: Write the Hermes response into activity_entries.
 * Prefers UPDATE on the existing 'Thinking...' placeholder; falls back to a
 * fresh INSERT via postActivityEntry if the placeholder is gone or not found.
 */
async function _postHermesResponse(
  env: Env,
  req: { source_type: string; source_id: string; project_slug: string | null },
  responseText: string,
): Promise<void> {
  const isTask = req.source_type === 'task_comment';
  const entityType: EntityType = isTask ? 'task' : 'project';

  // Resolve the triggering entry to get entity_id + visibility.
  const trigEntry = await env.DB.prepare(
    'SELECT entity_id, entity_type, visibility FROM activity_entries WHERE id = ? LIMIT 1'
  ).bind(req.source_id).first<{ entity_id: string; entity_type: string; visibility: string }>();

  if (!trigEntry) {
    // Triggering entry deleted — nothing to anchor the response to; skip silently.
    console.warn('[handleUpdateAIResponse] triggering activity entry not found for source_id=%s', req.source_id);
    return;
  }

  const entityId = trigEntry.entity_id;
  const visibility = (trigEntry.visibility === 'author' ? 'author' : 'team') as 'author' | 'team';

  // Look for the 'Thinking...' placeholder on the same entity.
  const placeholder = await env.DB.prepare(
    `SELECT id FROM activity_entries
     WHERE entity_type = ? AND entity_id = ? AND actor_slug = 'claude-ai'
       AND kind = 'comment' AND body LIKE 'Thinking about this%'
     ORDER BY created_at DESC LIMIT 1`
  ).bind(entityType, entityId).first<{ id: string }>();

  if (placeholder) {
    // UPDATE the placeholder body in-place — no duplicate row.
    // activity_entries has no updated_at column; body replacement is sufficient
    // since the UI re-renders on query invalidation.
    await env.DB.prepare(
      'UPDATE activity_entries SET body = ? WHERE id = ?'
    ).bind(responseText, placeholder.id).run();
  } else {
    // No placeholder: insert a fresh comment as the AI actor.
    let taskProjectId: string | null | undefined;
    if (isTask) {
      const taskRow = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1')
        .bind(entityId).first<{ project_id: string | null }>();
      taskProjectId = taskRow?.project_id ?? null;
    }

    await postActivityEntry({
      env,
      user: { email: 'claude-ai', name: 'Hermes' },
      entityType,
      entityId,
      kind: 'comment',
      body: responseText,
      actorSlug: 'claude-ai',
      visibility,
      taskProjectId,
      fireSideEffects: false,
    });
  }
}
