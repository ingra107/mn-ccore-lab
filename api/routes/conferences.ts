import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate } from '../helpers';

const VALID_SUBMISSION_TYPES = ['abstract', 'oral', 'poster', 'workshop', 'invited'] as const;
const VALID_STATUSES = ['planning', 'submitted', 'accepted', 'preparing', 'presented', 'rejected'] as const;
const VALID_MATERIALS = ['not_started', 'drafting', 'review', 'final'] as const;
const VALID_PRESENTATION_TYPES = ['poster', 'oral', 'rapid', 'workshop'] as const;

// ── GET /api/conferences?project_id=&status= ──
export async function handleGetConferences(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM conference_submissions WHERE 1=1';
  const params: string[] = [];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY CASE WHEN abstract_due IS NOT NULL THEN abstract_due WHEN conference_date IS NOT NULL THEN conference_date ELSE created_at END ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// ── GET /api/conferences/upcoming ──
// Conferences with deadlines in the next 90 days
export async function handleGetUpcomingConferences(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT cs.*, p.title as project_title, p.slug as project_slug
    FROM conference_submissions cs
    LEFT JOIN projects p ON cs.project_id = p.slug OR cs.project_id = p.id
    WHERE cs.status NOT IN ('presented', 'rejected')
      AND (
        (cs.abstract_due IS NOT NULL AND cs.abstract_due >= date('now') AND cs.abstract_due <= date('now', '+90 days'))
        OR (cs.conference_date IS NOT NULL AND cs.conference_date >= date('now') AND cs.conference_date <= date('now', '+90 days'))
        OR (cs.status IN ('accepted', 'preparing') AND cs.conference_date >= date('now'))
      )
    ORDER BY
      CASE
        WHEN cs.abstract_due IS NOT NULL AND cs.abstract_due >= date('now') AND cs.status = 'planning' THEN cs.abstract_due
        WHEN cs.conference_date IS NOT NULL THEN cs.conference_date
        ELSE '9999-12-31'
      END ASC
  `).all();

  // Annotate with days_until for the most relevant deadline
  const now = new Date();
  const items = (result.results || []).map((row: any) => {
    let relevant_date = row.conference_date;
    if (row.status === 'planning' && row.abstract_due) {
      relevant_date = row.abstract_due;
    }
    const days_until = relevant_date
      ? Math.ceil((new Date(relevant_date + 'T23:59:59').getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return { ...row, days_until };
  });

  return json({ data: items, count: items.length });
}

// ── POST /api/conferences ──
export async function handleCreateConference(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    project_id?: string;
    conference: string;
    conference_date?: string;
    submission_type: string;
    title: string;
    authors?: string;
    abstract_due?: string;
    abstract_submitted_at?: string;
    accepted_at?: string;
    presentation_type?: string;
    materials_status?: string;
    travel_booked?: number;
    notes?: string;
    status?: string;
  };

  if (!body.conference) return error('conference required', 400);
  if (!body.submission_type) return error('submission_type required', 400);
  if (!body.title) return error('title required', 400);

  if (!VALID_SUBMISSION_TYPES.includes(body.submission_type as typeof VALID_SUBMISSION_TYPES[number])) {
    return error(`submission_type must be one of: ${VALID_SUBMISSION_TYPES.join(', ')}`, 400);
  }

  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return error(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }

  if (body.materials_status && !VALID_MATERIALS.includes(body.materials_status as typeof VALID_MATERIALS[number])) {
    return error(`materials_status must be one of: ${VALID_MATERIALS.join(', ')}`, 400);
  }

  if (body.presentation_type && !VALID_PRESENTATION_TYPES.includes(body.presentation_type as typeof VALID_PRESENTATION_TYPES[number])) {
    return error(`presentation_type must be one of: ${VALID_PRESENTATION_TYPES.join(', ')}`, 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO conference_submissions (id, project_id, conference, conference_date, submission_type, title, authors, abstract_due, abstract_submitted_at, accepted_at, presentation_type, materials_status, travel_booked, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.project_id || null,
    body.conference,
    body.conference_date || null,
    body.submission_type,
    body.title,
    body.authors || null,
    body.abstract_due || null,
    body.abstract_submitted_at || null,
    body.accepted_at || null,
    body.presentation_type || null,
    body.materials_status || 'not_started',
    body.travel_booked ? 1 : 0,
    body.notes || null,
    body.status || 'planning',
  ).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'conference', `Conference submission "${body.title}" created for ${body.conference}`, actor, id, 'conference_submission');

  const created = await env.DB.prepare('SELECT * FROM conference_submissions WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/conferences/:id ──
export async function handleUpdateConference(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = [
    'project_id', 'conference', 'conference_date', 'submission_type', 'title',
    'authors', 'abstract_due', 'abstract_submitted_at', 'accepted_at',
    'presentation_type', 'materials_status', 'travel_booked', 'notes', 'status',
  ];
  const { sql, params, hasUpdates } = buildUpdate(body, allowedFields);

  if (!hasUpdates) return error('No valid fields to update', 400);

  // Validate enums if provided
  if (body.submission_type && !VALID_SUBMISSION_TYPES.includes(body.submission_type as typeof VALID_SUBMISSION_TYPES[number])) {
    return error(`submission_type must be one of: ${VALID_SUBMISSION_TYPES.join(', ')}`, 400);
  }
  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return error(`status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
  }
  if (body.materials_status && !VALID_MATERIALS.includes(body.materials_status as typeof VALID_MATERIALS[number])) {
    return error(`materials_status must be one of: ${VALID_MATERIALS.join(', ')}`, 400);
  }
  if (body.presentation_type && !VALID_PRESENTATION_TYPES.includes(body.presentation_type as typeof VALID_PRESENTATION_TYPES[number])) {
    return error(`presentation_type must be one of: ${VALID_PRESENTATION_TYPES.join(', ')}`, 400);
  }

  await env.DB.prepare(`UPDATE conference_submissions SET ${sql} WHERE id = ?`).bind(...params, id).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'conference', `Conference submission ${id} updated`, actor, id, 'conference_submission');

  const updated = await env.DB.prepare('SELECT * FROM conference_submissions WHERE id = ?').bind(id).first();
  if (!updated) return error('Conference submission not found', 404);
  return json({ data: updated });
}

// ── POST /api/conferences/:id/delete ──
export async function handleDeleteConference(id: string, user: AuthUser, env: Env): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM conference_submissions WHERE id = ?').bind(id).first();
  if (!existing) return error('Conference submission not found', 404);

  await env.DB.prepare('DELETE FROM conference_submissions WHERE id = ?').bind(id).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'conference', `Conference submission ${id} deleted`, actor, id, 'conference_submission');

  return json({ data: { id, deleted: true } });
}
