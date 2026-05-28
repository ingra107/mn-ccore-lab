import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate, assertProjectVisible, projectRefToCanonical } from '../helpers';
import { ctToday } from '../lib/ct-date';

const VALID_SUBMISSION_TYPES = ['abstract', 'oral', 'poster', 'workshop', 'invited'] as const;
const VALID_STATUSES = ['planning', 'submitted', 'accepted', 'preparing', 'presented', 'rejected'] as const;
const VALID_MATERIALS = ['not_started', 'drafting', 'review', 'final'] as const;
const VALID_PRESENTATION_TYPES = ['poster', 'oral', 'rapid', 'workshop'] as const;

// ── GET /api/conferences?project_id=&status= ──
export async function handleGetConferences(url: URL, request: Request, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');

  // Phase 1b-B: when scoped to a specific project, block non-PI callers from
  // reading conference submissions of a PB-category project.
  if (projectId) {
    const block = await assertProjectVisible(request, env, projectId);
    if (block) return block;
  }

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
  // AM-7: bind CT-anchored today / today+90 instead of SQLite date('now')
  // (UTC), which after ~6pm CT shifted the 90-day window a day. abstract_due
  // and conference_date are CT calendar dates. Bind order matches the textual
  // ? order: today, +90, today, +90, today (WHERE), then today (ORDER BY).
  const today = ctToday();
  const in90 = ctToday(90);
  const result = await env.DB.prepare(`
    SELECT cs.*, p.title as project_title, p.slug as project_slug
    FROM conference_submissions cs
    LEFT JOIN projects p ON cs.project_id = p.slug OR cs.project_id = p.id
    WHERE cs.status NOT IN ('presented', 'rejected')
      AND (
        (cs.abstract_due IS NOT NULL AND cs.abstract_due >= ? AND cs.abstract_due <= ?)
        OR (cs.conference_date IS NOT NULL AND cs.conference_date >= ? AND cs.conference_date <= ?)
        OR (cs.status IN ('accepted', 'preparing') AND cs.conference_date >= ?)
      )
    ORDER BY
      CASE
        WHEN cs.abstract_due IS NOT NULL AND cs.abstract_due >= ? AND cs.status = 'planning' THEN cs.abstract_due
        WHEN cs.conference_date IS NOT NULL THEN cs.conference_date
        ELSE '9999-12-31'
      END ASC
  `).bind(today, in90, today, in90, today, today).all();

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

  // Resolve project_id-or-slug to canonical form; NULL if omitted or unresolvable.
  const resolvedProjectId = body.project_id
    ? (await projectRefToCanonical(env, body.project_id))
    : null;

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO conference_submissions (id, project_id, conference, conference_date, submission_type, title, authors, abstract_due, abstract_submitted_at, accepted_at, presentation_type, materials_status, travel_booked, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    resolvedProjectId,
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
  // Phase 1b-B: resolve the conference submission's project and gate on PB visibility.
  const existing_conf = await env.DB.prepare('SELECT project_id FROM conference_submissions WHERE id = ?').bind(id).first<{ project_id: string | null }>();
  if (existing_conf?.project_id) {
    const block = await assertProjectVisible(request, env, existing_conf.project_id);
    if (block) return block;
  }
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
