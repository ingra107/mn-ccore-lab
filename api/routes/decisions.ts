import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// GET /api/decisions?project_slug=&status=pending|recorded|revisited
export async function handleGetDecisions(url: URL, env: Env): Promise<Response> {
  const projectSlug = url.searchParams.get('project_slug');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM decision_log WHERE 1=1';
  const params: string[] = [];

  if (projectSlug) { query += ' AND project_slug = ?'; params.push(projectSlug); }
  if (status) { query += ' AND outcome_status = ?'; params.push(status); }

  query += ' ORDER BY created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// POST /api/decisions — create decision
export async function handleCreateDecision(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    title: string;
    rationale?: string;
    context?: string;
    project_slug?: string;
    meeting_id?: string;
    tags?: string;
  };
  if (!body.title) return error('title required', 400);

  const id = generateId();
  const decidedBy = user.email.split('@')[0].toLowerCase();

  await env.DB.prepare(
    'INSERT INTO decision_log (id, title, rationale, context, project_slug, meeting_id, decided_by, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.title,
    body.rationale || null,
    body.context || null,
    body.project_slug || null,
    body.meeting_id || null,
    decidedBy,
    body.tags || null,
  ).run();

  await logActivity(env, 'decision', `Decision logged: "${body.title}"`, decidedBy, id, 'decision');

  const created = await env.DB.prepare('SELECT * FROM decision_log WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/decisions/:id/outcome — update outcome + outcome_status
export async function handleUpdateDecisionOutcome(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    outcome: string;
    outcome_status: string;
  };

  if (!body.outcome || !body.outcome_status) {
    return error('outcome and outcome_status required', 400);
  }

  const validStatuses = ['pending', 'recorded', 'revisited'];
  if (!validStatuses.includes(body.outcome_status)) {
    return error(`outcome_status must be one of: ${validStatuses.join(', ')}`, 400);
  }

  await env.DB.prepare(
    "UPDATE decision_log SET outcome = ?, outcome_status = ?, outcome_date = datetime('now') WHERE id = ?"
  ).bind(body.outcome, body.outcome_status, id).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'decision_outcome', `Outcome recorded for decision`, actor, id, 'decision');

  const updated = await env.DB.prepare('SELECT * FROM decision_log WHERE id = ?').bind(id).first();
  if (!updated) return error('Decision not found', 404);
  return json({ data: updated });
}

// GET /api/decisions/review — decisions older than 90 days with outcome_status='pending'
export async function handleGetDecisionsNeedingReview(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM decision_log WHERE outcome_status = 'pending' AND created_at <= datetime('now', '-90 days') ORDER BY created_at ASC"
  ).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}
