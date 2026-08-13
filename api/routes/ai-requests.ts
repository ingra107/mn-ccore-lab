import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, projectRefToCanonical, actorSlug, isPiRequest, getAuthUser } from '../helpers';
import { postActivityEntry } from '../lib/activity-entry';
import type { EntityType } from '../lib/activity-entry';
import { ARTIFACT_URL_RE } from '../lib/artifact-url';

// GET /api/ai-requests?status=&project_slug=&source_type=&source_id=
//
// REQUESTER-SCOPED (2026-07-22). This read returns `SELECT *` — the full prompt
// AND response — and it was gated only by `auth: 'authed'`, with no requester
// filter anywhere in the handler and none in TaskHermesReplies either. Any
// logged-in team member opening a task could therefore read every Hermes
// exchange on it, including someone else's. Unlike activity_entries, this table
// has NO visibility column, so there was no way to mark an exchange private:
// the lane structurally could not express what @me expresses. `requested_by`
// was already stored at creation and simply never consulted on read.
//
// PI / API-key callers keep seeing everything: the PB listener polls this
// endpoint for pending work, and the PI is the operator of his own system.
// `request` is REQUIRED, not optional. While it was optional, a caller that
// omitted it skipped the requester-scoping branch below and got every row back
// — full prompt and response — which is the exact leak the scoping was added to
// close. Required makes that call unrepresentable rather than merely unused.
export async function handleGetAIRequests(url: URL, env: Env, request: Request): Promise<Response> {
  const status = url.searchParams.get('status');
  const projectSlug = url.searchParams.get('project_slug');
  const sourceType = url.searchParams.get('source_type');
  const sourceId = url.searchParams.get('source_id');

  let query = 'SELECT * FROM ai_requests WHERE 1=1';
  const params: string[] = [];

  // Scope to the caller unless they're PI/service. `requested_by` holds the
  // EMAIL the request was made with, so compare on email and additionally on
  // the canonical slug — rows written through paths that stored a slug (or an
  // alias address) would otherwise become invisible to their own author, which
  // fails closed in the wrong direction: silently hiding your own history.
  if (!(await isPiRequest(request, env))) {
    const user = await getAuthUser(request, env);
    const email = user?.email ?? '';
    if (!email) {
      // Authenticated-but-unresolvable: return nothing rather than everything.
      return json({ data: [], count: 0, tokens: { input: 0, output: 0, tracked: 0 } });
    }
    query += ' AND (lower(requested_by) = lower(?) OR lower(requested_by) = lower(?))';
    params.push(email, actorSlug(email));
  }

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

/**
 * Derive the entity routing token (`task: <id>` / `project: <id>`) that the PB
 * listener resolves into a readable context block — title, status, description,
 * comment thread (hub_ai_listener.build_entity_context).
 *
 * dispatchHermes() sets that token for @hermes MENTIONS inside a comment. The
 * typed "@hermes …" PREFIX surfaces (hermesRouting.ts → source_type
 * 'daily_thought', source_id = <task_id>) posted here directly and never set it,
 * so those requests reached the fenced model as a bare question with zero
 * awareness of the task they were asked on. Deriving it at this INSERT — the one
 * chokepoint every poster passes through — means no surface has to remember the
 * token, now or later.
 *
 * Prefix discrimination is the contract _hermesNotifyLink already relies on
 * (#521): entity ids are always `task_<ulid>` / `proj_<ulid>` (generateId), which
 * a date-key source_id (the Today bar's `YYYY-MM-DD`) or an activity-entry id
 * (32-char hex, what dispatchHermes passes) can never collide with.
 */
function deriveEntityContext(sourceId: string): string | null {
  if (sourceId.startsWith('task_')) return `task: ${sourceId}`;
  if (sourceId.startsWith('proj_')) return `project: ${sourceId}`;
  return null;
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
    body.context || deriveEntityContext(body.source_id),
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

  // 2. Post the response into the unified timeline. _postHermesResponse resolves
  // the triggering activity_entries row by source_id and no-ops if it isn't one,
  // so this SELF-GATES: comment/day asks (source_id = an activity_entries id) get
  // their answer threaded in; legacy daily_thought rows whose source_id is a task
  // id or a date-key resolve to no row and are skipped, exactly as before. The old
  // source_type allowlist is GONE — routing is by the entry's OWN entity_type, so
  // adding the 'day' entity needs no new arm here (Hermes wave Phase 3).
  if (status === 'completed') {
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
  // Resolve the triggering entry FIRST — it is the source of truth for where the
  // answer lands. Routing by the entry's OWN entity_type (not by source_type) is
  // what lets a 'day' ask (source_type='daily_thought') thread its answer back
  // correctly; source_type only ever mattered as a proxy for this (Hermes wave P3).
  // activity-hidden-exempt: Hermes response routing — the answer must land in
  // the asking thread even if the user dismissed it while Hermes was thinking.
  const trigEntry = await env.DB.prepare(
    'SELECT entity_id, entity_type, visibility, parent_id, id FROM activity_entries WHERE id = ? LIMIT 1'
  ).bind(req.source_id).first<{ entity_id: string; entity_type: string; visibility: string; parent_id: string | null; id: string }>();

  if (!trigEntry) {
    // source_id isn't an activity_entries id (a legacy daily_thought task/date
    // key, or a deleted entry) — nothing to anchor the response to; skip silently.
    console.warn('[handleUpdateAIResponse] triggering activity entry not found for source_id=%s', req.source_id);
    return;
  }

  const entityType = trigEntry.entity_type as EntityType;
  const isTask = entityType === 'task';
  const entityId = trigEntry.entity_id;
  const visibility = (trigEntry.visibility === 'author' ? 'author' : 'team') as 'author' | 'team';

  // #98: the thread this answer belongs to — a reply's root, or the entry
  // itself when the ask was top-level.
  const threadRootId = trigEntry.parent_id ?? trigEntry.id;

  // Look for the 'Thinking...' placeholder, SCOPED TO THIS THREAD.
  //
  // The scope matters now that threads exist: this used to take the newest
  // claude-ai placeholder anywhere on the entity, so with two asks in flight —
  // say one at the top level and one inside a thread — an answer could
  // overwrite the other conversation's placeholder and appear in the wrong
  // place. Matching parent_id keeps each answer in the thread that asked.
  // dispatchHermes writes the placeholder with parent_id = threadRootId, which
  // is non-null even for a TOP-LEVEL ask (a root's thread is itself) — so match
  // on threadRootId, not on trigEntry.parent_id.
  // activity-hidden-exempt: placeholder resolution — the 'Thinking…' row must be
  // found and updated even if the thread was dismissed, or it dangles forever.
  let placeholder = await env.DB.prepare(
    `SELECT id FROM activity_entries
     WHERE entity_type = ? AND entity_id = ? AND actor_slug = 'claude-ai'
       AND kind = 'comment' AND body LIKE 'Thinking about this%'
       AND parent_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(entityType, entityId, threadRootId).first<{ id: string }>();

  // Fallback for requests already in flight when this shipped: their
  // placeholders predate parent_id and carry NULL. Entity-scoped like the old
  // lookup, so behaviour for those is exactly what it was.
  if (!placeholder) {
    // activity-hidden-exempt: legacy placeholder fallback — same reason as above.
    placeholder = await env.DB.prepare(
      `SELECT id FROM activity_entries
       WHERE entity_type = ? AND entity_id = ? AND actor_slug = 'claude-ai'
         AND kind = 'comment' AND body LIKE 'Thinking about this%'
         AND parent_id IS NULL
       ORDER BY created_at DESC LIMIT 1`
    ).bind(entityType, entityId).first<{ id: string }>();
  }

  if (placeholder) {
    // UPDATE the placeholder body in-place — no duplicate row.
    // activity_entries has no updated_at column; body replacement is sufficient
    // since the UI re-renders on query invalidation.
    //
    // schema-v103: also stamp answered_at. created_at stays fixed at ASK time
    // (the placeholder's own insert moment) forever — this in-place UPDATE is
    // the ONLY write that ever happens to this row on the answer path, so
    // answered_at must be set HERE or it never gets set at all. The private-
    // Hermes-answer arm in api/routes/seen.ts reads it via
    // COALESCE(answered_at, created_at) instead of bare created_at.
    await env.DB.prepare(
      "UPDATE activity_entries SET body = ?, answered_at = datetime('now') WHERE id = ?"
    ).bind(responseText, placeholder.id).run();
  } else {
    // No placeholder: insert a fresh comment as the AI actor.
    let taskProjectId: string | null | undefined;
    if (isTask) {
      const taskRow = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1')
        .bind(entityId).first<{ project_id: string | null }>();
      taskProjectId = taskRow?.project_id ?? null;
    }

    const posted = await postActivityEntry({
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
      // #98: land in the asking thread, same as the placeholder would have.
      parentId: threadRootId,
    });

    // schema-v103: this fresh row's created_at IS its answer time (it's
    // minted at answer time, unlike the placeholder-UPDATE branch above), so
    // answered_at is redundant with created_at for THIS row today — but
    // seen.ts's read side is a single COALESCE(answered_at, created_at) with
    // no branch for "which write path produced this row." Leaving it NULL
    // here would make that COALESCE correct only by accident (it'd fall back
    // to created_at, which happens to already be answer time) rather than by
    // construction. postActivityEntry() is the shared write primitive for
    // every activity-entry kind (task/project/artifact comments, updates, the
    // Hermes placeholder itself) with a bind-order-sensitive positional
    // INSERT (schema-v100's note) — a follow-up single-column UPDATE keyed on
    // the freshly-minted id is one extra statement on a rare fallback path
    // (placeholder missing/already replaced) vs. threading a Hermes-only
    // column through every caller of the shared primitive.
    if (posted.ok) {
      await env.DB.prepare(
        "UPDATE activity_entries SET answered_at = datetime('now') WHERE id = ?"
      ).bind(posted.row.id).run();
    }
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
      // activity-hidden-exempt: redirect-link routing — resolve the entity a
      // notification points at regardless of the thread's dismiss state.
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/my-tasks?open=${entry.entity_id}` : '/portal/my-tasks';
    }
    case 'project_comment':
      return req.project_slug ? `/portal/projects/${req.project_slug}` : '/portal/overview';
    case 'artifact_comment': {
      // activity-hidden-exempt: redirect-link routing — same as task_comment above.
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/artifacts/${entry.entity_id}` : '/portal/artifacts';
    }
    default:
      return '/portal/dashboard';
  }
}
