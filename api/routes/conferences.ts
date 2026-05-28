import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, buildUpdate, assertProjectVisible, resolveAndGuardProject } from '../helpers';
import { ctToday } from '../lib/ct-date';
import { withOptionalProjectWrite, withExistingRowProject } from '../lib/route-guards';
import { idempotentDelete } from '../lib/idempotent-delete';

const VALID_SUBMISSION_TYPES = ['abstract', 'oral', 'poster', 'workshop', 'invited'] as const;
const VALID_STATUSES = ['planning', 'submitted', 'accepted', 'preparing', 'presented', 'rejected'] as const;
const VALID_MATERIALS = ['not_started', 'drafting', 'review', 'final'] as const;
const VALID_PRESENTATION_TYPES = ['poster', 'oral', 'rapid', 'workshop'] as const;

// ── GET /api/conferences?project_id=&status= ──
// Phase 1b-extended: when no project_id filter is supplied, this is a
// cross-project feed; filter PB-category rows out for non-PI callers.
export async function handleGetConferences(url: URL, request: Request, env: Env, canSeePb = false): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');

  // Phase 1b-B: when scoped to a specific project, block non-PI callers from
  // reading conference submissions of a PB-category project.
  if (projectId) {
    const block = await assertProjectVisible(request, env, projectId);
    if (block) return block;
  }

  // Phase 1b-extended cross-project filter: only applied when there's no
  // explicit project_id scope (the per-project gate above already covers that).
  const pbFilter = (!projectId && !canSeePb)
    ? " AND (p.category IS NULL OR p.category != 'Peripheral Brain')"
    : '';

  let query = `SELECT cs.* FROM conference_submissions cs
               LEFT JOIN projects p ON p.id = cs.project_id OR p.slug = cs.project_id
               WHERE 1=1${pbFilter}`;
  const params: string[] = [];

  if (projectId) {
    query += ' AND cs.project_id = ?';
    params.push(projectId);
  }
  if (status) {
    query += ' AND cs.status = ?';
    params.push(status);
  }

  query += ' ORDER BY CASE WHEN cs.abstract_due IS NOT NULL THEN cs.abstract_due WHEN cs.conference_date IS NOT NULL THEN cs.conference_date ELSE cs.created_at END ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// ── GET /api/conferences/upcoming ──
// Conferences with deadlines in the next 90 days
// Phase 1b-extended: cross-project feed; filter PB-category rows for non-PI.
export async function handleGetUpcomingConferences(env: Env, canSeePb = false): Promise<Response> {
  // AM-7: bind CT-anchored today / today+90 instead of SQLite date('now')
  // (UTC), which after ~6pm CT shifted the 90-day window a day. abstract_due
  // and conference_date are CT calendar dates. Bind order matches the textual
  // ? order: today, +90, today, +90, today (WHERE), then today (ORDER BY).
  const today = ctToday();
  const in90 = ctToday(90);
  const pbFilter = canSeePb ? '' : " AND (p.category IS NULL OR p.category != 'Peripheral Brain')";
  const result = await env.DB.prepare(`
    SELECT cs.*, p.title as project_title, p.slug as project_slug
    FROM conference_submissions cs
    LEFT JOIN projects p ON cs.project_id = p.slug OR cs.project_id = p.id
    WHERE cs.status NOT IN ('presented', 'rejected')
      AND (
        (cs.abstract_due IS NOT NULL AND cs.abstract_due >= ? AND cs.abstract_due <= ?)
        OR (cs.conference_date IS NOT NULL AND cs.conference_date >= ? AND cs.conference_date <= ?)
        OR (cs.status IN ('accepted', 'preparing') AND cs.conference_date >= ?)
      )${pbFilter}
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

  // Z2.3 (2026-05-28): withOptionalProjectWrite enforces the PB visibility gate
  // when project_id is present; project-less rows (lab-wide conferences with no
  // manuscript link) pass through with projectId=null. Inner handler receives
  // the canonical projectId — bypass-via-forget is structurally impossible.
  return withOptionalProjectWrite(async (_req, e, projectId, b) => {
    const id = generateId();
    await e.DB.prepare(`
      INSERT INTO conference_submissions (id, project_id, conference, conference_date, submission_type, title, authors, abstract_due, abstract_submitted_at, accepted_at, presentation_type, materials_status, travel_booked, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      projectId,
      b.conference,
      b.conference_date || null,
      b.submission_type,
      b.title,
      b.authors || null,
      b.abstract_due || null,
      b.abstract_submitted_at || null,
      b.accepted_at || null,
      b.presentation_type || null,
      b.materials_status || 'not_started',
      b.travel_booked ? 1 : 0,
      b.notes || null,
      b.status || 'planning',
    ).run();

    const actor = actorSlug(user.email);
    await logActivity(e, 'conference', `Conference submission "${b.title}" created for ${b.conference}`, actor, id, 'conference_submission');

    const created = await e.DB.prepare('SELECT * FROM conference_submissions WHERE id = ?').bind(id).first();
    return json({ data: created }, 201);
  })(request, env, body);
}

// ── POST /api/conferences/:id ──
// P4 (2026-05-28): migrated to withExistingRowProject so the existing-row
// existence check + PB visibility gate cannot be bypassed. The reparent gate
// (new project_id in body) is a secondary check that must remain inside the
// inner handler where the body is available — it gates the NEW project the row
// is moving to, beyond the existing-row gate that withExistingRowProject provides.
// Outer signature (id, request, user, env) unchanged for api/index.ts compatibility.
export async function handleUpdateConference(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  return withExistingRowProject('conference_submissions', async (req, e, rowId, _projectId) => {
    const body = await req.json() as Record<string, unknown>;
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

    // P4 reparent gate (2026-05-28): if the update reparents the conference
    // submission to a NEW project_id, gate the target project too. This is a
    // second check BEYOND the existing-row gate provided by withExistingRowProject
    // above — the wrapper gates the CURRENT row's project; this gates the NEW
    // project the row is being moved to. Both gates must pass for a reparent.
    if (typeof body.project_id === 'string' && body.project_id) {
      const { block } = await resolveAndGuardProject(req, e, body.project_id);
      if (block) return block;
    }

    await e.DB.prepare(`UPDATE conference_submissions SET ${sql} WHERE id = ?`).bind(...params, rowId).run();

    const actor = actorSlug(user.email);
    await logActivity(e, 'conference', `Conference submission ${rowId} updated`, actor, rowId, 'conference_submission');

    const updated = await e.DB.prepare('SELECT * FROM conference_submissions WHERE id = ?').bind(rowId).first();
    if (!updated) return error('Conference submission not found', 404);
    return json({ data: updated });
  })(request, env, id);
}

// ── POST /api/conferences/:id/delete ──
// Hard-delete (conference_submissions has no deleted_at column).
// Z4.3 (2026-05-28): hand-rolled idempotent hard-delete replaced by
// idempotentDelete(mode:'hard'). Semantics unchanged: repeat calls return
// 200 idempotent:true; PB visibility gate runs pre-mutation when project_id
// present.
export async function handleDeleteConference(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  return idempotentDelete({
    table: 'conference_submissions',
    id,
    mode: 'hard',
    request,
    env,
    actorSlug: actorSlug(user.email),
    activityCategory: 'conference',
    activityEntityType: 'conference_submission',
  });
}
