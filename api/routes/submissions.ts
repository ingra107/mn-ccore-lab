import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug } from '../helpers';

const VALID_EVENT_TYPES = [
  'submitted',
  'reviews_received',
  'revision_due',
  'resubmitted',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

// ── GET /api/submissions?project_id= ──
// List submission events for a project, ordered by date
export async function handleGetSubmissions(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return error('project_id required', 400);

  const events = await env.DB.prepare(`
    SELECT * FROM submission_events
    WHERE project_id = ? AND deleted_at IS NULL
    ORDER BY event_date ASC, created_at ASC
  `).bind(projectId).all();

  return json({ data: events.results || [], count: events.results?.length || 0 });
}

// ── POST /api/submissions ──
// Create a new submission event
export async function handleCreateSubmission(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    project_id: string;
    event_type: string;
    event_date: string;
    journal?: string;
    notes?: string;
  };

  if (!body.project_id) return error('project_id required', 400);
  if (!body.event_type) return error('event_type required', 400);
  if (!body.event_date) return error('event_date required', 400);
  if (!VALID_EVENT_TYPES.includes(body.event_type as typeof VALID_EVENT_TYPES[number])) {
    return error(`event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO submission_events (id, project_id, event_type, event_date, journal, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.project_id,
    body.event_type,
    body.event_date,
    body.journal || null,
    body.notes || null,
  ).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'submission', `Submission event '${body.event_type}' created for project ${body.project_id}`, actor, id, 'submission_event');

  const created = await env.DB.prepare('SELECT * FROM submission_events WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/submissions/:id ──
// Update a submission event
export async function handleUpdateSubmission(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    event_type?: string;
    event_date?: string;
    journal?: string;
    notes?: string;
  };

  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (body.event_type !== undefined) {
    if (!VALID_EVENT_TYPES.includes(body.event_type as typeof VALID_EVENT_TYPES[number])) {
      return error(`event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 400);
    }
    sets.push('event_type = ?');
    params.push(body.event_type);
  }
  if (body.event_date !== undefined) { sets.push('event_date = ?'); params.push(body.event_date); }
  if (body.journal !== undefined) { sets.push('journal = ?'); params.push(body.journal || null); }
  if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes || null); }

  if (sets.length === 0) return error('No fields to update', 400);

  params.push(id);
  await env.DB.prepare(
    `UPDATE submission_events SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`
  ).bind(...params).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'submission', `Submission event ${id} updated`, actor, id, 'submission_event');

  const updated = await env.DB.prepare('SELECT * FROM submission_events WHERE id = ?').bind(id).first();
  if (!updated) return error('Submission event not found', 404);
  return json({ data: updated });
}

// ── POST /api/submissions/:id/delete ──
// Soft delete a submission event
export async function handleDeleteSubmission(id: string, user: AuthUser, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id FROM submission_events WHERE id = ? AND deleted_at IS NULL'
  ).bind(id).first();
  if (!existing) return error('Submission event not found', 404);

  await env.DB.prepare(
    "UPDATE submission_events SET deleted_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'submission', `Submission event ${id} soft-deleted`, actor, id, 'submission_event');

  return json({ data: { id, deleted: true } });
}

// ── GET /api/submissions/active ──
// All projects with active submissions (most recent event is not accepted/rejected/withdrawn)
// Includes days-since-submission and days-until-revision-due
export async function handleGetActiveSubmissions(env: Env): Promise<Response> {
  // Get the most recent non-deleted event per project
  const activeProjects = await env.DB.prepare(`
    WITH latest_events AS (
      SELECT se.*,
        ROW_NUMBER() OVER (PARTITION BY se.project_id ORDER BY se.event_date DESC, se.created_at DESC) as rn
      FROM submission_events se
      WHERE se.deleted_at IS NULL
    ),
    first_submitted AS (
      SELECT project_id, MIN(event_date) as first_submitted_date
      FROM submission_events
      WHERE event_type IN ('submitted', 'resubmitted') AND deleted_at IS NULL
      GROUP BY project_id
    ),
    revision_due AS (
      SELECT rd.project_id, rd.event_date as revision_due_date
      FROM submission_events rd
      WHERE rd.event_type = 'revision_due'
        AND rd.deleted_at IS NULL
        AND rd.event_date >= date('now')
      GROUP BY rd.project_id
      HAVING rd.event_date = MAX(rd.event_date)
    )
    SELECT
      le.id,
      le.project_id,
      le.event_type as latest_event_type,
      le.event_date as latest_event_date,
      le.journal,
      le.notes,
      p.title as project_title,
      p.slug as project_slug,
      fs.first_submitted_date,
      CAST(julianday('now') - julianday(COALESCE(fs.first_submitted_date, le.event_date)) AS INTEGER) as days_since_submission,
      rd.revision_due_date,
      CASE WHEN rd.revision_due_date IS NOT NULL
        THEN CAST(julianday(rd.revision_due_date) - julianday('now') AS INTEGER)
        ELSE NULL
      END as days_until_revision_due
    FROM latest_events le
    LEFT JOIN projects p ON p.slug = le.project_id OR p.id = le.project_id
    LEFT JOIN first_submitted fs ON fs.project_id = le.project_id
    LEFT JOIN revision_due rd ON rd.project_id = le.project_id
    WHERE le.rn = 1
      AND le.event_type NOT IN ('accepted', 'rejected', 'withdrawn')
    ORDER BY
      CASE WHEN rd.revision_due_date IS NOT NULL THEN 0 ELSE 1 END,
      rd.revision_due_date ASC,
      le.event_date DESC
  `).all();

  return json({ data: activeProjects.results || [], count: activeProjects.results?.length || 0 });
}
