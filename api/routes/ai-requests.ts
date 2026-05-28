import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, projectRefToCanonical } from '../helpers';

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

  await env.DB.prepare(
    "UPDATE ai_requests SET response = ?, status = ?, responded_at = datetime('now') WHERE id = ?"
  ).bind(body.response.trim(), status, id).run();

  const updated = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first();
  if (!updated) {
    return error('AI request not found', 404);
  }

  return json({ data: updated });
}
