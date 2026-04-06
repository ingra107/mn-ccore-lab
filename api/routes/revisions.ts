import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// ── Types ──

interface RevisionRow {
  id: string;
  project_id: string;
  round: number;
  submitted_at: string | null;
  response_due: string | null;
  status: string;
  journal: string | null;
  notes: string | null;
  created_at: string;
}

interface CommentRow {
  id: string;
  revision_id: string;
  reviewer_number: number;
  comment_text: string;
  assigned_to: string;
  status: string;
  response_text: string | null;
  resolved_at: string | null;
  created_at: string;
}

const VALID_REVISION_STATUSES = ['in_progress', 'submitted', 'accepted', 'rejected'];
const VALID_COMMENT_STATUSES = ['pending', 'in_progress', 'done', 'wont_fix'];

// ── GET /api/revisions?project_id= ──
// List revisions for a project with comment counts
export async function handleGetRevisions(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return error('project_id required', 400);

  const revisions = await env.DB.prepare(`
    SELECT r.*,
      COUNT(c.id) as comment_count,
      SUM(CASE WHEN c.status IN ('done', 'wont_fix') THEN 1 ELSE 0 END) as resolved_count
    FROM manuscript_revisions r
    LEFT JOIN reviewer_comments c ON c.revision_id = r.id
    WHERE r.project_id = ?
    GROUP BY r.id
    ORDER BY r.round ASC
  `).bind(projectId).all();

  return json({ data: revisions.results || [], count: revisions.results?.length || 0 });
}

// ── POST /api/revisions ──
// Create a new revision round
export async function handleCreateRevision(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    project_id: string;
    round?: number;
    submitted_at?: string;
    response_due?: string;
    status?: string;
    journal?: string;
    notes?: string;
  };

  if (!body.project_id) return error('project_id required', 400);

  // Auto-detect round number if not provided
  let round = body.round;
  if (!round) {
    const latest = await env.DB.prepare(
      'SELECT MAX(round) as max_round FROM manuscript_revisions WHERE project_id = ?'
    ).bind(body.project_id).first<{ max_round: number | null }>();
    round = (latest?.max_round || 0) + 1;
  }

  const status = body.status && VALID_REVISION_STATUSES.includes(body.status)
    ? body.status : 'in_progress';

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO manuscript_revisions (id, project_id, round, submitted_at, response_due, status, journal, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.project_id,
    round,
    body.submitted_at || null,
    body.response_due || null,
    status,
    body.journal || null,
    body.notes || null,
  ).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'revision', `Revision R${round} created for project ${body.project_id}`, actor, id, 'revision');

  const created = await env.DB.prepare('SELECT * FROM manuscript_revisions WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/revisions/:id ──
// Update revision fields (status, dates, journal, notes)
export async function handleUpdateRevision(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    submitted_at?: string;
    response_due?: string;
    status?: string;
    journal?: string;
    notes?: string;
  };

  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (body.submitted_at !== undefined) { sets.push('submitted_at = ?'); params.push(body.submitted_at || null); }
  if (body.response_due !== undefined) { sets.push('response_due = ?'); params.push(body.response_due || null); }
  if (body.journal !== undefined) { sets.push('journal = ?'); params.push(body.journal || null); }
  if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes || null); }
  if (body.status !== undefined) {
    if (!VALID_REVISION_STATUSES.includes(body.status)) {
      return error(`status must be one of: ${VALID_REVISION_STATUSES.join(', ')}`, 400);
    }
    sets.push('status = ?');
    params.push(body.status);
  }

  if (sets.length === 0) return error('No fields to update', 400);

  params.push(id);
  await env.DB.prepare(
    `UPDATE manuscript_revisions SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'revision', `Revision ${id} updated`, actor, id, 'revision');

  const updated = await env.DB.prepare('SELECT * FROM manuscript_revisions WHERE id = ?').bind(id).first();
  if (!updated) return error('Revision not found', 404);
  return json({ data: updated });
}

// ── GET /api/revisions/:id/comments ──
// List comments for a revision
export async function handleGetRevisionComments(revisionId: string, env: Env): Promise<Response> {
  const comments = await env.DB.prepare(
    'SELECT * FROM reviewer_comments WHERE revision_id = ? ORDER BY reviewer_number ASC, created_at ASC'
  ).bind(revisionId).all();

  return json({ data: comments.results || [], count: comments.results?.length || 0 });
}

// ── POST /api/revisions/:id/comments ──
// Add a reviewer comment to a revision
export async function handleCreateRevisionComment(revisionId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    reviewer_number?: number;
    comment_text: string;
    assigned_to?: string;
    status?: string;
    response_text?: string;
  };

  if (!body.comment_text) return error('comment_text required', 400);

  // Verify revision exists
  const revision = await env.DB.prepare(
    'SELECT id FROM manuscript_revisions WHERE id = ?'
  ).bind(revisionId).first();
  if (!revision) return error('Revision not found', 404);

  const status = body.status && VALID_COMMENT_STATUSES.includes(body.status)
    ? body.status : 'pending';

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO reviewer_comments (id, revision_id, reviewer_number, comment_text, assigned_to, status, response_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    revisionId,
    body.reviewer_number || 1,
    body.comment_text,
    body.assigned_to || 'nick',
    status,
    body.response_text || null,
  ).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'revision_comment', `Comment added to revision ${revisionId}`, actor, id, 'reviewer_comment');

  const created = await env.DB.prepare('SELECT * FROM reviewer_comments WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/revisions/comments/:id ──
// Update a reviewer comment (status, response_text, assigned_to)
export async function handleUpdateRevisionComment(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    status?: string;
    response_text?: string;
    assigned_to?: string;
    comment_text?: string;
  };

  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (body.comment_text !== undefined) { sets.push('comment_text = ?'); params.push(body.comment_text); }
  if (body.assigned_to !== undefined) { sets.push('assigned_to = ?'); params.push(body.assigned_to || 'nick'); }
  if (body.response_text !== undefined) { sets.push('response_text = ?'); params.push(body.response_text || null); }
  if (body.status !== undefined) {
    if (!VALID_COMMENT_STATUSES.includes(body.status)) {
      return error(`status must be one of: ${VALID_COMMENT_STATUSES.join(', ')}`, 400);
    }
    sets.push('status = ?');
    params.push(body.status);
    // Auto-set resolved_at when marking as done or wont_fix
    if (body.status === 'done' || body.status === 'wont_fix') {
      sets.push("resolved_at = datetime('now')");
    } else {
      sets.push('resolved_at = NULL');
    }
  }

  if (sets.length === 0) return error('No fields to update', 400);

  params.push(id);
  await env.DB.prepare(
    `UPDATE reviewer_comments SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  const actor = user.email.split('@')[0].toLowerCase();
  await logActivity(env, 'revision_comment', `Comment ${id} updated`, actor, id, 'reviewer_comment');

  const updated = await env.DB.prepare('SELECT * FROM reviewer_comments WHERE id = ?').bind(id).first();
  if (!updated) return error('Comment not found', 404);
  return json({ data: updated });
}

// ── GET /api/revisions/active ──
// All active revisions across projects (for dashboard)
export async function handleGetActiveRevisions(env: Env): Promise<Response> {
  const revisions = await env.DB.prepare(`
    SELECT r.*,
      p.title as project_title,
      p.slug as project_slug,
      COUNT(c.id) as comment_count,
      SUM(CASE WHEN c.status IN ('done', 'wont_fix') THEN 1 ELSE 0 END) as resolved_count
    FROM manuscript_revisions r
    LEFT JOIN projects p ON p.slug = r.project_id OR p.id = r.project_id
    LEFT JOIN reviewer_comments c ON c.revision_id = r.id
    WHERE r.status = 'in_progress'
    GROUP BY r.id
    ORDER BY r.response_due ASC NULLS LAST, r.created_at DESC
  `).all();

  return json({ data: revisions.results || [], count: revisions.results?.length || 0 });
}
