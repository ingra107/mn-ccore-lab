import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug } from '../helpers';

// GET /api/ideas?status=&submitted_by=&research_area=
export async function handleIdeas(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const submittedBy = url.searchParams.get('submitted_by');
  const researchArea = url.searchParams.get('research_area');

  let query = 'SELECT * FROM ideas WHERE 1=1';
  const params: string[] = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (submittedBy) { query += ' AND submitted_by = ?'; params.push(submittedBy); }
  if (researchArea) { query += ' AND research_area = ?'; params.push(researchArea); }

  query += ' ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'under_review\' THEN 1 WHEN \'approved\' THEN 2 WHEN \'parked\' THEN 3 ELSE 4 END, votes DESC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// POST /api/ideas — create idea
export async function handleCreateIdea(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { title: string; description?: string; research_area?: string };
  if (!body.title) return error('title required', 400);

  const id = generateId();
  const submittedBy = actorSlug(user.email);

  await env.DB.prepare(
    'INSERT INTO ideas (id, title, description, submitted_by, research_area) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, body.title, body.description || null, submittedBy, body.research_area || null).run();

  await logActivity(env, 'idea', `New idea: "${body.title}"`, submittedBy, id, 'idea');

  const created = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/ideas/:id — update idea fields
export async function handleUpdateIdea(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'research_area', 'status', 'project_id'];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);
  await env.DB.prepare(`UPDATE ideas SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  if (!updated) return error('Idea not found', 404);
  return json({ data: updated });
}

// POST /api/ideas/:id/vote — upvote
export async function handleVoteIdea(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('UPDATE ideas SET votes = votes + 1 WHERE id = ?').bind(id).run();
  const updated = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  if (!updated) return error('Idea not found', 404);
  return json({ data: updated });
}
