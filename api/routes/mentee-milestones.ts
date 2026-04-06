import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// GET /api/mentee-milestones?mentee=&status=&type=
export async function handleMenteeMilestones(url: URL, env: Env): Promise<Response> {
  const mentee = url.searchParams.get('mentee');
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');

  let query = 'SELECT * FROM mentee_milestones WHERE 1=1';
  const params: string[] = [];

  if (mentee) { query += ' AND mentee_slug = ?'; params.push(mentee); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (type) { query += ' AND milestone_type = ?'; params.push(type); }

  query += ' ORDER BY CASE status WHEN \'overdue\' THEN 0 WHEN \'in_progress\' THEN 1 WHEN \'upcoming\' THEN 2 WHEN \'completed\' THEN 3 END, due_date ASC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// GET /api/mentee-milestones/overview — all mentees with upcoming/overdue counts
export async function handleMenteeMilestoneOverview(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT
      mentee_slug,
      COUNT(CASE WHEN status = 'upcoming' OR status = 'in_progress' THEN 1 END) as upcoming_count,
      COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(*) as total_count,
      MIN(CASE WHEN status IN ('upcoming', 'in_progress', 'overdue') THEN due_date END) as next_due_date
    FROM mentee_milestones
    GROUP BY mentee_slug
    ORDER BY overdue_count DESC, upcoming_count DESC
  `).all();
  return json({ data: result.results || [] });
}

// POST /api/mentee-milestones — create milestone
export async function handleCreateMenteeMilestone(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    mentee_slug: string;
    milestone_type: string;
    title: string;
    description?: string;
    due_date?: string;
    notes?: string;
    status?: string;
  };

  if (!body.mentee_slug) return error('mentee_slug required', 400);
  if (!body.milestone_type) return error('milestone_type required', 400);
  if (!body.title) return error('title required', 400);

  const validTypes = ['committee_meeting', 'scholarly_project', 'irb_submission', 'irb_renewal', 'program_eval', 'presentation', 'publication', 'other'];
  if (!validTypes.includes(body.milestone_type)) {
    return error(`Invalid milestone_type. Must be one of: ${validTypes.join(', ')}`, 400);
  }

  const id = generateId();
  const status = body.status || 'upcoming';

  await env.DB.prepare(
    'INSERT INTO mentee_milestones (id, mentee_slug, milestone_type, title, description, due_date, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.mentee_slug, body.milestone_type, body.title, body.description || null, body.due_date || null, body.notes || null, status).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'mentee_milestone', `New milestone for ${body.mentee_slug}: "${body.title}"`, actor, id, 'mentee_milestone');

  const created = await env.DB.prepare('SELECT * FROM mentee_milestones WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/mentee-milestones/:id — update milestone fields
export async function handleUpdateMenteeMilestone(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'due_date', 'notes', 'status', 'milestone_type', 'mentee_slug'];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  params.push(id);
  await env.DB.prepare(`UPDATE mentee_milestones SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await env.DB.prepare('SELECT * FROM mentee_milestones WHERE id = ?').bind(id).first();
  if (!updated) return error('Milestone not found', 404);
  return json({ data: updated });
}

// POST /api/mentee-milestones/:id/complete — mark completed
export async function handleCompleteMenteeMilestone(id: string, user: AuthUser, env: Env): Promise<Response> {
  await env.DB.prepare(
    "UPDATE mentee_milestones SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  const updated = await env.DB.prepare('SELECT * FROM mentee_milestones WHERE id = ?').bind(id).first();
  if (!updated) return error('Milestone not found', 404);

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'mentee_milestone', `Completed milestone: "${(updated as Record<string, unknown>).title}"`, actor, id, 'mentee_milestone');

  return json({ data: updated });
}
