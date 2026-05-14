import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate } from '../helpers';

// milestone_type: 'progress_report' | 'continuing_review' | 'nce_deadline' | 'budget_period' | 'irb_renewal' | 'subcontract' | 'other'
// status: 'upcoming' | 'in_progress' | 'completed' | 'overdue'

const VALID_TYPES = ['progress_report', 'continuing_review', 'nce_deadline', 'budget_period', 'irb_renewal', 'subcontract', 'other'];
const VALID_STATUSES = ['upcoming', 'in_progress', 'completed', 'overdue'];

// GET /api/grant-milestones?grant_id=
export async function handleGetGrantMilestones(url: URL, env: Env): Promise<Response> {
  const grantId = url.searchParams.get('grant_id');

  let query = 'SELECT * FROM grant_milestones WHERE 1=1';
  const params: string[] = [];

  if (grantId) { query += ' AND grant_id = ?'; params.push(grantId); }

  query += ` ORDER BY CASE status WHEN 'overdue' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'upcoming' THEN 2 WHEN 'completed' THEN 3 END, due_date ASC, created_at DESC`;

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// GET /api/grant-milestones/upcoming?days=90 — upcoming across all grants
export async function handleUpcomingGrantMilestones(url: URL, env: Env): Promise<Response> {
  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const result = await env.DB.prepare(`
    SELECT gm.*, g.title as grant_title, g.mechanism as grant_mechanism
    FROM grant_milestones gm
    LEFT JOIN grants g ON gm.grant_id = g.id
    WHERE gm.status IN ('upcoming', 'in_progress', 'overdue')
      AND (gm.due_date IS NULL OR gm.due_date <= date('now', '+' || ? || ' days'))
    ORDER BY
      CASE gm.status WHEN 'overdue' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'upcoming' THEN 2 END,
      gm.due_date ASC
  `).bind(days).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// POST /api/grant-milestones — create milestone
export async function handleCreateGrantMilestone(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    grant_id: string;
    milestone_type: string;
    title: string;
    due_date?: string;
    notes?: string;
    status?: string;
  };

  if (!body.grant_id) return error('grant_id required', 400);
  if (!body.milestone_type) return error('milestone_type required', 400);
  if (!body.title) return error('title required', 400);

  if (!VALID_TYPES.includes(body.milestone_type)) {
    return error(`Invalid milestone_type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  const id = generateId();
  const status = body.status || 'upcoming';

  if (!VALID_STATUSES.includes(status)) {
    return error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  await env.DB.prepare(
    'INSERT INTO grant_milestones (id, grant_id, milestone_type, title, due_date, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.grant_id, body.milestone_type, body.title, body.due_date || null, body.notes || null, status).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'grant_milestone', `New grant milestone: "${body.title}"`, actor, id, 'grant_milestone');

  const created = await env.DB.prepare('SELECT * FROM grant_milestones WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/grant-milestones/:id — update milestone fields
export async function handleUpdateGrantMilestone(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'due_date', 'notes', 'status', 'milestone_type', 'grant_id'];
  const { sql, params, hasUpdates } = buildUpdate(body, allowedFields);

  if (!hasUpdates) return error('No valid fields to update', 400);

  await env.DB.prepare(`UPDATE grant_milestones SET ${sql} WHERE id = ?`).bind(...params, id).run();

  const updated = await env.DB.prepare('SELECT * FROM grant_milestones WHERE id = ?').bind(id).first();
  if (!updated) return error('Milestone not found', 404);
  return json({ data: updated });
}

// POST /api/grant-milestones/:id/complete — mark completed
export async function handleCompleteGrantMilestone(id: string, user: AuthUser, env: Env): Promise<Response> {
  await env.DB.prepare(
    "UPDATE grant_milestones SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  const updated = await env.DB.prepare('SELECT * FROM grant_milestones WHERE id = ?').bind(id).first();
  if (!updated) return error('Milestone not found', 404);

  const actor = actorSlug(user.email);
  await logActivity(env, 'grant_milestone', `Completed grant milestone: "${(updated as Record<string, unknown>).title}"`, actor, id, 'grant_milestone');

  return json({ data: updated });
}
