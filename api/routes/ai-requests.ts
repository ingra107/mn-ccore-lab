import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, projectRefToCanonical, actorSlug } from '../helpers';
import { postActivityEntry } from '../lib/activity-entry';
import type { EntityType } from '../lib/activity-entry';
import { ARTIFACT_URL_RE } from '../lib/artifact-url';

// GET /api/ai-requests?status=&project_slug=&source_type=&source_id=
export async function handleGetAIRequests(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const projectSlug = url.searchParams.get('project_slug');
  const sourceType = url.searchParams.get('source_type');
  const sourceId = url.searchParams.get('source_id');

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

  if (sourceType) {
    query += ' AND source_type = ?';
    params.push(sourceType);
  }

  if (sourceId) {
    query += ' AND source_id = ?';
    params.push(sourceId);
  }

  query += ' ORDER BY created_at DESC';

  // N7b — usage rollup across ALL requests (not just the filtered page).
  // One batched round-trip (/simplify: was two sequential awaits).
  const [result, tokensRes] = await env.DB.batch([
    env.DB.prepare(query).bind(...params),
    env.DB.prepare(
      'SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COUNT(input_tokens) AS tracked FROM ai_requests'
    ),
  ]);
  const tokens = (tokensRes.results as { input: number; output: number; tracked: number }[] | undefined)?.[0];
  return json({
    data: result.results || [],
    count: result.results?.length || 0,
    tokens: tokens ?? { input: 0, output: 0, tracked: 0 },
  });
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
  const body = await request.json() as {
    response: string;
    status?: string;
    // N7b (schema v82): per-generation usage from the listener's
    // `claude --print --output-format json` call. Optional — older listeners
    // omit them and the columns stay NULL.
    input_tokens?: number;
    output_tokens?: number;
  };

  if (!body.response?.trim()) {
    return error('response is required', 400);
  }

  const status = body.status || 'completed';
  if (!['completed', 'failed'].includes(status)) {
    return error('status must be completed or failed', 400);
  }

  const inTok = Number.isFinite(body.input_tokens) ? Math.max(0, Math.round(body.input_tokens as number)) : null;
  const outTok = Number.isFinite(body.output_tokens) ? Math.max(0, Math.round(body.output_tokens as number)) : null;

  // 1. Mark the ai_requests row completed.
  await env.DB.prepare(
    "UPDATE ai_requests SET response = ?, status = ?, responded_at = datetime('now'), input_tokens = ?, output_tokens = ? WHERE id = ?"
  ).bind(body.response.trim(), status, inTok, outTok, id).run();

  const updated = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first<{
    id: string;
    source_type: string;
    source_id: string;
    project_slug: string | null;
    requested_by: string | null;
    prompt: string;
  }>();
  if (!updated) {
    return error('AI request not found', 404);
  }

  // 2. Post the response into the unified timeline for comment-sourced requests.
  if (
    status === 'completed' &&
    (updated.source_type === 'task_comment' ||
      updated.source_type === 'project_comment' ||
      updated.source_type === 'artifact_comment')
  ) {
    await _postHermesResponse(env, updated, body.response.trim());
  }

  // 3. Notify the submitter on every completion (all source_types, incl. daily_thought).
  if (status === 'completed') {
    try {
      await _notifySubmitter(env, updated, body.response.trim());
    } catch (e) {
      console.error('[handleUpdateAIResponse] submitter notify failed:', e);
    }
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
  const entityType: EntityType =
    req.source_type === 'task_comment'
      ? 'task'
      : req.source_type === 'artifact_comment'
        ? 'artifact'
        : 'project';

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

/**
 * Notify the ai_request's submitter that Hermes has replied.
 *
 * Fires for ALL source_types (daily_thought, task_comment, project_comment,
 * artifact_comment, and any future types). Skips when requested_by is absent.
 *
 * Idempotent: at most one notification per (recipient_slug, 'ai_request', req.id).
 * The completion UPDATE at L127 is unconditional, so the guard lives here, not
 * on the UPDATE. Safe to call on repeated response-POST retries.
 */
async function _notifySubmitter(
  env: Env,
  req: {
    id: string;
    source_type: string;
    source_id: string;
    project_slug: string | null;
    requested_by: string | null;
    prompt: string;
  },
  responseText: string,
): Promise<void> {
  if (!req.requested_by) return;

  const recipientSlug = actorSlug(req.requested_by);
  if (!recipientSlug) return;

  // Idempotency: at most one notification per (recipient, ai_request, req.id).
  const existing = await env.DB.prepare(
    "SELECT id FROM notifications WHERE recipient_slug = ? AND source_type = 'ai_request' AND source_id = ? LIMIT 1"
  ).bind(recipientSlug, req.id).first<{ id: string }>();
  if (existing) return;

  const link = await _hermesNotifyLink(env, req, responseText);
  const title = `Hermes replied to: ${req.prompt.slice(0, 60)}`;

  await env.DB.prepare(
    'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    generateId(),
    recipientSlug,
    'update',
    'ai_request',
    req.id,
    title,
    null,
    link,
  ).run();
}

/**
 * Resolve the deep-link for a Hermes reply notification.
 *
 * Priority order:
 *   1. Artifact URL embedded in the response text (Hermes produced an artifact).
 *   2. Source-surface fallback keyed on source_type:
 *      - daily_thought, source_id = task_<ulid> → /portal/my-tasks?openTask=<task_id>
 *        (#521: a typed @hermes prefix on a task compose surface — TaskDetailPanel,
 *        SmartCompose task mode — posts source_type='daily_thought' with the TASK id
 *        as source_id, per hermesRouting.ts's contract; task ids are always
 *        `task_<ulid>` (generateId('task')), which a date-key source_id (the
 *        Today-bar's `YYYY-MM-DD`) can never collide with)
 *      - daily_thought, source_id = date-key → /today (the Today-bar's own
 *        MorningThoughtCompose)
 *      - task_comment  → /portal/my-tasks?open=<task_id>
 *      - project_comment → /portal/projects/<slug>
 *      - artifact_comment → /portal/artifacts/<artifact_id>
 *      - other → /portal/dashboard
 */
async function _hermesNotifyLink(
  env: Env,
  req: { source_type: string; source_id: string; project_slug: string | null },
  responseText: string,
): Promise<string | null> {
  // An artifact URL in the response takes priority over the source surface.
  const artMatch = responseText.match(ARTIFACT_URL_RE);
  if (artMatch) {
    const relPath = artMatch[0].match(/\/portal\/artifacts\/art_[0-9a-f]+/i);
    if (relPath) return relPath[0];
  }

  switch (req.source_type) {
    case 'daily_thought':
      return req.source_id.startsWith('task_')
        ? `/portal/my-tasks?openTask=${encodeURIComponent(req.source_id)}`
        : '/today';
    case 'task_comment': {
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/my-tasks?open=${entry.entity_id}` : '/portal/my-tasks';
    }
    case 'project_comment':
      return req.project_slug ? `/portal/projects/${req.project_slug}` : '/portal/overview';
    case 'artifact_comment': {
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/artifacts/${entry.entity_id}` : '/portal/artifacts';
    }
    default:
      return '/portal/dashboard';
  }
}
