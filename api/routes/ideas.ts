import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, isPiRequest, resolveActor } from '../helpers';
import { filterFixtures } from '../lib/fixtures';
import { isLegacyVote } from '../../shared/ideaVotes';

/**
 * An idea's vote fields, from idea_votes (schema-v158): `votes` is every row,
 * `voters` the people, oldest first. A placeholder for a vote from before the
 * table counts and has no face. ideas.votes is a frozen column: never read it.
 * The handle is the viewer's, so a hidden idea's rows are not here.
 */
async function withVotes<T extends { id: unknown }>(env: Env, ideas: T[]): Promise<Array<T & { votes: number; voters: string[] }>> {
  const result = await env.DB.prepare(
    'SELECT idea_id, slug FROM idea_votes ORDER BY created_at, slug'
  ).all<{ idea_id: string; slug: string }>();
  const byIdea = new Map<string, string[]>();
  for (const r of result.results ?? []) byIdea.set(r.idea_id, [...(byIdea.get(r.idea_id) ?? []), r.slug]);
  return ideas.map((idea) => {
    const slugs = byIdea.get(String(idea.id)) ?? [];
    return { ...idea, votes: slugs.length, voters: slugs.filter((s) => !isLegacyVote(s)) };
  });
}

async function oneIdea(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first<{ id: string }>();
  return row ? (await withVotes(env, [row]))[0] : null;
}

// GET /api/ideas?status=&submitted_by=&research_area=
export async function handleGetIdeas(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const submittedBy = url.searchParams.get('submitted_by');
  const researchArea = url.searchParams.get('research_area');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';

  let query = 'SELECT * FROM ideas WHERE 1=1';
  const params: string[] = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (submittedBy) { query += ' AND submitted_by = ?'; params.push(submittedBy); }
  if (researchArea) { query += ' AND research_area = ?'; params.push(researchArea); }

  query += ' ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'under_review\' THEN 1 WHEN \'approved\' THEN 2 WHEN \'parked\' THEN 3 ELSE 4 END, (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = ideas.id) DESC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  const rows = await withVotes(env, filterFixtures((result.results || []) as Array<{ id: unknown; title: string }>, 'title', includeFixtures));
  return json({ data: rows, count: rows.length });
}

// POST /api/ideas — create idea
export async function handleCreateIdea(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { title: string; description?: string; research_area?: string; submitted_by?: string };
  if (!body.title) return error('title required', 400);

  const id = generateId();
  // AM-2: validate/canonicalize submitted_by; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.submitted_by, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const submittedBy = actor.slug;

  await env.DB.prepare(
    'INSERT INTO ideas (id, title, description, submitted_by, research_area) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, body.title, body.description || null, submittedBy, body.research_area || null).run();

  await logActivity(env, 'idea', `New idea: "${body.title}"`, submittedBy, id, 'idea');

  return json({ data: await oneIdea(env, id) }, 201);
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

  const updated = await oneIdea(env, id);
  if (!updated) return error('Idea not found', 404);
  return json({ data: updated });
}

// POST /api/ideas/:id/vote { voted?: boolean } -- the viewer's one vote. `voted`
// states the outcome, so a retry cannot flip it; with no body it toggles. The voter
// is always the signed-in person: nothing in the body can name another. An idea the
// viewer may not read answers as absent, through their own handle.
export async function handleVoteIdea(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { voted?: unknown };
  if (body.voted !== undefined && typeof body.voted !== 'boolean') return error('voted must be true or false', 400);
  const actor = await resolveActor(env, user, undefined, { allowImpersonation: false });
  if ('error' in actor) return error(actor.error, 400);

  const idea = await env.DB.prepare('SELECT id FROM ideas WHERE id = ?').bind(id).first();
  if (!idea) return error('Idea not found', 404);
  const had = await env.DB.prepare('SELECT 1 AS one FROM idea_votes WHERE idea_id = ? AND slug = ?').bind(id, actor.slug).first();
  const want = typeof body.voted === 'boolean' ? body.voted : !had;
  if (want && !had) {
    await env.DB.prepare('INSERT OR IGNORE INTO idea_votes (idea_id, slug) VALUES (?, ?)').bind(id, actor.slug).run();
  } else if (!want && had) {
    await env.DB.prepare('DELETE FROM idea_votes WHERE idea_id = ? AND slug = ?').bind(id, actor.slug).run();
  }
  return json({ data: await oneIdea(env, id) });
}
