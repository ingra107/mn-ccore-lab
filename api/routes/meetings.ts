import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, safeTaskRow, projectRefToCanonical } from '../helpers';
import { validateApiKey } from '../middleware/api-key-auth';
import { TASK_SELECT_COLS } from '../lib/task-cols';
import { normalizeAttendees, attendeesColumnValue, type NormalizedAttendees } from '../lib/meeting-write';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';
import { initialAudience, isLabSeriesTitle, isMeetingAudience } from '../../shared/meetingAudience';
import { isSiteAdmin, personViewer, SITE_ADMIN_SLUG, type Viewer } from '../lib/viewer-db';
import { meetingArms } from '../lib/table-scope';

// GET /api/meetings/next — next upcoming meeting (lightweight, for sidebar badge)
export async function handleNextMeeting(env: Env): Promise<Response> {
  const today = ctToday()
  const result = await env.DB.prepare(
    'SELECT id, title, date FROM meetings WHERE date >= ? ORDER BY date ASC LIMIT 1'
  ).bind(today).first()
  return json({ data: result || null })
}

// One-shot "debrief landed" bell: fires only when a push transitions a meeting
// from notes-less to notes-full (insert-with-notes or first notes upsert).
// Later re-pushes surface via the entity_seen teal dot, never a second bell.
// The bell goes to the meeting's owner (schema-v119). It was hard-coded to
// nick-ingraham while PB was the only writer; a meeting with no owner rings
// no one rather than someone who may not be able to open it.
async function fireMeetingDebriefNotification(env: Env, meetingId: string, sourceId: string | null, title: string, ownerSlug: string | null): Promise<void> {
  if (!ownerSlug) return;
  const ids = sourceId ? [meetingId, sourceId] : [meetingId];
  const placeholders = ids.map(() => '?').join(',');
  const cnt = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM tasks WHERE meeting_id IN (${placeholders}) AND deleted_at IS NULL`
  ).bind(...ids).first<{ n: number }>();
  const n = cnt?.n ?? 0;
  await env.DB.prepare(
    'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    generateId(), ownerSlug, 'meeting_debrief', 'meeting', meetingId,
    `Meeting debriefed: ${title}`,
    n > 0 ? `${n} task${n === 1 ? '' : 's'} linked — review, edit, or reassign` : 'Notes ready to review',
    `/portal/meetings/${meetingId}`,
  ).run();
}

// The projects a meeting is GRANTED to (schema-v122), as a JSON array of
// {id, slug, short_name, title}. Read through the caller's handle: a granted
// project the caller is not on keeps its id and loses its names (null), and a
// grant to a deleted project is left out (the read rule ignores it too).
const GRANTED_PROJECTS_SQL = `(SELECT json_group_array(json_object('id', g.project_id, 'slug', gp.slug, 'short_name', gp.short_name, 'title', gp.title))
     FROM meeting_project_grants g LEFT JOIN projects gp ON gp.id = g.project_id
    WHERE g.meeting_id = meetings.id AND (gp.id IS NULL OR gp.deleted_at IS NULL))`;

// GET /api/meetings — list all meetings. The route is auth: 'authed'; an
// anonymous caller is refused before this runs (bindRegistryToHono), so the
// old per-handler public column list (AM-3) is gone.
//
// Each row also carries what a Today meeting card shows (Nick, 2026-10-09:
// attendee faces, the meeting's project, action count): granted_projects
// (above) and the live action items linked to it, all and open, counted over
// the tasks the caller can see. v95: tasks.meeting_id holds the Hub id or
// PB's source_id, so both are counted (once, when they are the same).
export async function handleGetMeetings(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `WITH tc AS (
       SELECT meeting_id, COUNT(*) AS n, SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) AS open_n
         FROM tasks WHERE deleted_at IS NULL AND meeting_id IS NOT NULL GROUP BY meeting_id
     )
     SELECT meetings.*,
            ${GRANTED_PROJECTS_SQL} AS granted_projects,
            COALESCE(a.n, 0) + COALESCE(b.n, 0) AS action_count,
            COALESCE(a.open_n, 0) + COALESCE(b.open_n, 0) AS open_action_count
       FROM meetings
       LEFT JOIN tc a ON a.meeting_id = meetings.id
       LEFT JOIN tc b ON b.meeting_id = meetings.source_id AND meetings.source_id <> meetings.id
      ORDER BY meetings.date DESC`
  ).all();
  return json({ data: result.results, count: result.results.length });
}

/**
 * Who owns a lab SERIES row (MNCCORE, Pulmonary HSR, CLIF WG): Nick, whoever
 * wrote it (Nick, 2026-10-09: "You own every series row: your PB debrief takes
 * ownership of a series row, and only you can flip it private or grant it.
 * Everyone still edits notes."). upsertMeeting stamps it on every series row it
 * inserts or merges onto.
 */
const SERIES_OWNER_SLUG = SITE_ADMIN_SLUG;

/** The owner a meeting of this title is written with: Nick for a series title, else the writer. */
function ownerForTitle(title: string, writerOwner: string | null): string | null {
  return isLabSeriesTitle(title) ? SERIES_OWNER_SLUG : writerOwner;
}

/**
 * Owner or the site admin: the only people who may flip a meeting's audience,
 * grant it to a project, or change its attendees. A series-titled row is
 * Nick's alone, even where its owner_slug still names a member (a row written
 * before the series ruling, or one whose re-own hit the per-owner index), so a
 * member can never hold the flip on a series row.
 */
function canManageMeetingAccess(viewer: Viewer, ownerSlug: string | null | undefined, title?: string | null): boolean {
  if (viewer.kind !== 'person') return false;
  if (isSiteAdmin(viewer)) return true;
  if (isLabSeriesTitle(title)) return false;
  return !!ownerSlug && ownerSlug === viewer.slug;
}

// GET /api/meetings/:id — single meeting with action items + agenda items.
// The route is auth: 'authed' (anonymous callers never reach this handler).
//
// Action items are TASK rows, read through the viewer-bound handle, so the
// caller gets the same task rule as every other feed (#145 Lane B).
export async function handleGetMeeting(id: string, env: Env, viewer?: Viewer): Promise<Response> {
  const meeting = await env.DB.prepare(
    `SELECT meetings.*, ${GRANTED_PROJECTS_SQL} AS granted_projects FROM meetings WHERE meetings.id = ?`
  ).bind(id).first<Record<string, unknown>>();
  if (!meeting) return error('Meeting not found', 404);

  // SEC-P2-02: exclude the private `notes` column from task rows returned in
  // the meeting detail (TASK_SELECT_COLS omits it; safeTaskRow is defense-in-
  // depth). Alias the table `t` and use TASK_SELECT_COLS verbatim so its
  // embedded project_id slug-resolution subquery (which references t.project_id)
  // resolves correctly. (The prior `.replace(/\bt\./g,'')` strip was a fragile
  // hack once project_id became a correlated subquery — aliasing is the root fix.)
  // Meeting agenda/notes (the meeting row itself) are team-internal-visible
  // by design. The task rows in action_items carry two risks: the private
  // `notes` column (handled here) and rows the caller may not see (the handle).
  //
  // v95: tasks.meeting_id may carry either the Hub-minted meeting id or PB's
  // calendar-match source_id, so the join matches either id space. NULL-safety
  // is by construction (`IN (id, NULL)` degrades to `= id`) — no guard needed.
  //
  // `t.deleted_at IS NULL` (2026-07-21): this query had NO tombstone filter, so
  // a soft-deleted action item kept coming back on every refetch of this page —
  // the deletion looked like it silently failed. Same contract as the task list
  // endpoint (tasks.ts handleGetTasks `deletedFilter`); `IS NULL` (not the
  // `OR = ''` variant at :321) is the app-wide form.
  const sourceId = (meeting as { source_id?: string | null }).source_id ?? null;
  const [actionItemsRaw, agendaItems] = await Promise.all([
    env.DB.prepare(
      `SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.meeting_id IN (?, ?) AND t.deleted_at IS NULL ORDER BY t.created_at`
    ).bind(id, sourceId ?? id).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at').bind(id).all(),
  ]);
  const actionItems = { ...actionItemsRaw, results: (actionItemsRaw.results ?? []).map(safeTaskRow) };

  return json({
    data: {
      ...meeting,
      action_items: actionItems.results,
      agenda_items: agendaItems.results,
      // Who may flip the audience and toggle project access: decided here,
      // not by the browser (the handlers below check it again).
      can_manage_access: viewer ? canManageMeetingAccess(viewer, meeting.owner_slug as string | null, meeting.title as string | null) : false,
    },
  });
}

// GET /api/meetings/:id/agenda — agenda items for a meeting.
// Auth-gated: agenda content is team-internal (mirrors the handleGetMeeting pattern).
// Unauth callers get 401 rather than internal meeting content.
export async function handleGetAgendaItems(meetingId: string, env: Env, isAuthed = false): Promise<Response> {
  if (!isAuthed) return error('Authentication required', 401);
  const result = await env.DB.prepare(
    'SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at'
  ).bind(meetingId).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/meetings/:id/agenda — add agenda item
export async function handleAddAgendaItem(meetingId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; project_id?: string; type?: string; document_url?: string };
  if (!body.content) return error('content required', 400);
  // #145: an INSERT is not a read, so the viewer-bound handle cannot stop an
  // agenda item landing on a meeting the caller cannot see. Read the parent
  // through the handle first; hidden and missing answer the same 404.
  const parent = await env.DB.prepare('SELECT id FROM meetings WHERE id = ?').bind(meetingId).first();
  if (!parent) return error('Meeting not found', 404);

  // Z3.2: canonicalize project_id before insert so agenda_items stores a
  // stable canonical slug (not a raw id or stale alias).
  const canonicalProjectId = body.project_id
    ? await projectRefToCanonical(env, body.project_id)
    : null;

  const id = generateId();
  const maxOrder = await env.DB.prepare('SELECT MAX(sort_order) as m FROM agenda_items WHERE meeting_id = ?').bind(meetingId).first<{ m: number | null }>();

  await env.DB.prepare(
    'INSERT INTO agenda_items (id, meeting_id, content, added_by, project_id, type, document_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, meetingId, body.content, user.email, canonicalProjectId, body.type ?? 'discussion', body.document_url ?? null, (maxOrder?.m ?? 0) + 1).run();

  await logActivity(env, 'agenda', `Added agenda item: "${body.content}"`, user.email, meetingId, 'meeting');

  const created = await env.DB.prepare('SELECT * FROM agenda_items WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/meetings/:id/agenda/reorder — reorder agenda items
export async function handleReorderAgenda(meetingId: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { ids: string[] }
  if (!body.ids?.length) return error('ids array required', 400)

  // Update sort_order based on array position
  const stmt = env.DB.prepare('UPDATE agenda_items SET sort_order = ? WHERE id = ? AND meeting_id = ?')
  const batch = body.ids.map((id, i) => stmt.bind(i + 1, id, meetingId))
  await env.DB.batch(batch)

  return json({ data: { ok: true } })
}

// POST /api/meetings/:id/notes — update meeting notes
export async function handleUpdateMeetingNotes(meetingId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { notes: string };
  const result = await env.DB.prepare(
    'UPDATE meetings SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(body.notes, meetingId).run();
  if (!result.meta || result.meta.changes === 0) return error('Meeting not found', 404);

  await logActivity(env, 'meeting', `Updated notes for meeting`, user.email, meetingId, 'meeting');

  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  return json({ data: updated });
}

// POST /api/meetings/:id/meta — edit meeting metadata (attendees/title/type/tags).
// This is the human path, so it may overwrite. What a later automated write
// (the PB debrief push, a Prep press) can do to each field is decided in
// upsertMeeting below, field by field:
//   - attendees: FILL-ONLY, so a non-empty list edited here survives every
//     later push. NULL and '[]' both count as empty and CAN be filled: an
//     empty list cleared here cannot be told apart in the stored data from
//     the '[]' that older Meetings-dialog inserts wrote, and leaving those
//     unfillable forever was the worse error.
//   - title: never touched by the dedup path (it is the match key).
//   - tags, type, facilitator: the push still REFRESHES them when it carries
//     a value (`COALESCE(?, col)`), so an edit here can be replaced by a push.
// (The comment this replaces said the PB pipeline only set these on INSERT;
// that stopped being true for attendees + type in b3ebe90b, 2026-07-15.)
// Date is NOT editable (it is half of the dedup key).
//
// audience (schema-v122): 'private' | 'lab', and only the meeting's owner or
// Nick may change it (Nick, 2026-10-09); a series row is Nick's alone. The
// attendee list sits behind the same check, because an attendee can read the
// meeting and Hermes gives an attendee its transcript: a member who could add
// an outside person here would be handing out access. A member who is not the
// owner may only take themselves off the list. Every other field stays
// editable by anyone who can see the meeting, a lab meeting included (Nick:
// "everybody should be able to edit because we'll still have the full
// transcript"). The PB key never sets audience: no automated writer decides
// who sees a meeting.
export async function handleUpdateMeetingMeta(meetingId: string, request: Request, user: AuthUser, env: Env, viewer: Viewer): Promise<Response> {
  const body = await request.json() as { attendees?: string[]; title?: string; type?: string; tags?: string[]; facilitator?: string | null; audience?: unknown };
  const sets: string[] = [];
  const binds: unknown[] = [];
  let audienceChange: string | null = null;
  if (body.audience !== undefined && !isMeetingAudience(body.audience)) {
    return error("audience must be 'private' or 'lab'", 400);
  }
  // audience and attendees both decide who sees the meeting (an attendee is a
  // read arm, and Hermes hands an attendee the transcript), so both sit behind
  // the same owner-or-Nick check. Read through the caller's handle: a meeting
  // they cannot see is 404.
  const current = body.audience !== undefined || Array.isArray(body.attendees)
    ? await env.DB.prepare('SELECT owner_slug, audience, title, attendees FROM meetings WHERE id = ?')
      .bind(meetingId).first<{ owner_slug: string | null; audience: string; title: string | null; attendees: string | null }>()
    : null;
  if ((body.audience !== undefined || Array.isArray(body.attendees)) && !current) return error('Meeting not found', 404);
  const manager = current ? canManageMeetingAccess(viewer, current.owner_slug, current.title) : false;
  if (body.audience !== undefined && current) {
    if (!manager) return error("Only the meeting's owner or Nick can change who sees it", 403);
    if (current.audience !== body.audience) {
      sets.push('audience = ?'); binds.push(body.audience);
      audienceChange = body.audience;
    }
  }
  if (Array.isArray(body.attendees) && current) {
    const attendees: NormalizedAttendees = await normalizeAttendees(env, body.attendees);
    // A member who is not the owner or Nick may take only themselves off the
    // list: the new list must be the stored one minus the caller.
    if (!manager && !isSelfRemoval(await storedAttendees(env, current.attendees), attendees, viewer)) {
      return error("Only the meeting's owner or Nick can change who attends; you can remove yourself", 403);
    }
    sets.push('attendees = ?'); binds.push(JSON.stringify(attendees));
  }
  if (typeof body.title === 'string' && body.title.trim()) { sets.push('title = ?'); binds.push(body.title.trim()); }
  if (typeof body.type === 'string' && body.type) { sets.push('type = ?'); binds.push(body.type); }
  if (Array.isArray(body.tags)) { sets.push('tags = ?'); binds.push(JSON.stringify(body.tags)); }
  // #102: facilitator is recorded, never derived. An explicit null clears it —
  // this is the one field where "unset it" is a real edit, because a wrong
  // facilitator is worse than none.
  if (body.facilitator === null) { sets.push('facilitator = NULL'); }
  else if (typeof body.facilitator === 'string' && body.facilitator.trim()) { sets.push('facilitator = ?'); binds.push(body.facilitator.trim()); }
  if (sets.length === 0) {
    // An audience already at the asked value is a no-op, not an error.
    if (body.audience !== undefined) {
      const same = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
      return json({ data: same });
    }
    return error('no editable fields provided', 400);
  }
  let result: D1Result;
  try {
    result = await env.DB.prepare(
      `UPDATE meetings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).bind(...binds, meetingId).run();
  } catch (e) {
    // schema-v122: one lab meeting per title per day. Marking this one lab,
    // or renaming a lab meeting, onto another lab meeting's title that day.
    // schema-v119: one meeting per owner per title per day (a rename onto
    // another of the owner's meetings that day).
    const collision = meetingCollision(e);
    if (collision === 'lab') return error('Another lab meeting with this title is already on this date', 409);
    if (collision === 'owner') return error("This meeting's owner already has a meeting with this title on this date", 409);
    throw e;
  }
  if (!result.meta || result.meta.changes === 0) return error('Meeting not found', 404);
  if (audienceChange) {
    await logActivity(env, 'meeting', audienceChange === 'lab' ? 'Marked as lab meeting' : 'Marked private', user.email, meetingId, 'meeting');
  }
  if (sets.length > (audienceChange ? 1 : 0)) {
    await logActivity(env, 'meeting', `Updated meeting details`, user.email, meetingId, 'meeting');
  }
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  return json({ data: updated });
}

/** The stored attendee column as the normalized list (a team email becomes its slug). */
async function storedAttendees(env: Env, column: string | null): Promise<NormalizedAttendees> {
  let parsed: unknown = [];
  if (column) {
    try { parsed = JSON.parse(column); } catch { parsed = []; } // total fallback on the next line: an unparseable column is an empty list
  }
  return normalizeAttendees(env, Array.isArray(parsed) ? parsed : []);
}

/** True when `next` is exactly `stored` with the caller taken off it (and the caller was on it). */
function isSelfRemoval(stored: readonly string[], next: readonly string[], viewer: Viewer): boolean {
  if (viewer.kind !== 'person') return false;
  const me = viewer.slug;
  if (!stored.includes(me)) return false;
  const expected = [...new Set(stored.filter((s) => s !== me))].sort();
  const got = [...new Set(next)].sort();
  return expected.length === got.length && expected.every((s, i) => s === got[i]);
}

// ── "Belongs to" grants (schema-v122) ────────────────────────────────────────
//
// Nick, 2026-10-09: on the meeting page the projects the meeting DISCUSSED
// show as faded pills; clicking one gives that project's members access to the
// meeting (the pill goes full contrast), clicking again takes it away, and
// "+ add project" covers a project the debrief did not detect. The grant is
// its own table (meeting_project_grants), never meetings.tags, so a PB re-push
// that rewrites tags cannot add or remove access.
//
// Only the meeting's owner or Nick may grant or revoke; the PB key may not
// (nothing automated writes a grant). Every read goes through the caller's
// handle: a meeting they cannot see is 404, and so is a project they are not
// on (the same answer as one that does not exist).

async function grantTarget(meetingId: string, viewer: Viewer, env: Env): Promise<Response | { owner: string | null }> {
  if (viewer.kind !== 'person') return error('Project access is given by a person on the meeting page', 403);
  const meeting = await env.DB.prepare('SELECT id, owner_slug, title FROM meetings WHERE id = ?')
    .bind(meetingId).first<{ id: string; owner_slug: string | null; title: string | null }>();
  if (!meeting) return error('Meeting not found', 404);
  if (!canManageMeetingAccess(viewer, meeting.owner_slug, meeting.title)) {
    return error("Only the meeting's owner or Nick can give a project access", 403);
  }
  return { owner: meeting.owner_slug };
}

async function grantedProjects(env: Env, meetingId: string): Promise<unknown[]> {
  const row = await env.DB.prepare(`SELECT ${GRANTED_PROJECTS_SQL} AS granted_projects FROM meetings WHERE meetings.id = ?`)
    .bind(meetingId).first<{ granted_projects: string | null }>();
  return row?.granted_projects ? JSON.parse(row.granted_projects) as unknown[] : [];
}

// POST /api/meetings/:id/projects  body { project: <project id or slug> }
export async function handleGrantMeetingProject(meetingId: string, request: Request, user: AuthUser, viewer: Viewer, env: Env): Promise<Response> {
  const target = await grantTarget(meetingId, viewer, env);
  if (target instanceof Response) return target;
  const body = await request.json().catch(() => null) as { project?: unknown } | null;
  const ref = typeof body?.project === 'string' ? body.project.trim() : '';
  if (!ref) return error('project (id or slug) required', 400);
  const project = await env.DB.prepare(
    'SELECT id, title, short_name FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL ORDER BY (id = ?) DESC LIMIT 1'
  ).bind(ref, ref, ref).first<{ id: string; title: string; short_name: string | null }>();
  if (!project) return error('Project not found', 404);
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO meeting_project_grants (meeting_id, project_id, granted_by) VALUES (?, ?, ?)'
  ).bind(meetingId, project.id, viewer.kind === 'person' ? viewer.slug : '').run();
  if ((res.meta?.changes ?? 0) > 0) {
    await logActivity(env, 'meeting', `Gave ${project.short_name || project.title} access`, user.email, meetingId, 'meeting');
  }
  return json({ data: await grantedProjects(env, meetingId), meeting_id: meetingId, project_id: project.id });
}

// DELETE /api/meetings/:id/projects/:projectId
export async function handleRevokeMeetingProject(meetingId: string, projectRef: string, user: AuthUser, viewer: Viewer, env: Env): Promise<Response> {
  const target = await grantTarget(meetingId, viewer, env);
  if (target instanceof Response) return target;
  const ref = (projectRef ?? '').trim();
  if (!ref) return error('project required', 400);
  // A grant to a project the caller can no longer see (or that was deleted)
  // is still removable by its id. A ref that is neither a project the caller
  // sees nor a project id this meeting is granted to is 404, the same answer
  // as the grant route gives.
  const project = await env.DB.prepare(
    'SELECT id, title, short_name FROM projects WHERE id = ? OR slug = ? ORDER BY (id = ?) DESC LIMIT 1'
  ).bind(ref, ref, ref).first<{ id: string; title: string; short_name: string | null }>();
  const projectId = project?.id ?? ref;
  if (!project) {
    const granted = await env.DB.prepare('SELECT 1 AS ok FROM meeting_project_grants WHERE meeting_id = ? AND project_id = ?')
      .bind(meetingId, projectId).first();
    if (!granted) return error('Project not found', 404);
  }
  const res = await env.DB.prepare('DELETE FROM meeting_project_grants WHERE meeting_id = ? AND project_id = ?')
    .bind(meetingId, projectId).run();
  if ((res.meta?.changes ?? 0) > 0) {
    await logActivity(env, 'meeting', `Removed ${project?.short_name || project?.title || projectId} access`, user.email, meetingId, 'meeting');
  }
  return json({ data: await grantedProjects(env, meetingId), meeting_id: meetingId, project_id: projectId });
}

// GET /api/meetings/:id/access?member=<slug> — the PB key only (Hermes).
//
// Whether a member may see this meeting, decided by the Hub's own rule
// (api/lib/table-scope.ts meetingArms), and through which arms. Hermes stages
// a meeting's transcript only when this says visible (Nick, 2026-10-09:
// access to a meeting covers its transcript), so the rule lives in one place
// and PB keeps no copy of it. An unknown member is not visible.
export async function handleMeetingAccess(meetingId: string, request: Request, env: Env): Promise<Response> {
  if (validateApiKey(request, env) !== true) return error('Forbidden — API key required', 403);
  const member = (new URL(request.url).searchParams.get('member') ?? '').trim().toLowerCase();
  if (!member) return error('member (team slug) required', 400);
  const exists = await env.DB.prepare('SELECT id FROM meetings WHERE id = ?').bind(meetingId).first();
  if (!exists) return error('Meeting not found', 404);
  const tm = await env.DB.prepare('SELECT slug, email FROM team_members WHERE lower(slug) = ? LIMIT 1')
    .bind(member).first<{ slug: string; email: string | null }>();
  if (!tm) return json({ data: { meeting_id: meetingId, member, visible: false, arms: [], reason: 'not a team member' } });
  let viewer: Viewer;
  try {
    viewer = personViewer({ slug: tm.slug, email: tm.email, pi: false });
  } catch {
    return json({ data: { meeting_id: meetingId, member, visible: false, arms: [], reason: 'unusable team identity' } });
  }
  const arms = meetingArms(viewer as Exclude<Viewer, { kind: 'service' }>);
  // The service handle is the raw database, so the arms' `main.` reads run as written.
  const row = await env.DB.prepare(
    `SELECT ${arms.map((a) => `CASE WHEN ${a.sql} THEN 1 ELSE 0 END AS ${a.arm}`).join(', ')} FROM meetings WHERE meetings.id = ?`
  ).bind(meetingId).first<Record<string, number>>();
  const held = arms.filter((a) => row?.[a.arm] === 1).map((a) => a.arm);
  return json({ data: { meeting_id: meetingId, member: tm.slug, visible: held.length > 0, arms: held } });
}

// GET /api/meetings/:id/prep — facilitator prep view data.
// Auth-gated: prep data contains task details, prior action items, activity log.
// Unauth callers get 401 (mirrors the handleGetMeeting pattern).
// Every read below goes through the caller's handle, so it holds only rows the
// caller may read (api/lib/table-scope.ts).
export async function handleMeetingPrep(meetingId: string, env: Env, isAuthed = false): Promise<Response> {
  if (!isAuthed) return error('Authentication required', 401);
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  if (!meeting) return error('Meeting not found', 404);


  // Find the previous meeting (for carry-forward context). MUST resolve
  // before the parallel fan-out below — prevActionItems depends on it.
  const prevMeeting = await env.DB.prepare(
    'SELECT id, date, title, source_id FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date as string).first<{ id: string; date: string; title: string; source_id: string | null }>();

  // T2.3 (2026-05-28): parallelize the 5 independent reads. recentActivity,
  // upcomingDeadlines, agendaItems, overdueTasks read disjoint tables on
  // disjoint params (today / twoWeeksAgo / twoWeeksOut / meetingId). prevActionItems
  // depends only on prevMeeting.id (already resolved). Sequential await on each
  // accumulated ~5x round-trip latency.
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksOut = ctToday(14);
  const today = ctToday();
  const [
    prevActionItemsRes,
    recentActivityRes,
    upcomingDeadlinesRes,
    agendaItemsRes,
    overdueTasksRes,
  ] = await Promise.all([
    // Action items from previous meeting (if any).
    // v95: matches either the Hub id or PB's calendar-match source_id.
    prevMeeting
      ? env.DB.prepare(
          `SELECT t.id, t.description, t.assignee, t.completed, t.due_date
           FROM tasks t
           WHERE t.meeting_id IN (?, ?) AND t.deleted_at IS NULL
           ORDER BY t.completed ASC, t.assignee`
        ).bind(prevMeeting.id, prevMeeting.source_id ?? prevMeeting.id).all()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    // Recent project activity (last 14 days) — stage changes, completed tasks, comments.
    env.DB.prepare(
      `SELECT a.type, a.description, a.actor, a.related_id as entity_id, a.related_type as entity_type, a.timestamp as created_at
       FROM activity_log a
       WHERE a.timestamp > ?
       ORDER BY a.timestamp DESC LIMIT 30`
    ).bind(twoWeeksAgo).all(),
    // Upcoming deadlines (next 14 days)
    env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.priority, t.status
       FROM tasks t
       WHERE t.due_date BETWEEN ? AND ? AND t.completed = 0 AND t.deleted_at IS NULL
       ORDER BY t.due_date`
    ).bind(today, twoWeeksOut).all(),
    // Current meeting's agenda items
    env.DB.prepare(
      'SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at'
    ).bind(meetingId).all(),
    // Overdue tasks
    env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.priority
       FROM tasks t
       WHERE t.due_date < ? AND t.completed = 0 AND t.deleted_at IS NULL
       ORDER BY t.due_date`
    ).bind(today).all(),
  ]);
  const prevActionItems = prevActionItemsRes.results;
  const recentActivity = recentActivityRes.results;
  const upcomingDeadlines = upcomingDeadlinesRes.results;
  const agendaItems = agendaItemsRes.results;
  const overdueTasks = overdueTasksRes.results;

  return json({
    data: {
      meeting,
      previousMeeting: prevMeeting,
      previousActionItems: prevActionItems,
      recentActivity,
      upcomingDeadlines,
      overdueTasks,
      agendaItems,
    },
  });
}

// GET /api/meetings/:id/generate-agenda — autogenerate agenda from carried-forward + open items.
// Auth-gated: generated agenda surfaces task titles, assignees, regulatory items (internal).
// Unauth callers get 401 (mirrors the handleGetMeeting pattern).
// Every read goes through the caller's handle (api/lib/table-scope.ts).
export async function handleGenerateAgenda(meetingId: string, env: Env, isAuthed = false): Promise<Response> {
  if (!isAuthed) return error('Authentication required', 401);
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first<{ id: string; title: string; date: string }>();
  if (!meeting) return error('Meeting not found', 404);

  // Find the previous meeting date for context
  const prevMeeting = await env.DB.prepare(
    'SELECT id, date FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date).first<{ id: string; date: string }>();

  const prevDate = prevMeeting?.date ?? '1970-01-01';

  const today = ctToday();
  const weekOut = ctToday(7);

  // T2.3 (2026-05-28): parallelize the 5 disjoint queries below. Each reads
  // a different table (tasks JOIN meetings / tasks / projects / regulatory_items /
  // project_updates) on disjoint params (all derived from prevDate / meeting.date /
  // today / weekOut, all available at fan-out time). Sequential await accumulated
  // ~5x round-trip latency on a frequent-ish endpoint (agenda generation).
  const [carriedForward, urgentTasks, stalledProjects, regulatory, recentUpdates] = await Promise.all([
    // 1. Carried-forward and open action items from previous meetings.
    // v95: JOIN matches either id space; NULL-safe by construction
    // (`IN (m.id, NULL)` degrades to `= m.id`) — no guard needed.
    env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.status
       FROM tasks t
       JOIN meetings m ON t.meeting_id IN (m.id, m.source_id)
       WHERE m.date < ? AND t.deleted_at IS NULL AND (t.completed = 0 OR t.status NOT IN ('done','completed'))
       ORDER BY m.date DESC, t.created_at
       LIMIT 20`
    ).bind(meeting.date).all<{ id: string; title: string; description: string; assignee: string; due_date: string; status: string }>(),
    // 2. Urgent / high-priority open tasks due this week
    env.DB.prepare(
      `SELECT t.id, t.title, t.assignee, t.due_date, t.priority, t.status
       FROM tasks t
       WHERE t.status IN ('todo','in_progress','waiting_external')
         AND t.priority IN ('high','urgent')
         AND t.due_date BETWEEN ? AND ?
         AND (t.deleted_at IS NULL OR t.deleted_at = '')
       ORDER BY t.due_date
       LIMIT 15`
    ).bind(today, weekOut).all<{ id: string; title: string; assignee: string; due_date: string; priority: string; status: string }>(),
    // 3. Stalled manuscripts / projects (in active status but not updated in 30+ days)
    env.DB.prepare(
      `SELECT id, title, stage, category, updated_at
       FROM projects
       WHERE status IN ('active','In Review','In Preparation')
         AND julianday('now') - julianday(updated_at) > 30
       ORDER BY updated_at ASC
       LIMIT 8`
    ).all<{ id: string; title: string; stage: string; category: string; updated_at: string }>(),
    // 4. Regulatory items expiring within 60 days
    env.DB.prepare(
      `SELECT r.id, r.title, r.item_type, r.expiration_date, r.status
       FROM regulatory_items r
       WHERE r.status IN ('active','action_needed','expiring_soon')
         AND r.expiration_date < date('now', '+60 days')
       ORDER BY r.expiration_date ASC
       LIMIT 10`
    ).all<{ id: string; title: string; item_type: string; expiration_date: string; status: string }>(),
    // 5. Recent project updates since previous meeting (activity_entries kind='update')
    env.DB.prepare(
      `SELECT ae.id, ae.body AS content, ae.update_type, ae.actor_slug AS author, ae.created_at, p.title as project_title
       FROM activity_entries ae
       LEFT JOIN projects p ON ae.project_id = p.id
       WHERE ae.entity_type='project' AND ae.kind='update' AND ae.hidden_at IS NULL AND ae.created_at > ?
       ORDER BY ae.created_at DESC
       LIMIT 15`
    ).bind(prevDate).all<{ id: string; content: string; update_type: string; author: string; created_at: string; project_title: string }>(),
  ]);

  return json({
    meeting_id: meetingId,
    title: `Agenda: ${meeting.title}`,
    generated_at: nowInstant(),
    sections: [
      {
        title: 'Carried-forward action items',
        items: carriedForward.results.map(r => ({
          id: r.id,
          label: r.title || r.description,
          assignee: r.assignee,
          due_date: r.due_date,
          status: r.status,
        })),
      },
      {
        title: 'Urgent tasks this week',
        items: urgentTasks.results.map(r => ({
          id: r.id,
          label: r.title,
          assignee: r.assignee,
          due_date: r.due_date,
          priority: r.priority,
        })),
      },
      {
        title: 'Stalled projects (30+ days inactive)',
        items: stalledProjects.results.map(r => ({
          id: r.id,
          label: r.title,
          stage: r.stage,
          category: r.category,
          last_updated: r.updated_at,
        })),
      },
      {
        title: 'Regulatory items expiring soon',
        items: regulatory.results.map(r => ({
          id: r.id,
          label: r.title,
          item_type: r.item_type,
          expiration_date: r.expiration_date,
          status: r.status,
        })),
      },
      {
        title: 'Recent project updates',
        items: recentUpdates.results.map(r => ({
          id: r.id,
          label: r.project_title ? `[${r.project_title}] ${r.content}` : r.content,
          author: r.author,
          created_at: r.created_at,
          update_type: r.update_type,
        })),
      },
    ],
  });
}

// R10-5 — normalize title before comparison so "MNCCORE Lab Sync",
// "mnccore lab sync", and "  MNCCORE Lab  Sync  " all collapse into one
// meeting on the same date. The prior dedup missed casing and whitespace
// variants and let a duplicate meeting through on 2026-04-07 (see DI-7).
function normalizeMeetingTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// POST /api/meetings — create meeting (dedup by date+normalized title).
//
// Slice 4 (2026-05-29): the PB meeting-debrief pipeline POSTs the structured
// `notes` (and optional `decisions`) summary here. Both columns already exist
// in schema-v2.sql (no migration). Two paths persist them now:
//   - INSERT path: notes/decisions land on first push.
//   - DEDUP (upsert) path: when a meeting on the same (date, normalized title)
//     already exists, a re-push that CARRIES a summary UPDATEs notes/decisions
//     so a summary generated AFTER the first (summary-less) push refreshes the
//     row. We never clobber an existing non-null value with a null payload
//     (COALESCE-style guard in SQL), so a bare insert-only re-push is a no-op
//     on those fields.
//
// Multi-tagging (schema-v72, 2026-05-29): the PB push also carries `tags` — a
// JSON array of every project slug (+ topic keyword) the meeting discussed (NOT
// confidence-gated; routing stays gated, tags reflect everything touched). It
// is persisted exactly like notes/decisions: JSON.stringify'd into the INSERT
// and COALESCE-upserted on the dedup path so a null/absent `tags` never wipes
// an existing value. Column added by api/schema-v72-meetings-tags.sql.
//
// attendees + type on the dedup path (2026-07-15): PB commit c8e4ff306
// (2026-07-07) made the push carry `attendees` (parsed from the note's
// frontmatter, omitted only when empty/unparseable) and `type` ("one-on-one"
// heuristic, otherwise omitted) on EVERY push, not just the first — see
// shared-schema-registry.md "/meetings push payload" entry. Until b3ebe90b
// only the INSERT branch persisted them, so any meeting that already had a
// Hub row kept NULL attendees forever. `type` follows the COALESCE-on-
// carried-value pattern of notes/decisions/tags.
//
// attendees are FILL-ONLY (2026-10-05, #2225): a stored non-empty list wins,
// like source_id. b3ebe90b made them carried-wins, which let any later push
// replace a list a person had edited in the picker (handleUpdateMeetingMeta).
// A push still fills an EMPTY list (NULL or '[]'), which is what b3ebe90b was
// fixing; '[]' counts as empty because older Meetings-dialog inserts stored it
// and nothing in the row tells it apart from a picker clear. Every attendee
// list is normalized first
// (api/lib/meeting-write.ts, #551): team emails become slugs, everything else
// is kept.
export async function handleCreateMeeting(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    date: string; title: string; type?: string; attendees?: string[];
    notes?: string | null; decisions?: string | null; tags?: string[] | null;
    source_id?: string | null; facilitator?: string | null;
  };
  if (!body.date || !body.title) return error('date and title required', 400);
  const writer = await meetingWriter(request, user, env);
  return upsertMeeting(env, writer, {
    date: body.date,
    title: body.title,
    type: body.type,
    attendees: await normalizeAttendees(env, body.attendees),
    notes: body.notes,
    decisions: body.decisions,
    tags: body.tags,
    // source_id is PB's calendar-match identity (v95: UNIQUE where not NULL).
    // Only the PB service may set it: a member's value could squat on the id
    // PB is about to push (blocking Nick's debrief with a UNIQUE 500), and that
    // 500 would also tell the member the id exists.
    source_id: writer.service ? body.source_id : undefined,
    facilitator: body.facilitator,
  });
}

/**
 * The owner a new meeting is stamped with: the caller's session slug (the PB
 * API key's user is PB_SERVICE_SLUG, nick-ingraham). Never a body field. The
 * credential-less local-dev caller ('anonymous') owns nothing.
 */
function meetingOwner(user: AuthUser): string | null {
  const slug = (user.slug ?? '').trim();
  return slug && slug !== 'anonymous' ? slug : null;
}

/** Who is writing a meeting, as upsertMeeting needs to know it. */
interface MeetingWriter {
  user: AuthUser;
  owner: string | null;
  /** The PB service key: may set source_id and dedups on it first. */
  service: boolean;
}

async function meetingWriter(request: Request, user: AuthUser, env: Env): Promise<MeetingWriter> {
  return {
    user,
    owner: meetingOwner(user),
    service: validateApiKey(request, env) === true,
  };
}

// An owner-less row the PB service may adopt: created BEFORE schema-v119 was
// applied (its schema_migrations.applied_at). Every such row predates any
// second writer and is PB's. A NULL-owner row created after it was written
// in the deploy window by the old Worker, possibly from a member's Prep press,
// so it is never adopted at runtime; the backfill's --window-start review
// decides it. No ledger row (v119 not applied) adopts nothing.
const ADOPTABLE_UNOWNED = `owner_slug IS NULL AND datetime(created_at) < (SELECT datetime(applied_at) FROM schema_migrations WHERE version = 119)`;

interface MeetingUpsert {
  date: string; title: string; type?: string;
  attendees: NormalizedAttendees;
  notes?: string | null; decisions?: string | null; tags?: string[] | null;
  source_id?: string | null; facilitator?: string | null;
}

/**
 * Which meetings UNIQUE index refused a write, if either:
 *   'lab'   schema-v122 idx_meetings_lab_date_title, one lab row per title per
 *           day. An expression index, so SQLite names the INDEX:
 *           "UNIQUE constraint failed: index 'idx_meetings_lab_date_title'".
 *   'owner' schema-v119 idx_meetings_owner_date_title, a plain column index, so
 *           SQLite names the COLUMNS:
 *           "UNIQUE constraint failed: meetings.owner_slug, meetings.date, meetings.title".
 * Kept apart so a per-owner refusal is never answered as a lab-title one.
 */
function meetingCollision(e: unknown): 'lab' | 'owner' | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/UNIQUE constraint failed/i.test(msg)) return null;
  if (/idx_meetings_lab_date_title/.test(msg)) return 'lab';
  if (/idx_meetings_owner_date_title|meetings\.owner_slug, meetings\.date, meetings\.title/.test(msg)) return 'owner';
  return null;
}

type Candidate = { id: string; date: string; title: string; notes: string | null; owner_slug: string | null; audience?: string };

/**
 * The lab meeting of this series title on this date, whoever owns it, or
 * undefined. Only for a title that is itself a lab series
 * (shared/meetingAudience.ts), and only onto a row that is lab: a member's
 * private "Journal club" never merges into a lab "Journal club" (its notes
 * would go lab-wide); a series title would have been lab anyway, so the merge
 * exposes nothing new.
 */
async function findLabSeriesRow(env: Env, date: string, title: string): Promise<Candidate | undefined> {
  if (!isLabSeriesTitle(title)) return undefined;
  const normalized = normalizeMeetingTitle(title);
  const lab = await env.DB.prepare(
    `SELECT * FROM meetings WHERE date = ? AND audience = 'lab' ORDER BY created_at, id`
  ).bind(date).all<Candidate>();
  return (lab.results ?? []).find((m) => normalizeMeetingTitle(m.title) === normalized);
}

// The one INSERT-or-dedup-UPDATE for meetings, shared by POST /api/meetings
// and POST /api/meetings/prep-from-event. Keyed on (owner, date, normalized
// title) since schema-v119: the old key had no owner, so a member's Prep press
// on "Lab meeting" merged into (and was answered with) another member's row of
// the same title and day, notes included. Two people's same-titled meetings
// are now two rows.
//
// schema-v122: a LAB series meeting (MNCCORE, Pulmonary HSR, CLIF WG) is one
// row whoever writes it first: a member's Prep press before the meeting and
// Nick's debrief push after it land on the same row (match step 2 below), and
// a unique index makes a racing second INSERT impossible (it retries onto the
// winner). A new row's audience comes from its title here and nowhere else;
// the caller has no audience field.
//
// Series rows are Nick's (Nick, 2026-10-09, see SERIES_OWNER_SLUG): a series
// row is INSERTED with owner Nick whoever writes it, and every write that
// lands on one re-owns it to Nick. Outside that, the dedup path never rewrites
// a non-NULL owner.
//
// A write onto a row someone else owns (a member's Prep or create POST landing
// on Nick's series row) is FILL-ONLY for every field: it may fill an empty
// notes/decisions/tags/type/facilitator, never replace one, and never touches
// attendees (who attends decides who sees the meeting, so only the owner or
// Nick sets it, on the meeting page). Editing notes stays open to everyone
// who can see the meeting through POST /api/meetings/:id/notes, the human path.
async function upsertMeeting(env: Env, writer: MeetingWriter, input: MeetingUpsert): Promise<Response> {
  const { owner, user } = writer;
  // The owner this title's row is written with: Nick for a series title.
  const rowOwner = ownerForTitle(input.title, owner);
  // #102: who actually ran the meeting. The UI used to DERIVE this from a hash
  // of the date, so it was wrong ~always; now it renders the stored value or
  // nothing. Give the value a writer so the read isn't pointed at a column
  // nothing fills (the `Project.lastActivity` mistake, #95). Absent/empty never
  // wipes an existing value — same COALESCE-on-carried-value rule as the rest.
  const facilitator = typeof input.facilitator === 'string' && input.facilitator.trim()
    ? input.facilitator.trim()
    : null;

  // `tags` arrives as an array; persist as a JSON string (matches `attendees`).
  // An explicit null / absent tags stays null so the COALESCE guard below can
  // distinguish "no tags this push" from "wipe the tags".
  const tagsJson = Array.isArray(input.tags) ? JSON.stringify(input.tags) : null;

  // An EMPTY attendee list is the same as absent on both paths: NULL on
  // INSERT (so a later push can still fill it) and no-op on the dedup path.
  const attendeesJson = attendeesColumnValue(input.attendees);

  const normalizedTitle = normalizeMeetingTitle(input.title);

  // Fetch candidates on the same date and normalize each one's title before
  // comparing. This beats a naive `WHERE date=? AND title=?` match which would
  // miss "Lab Meeting" vs "lab  meeting".
  //
  // Match order:
  //   1. the PB service with a source_id: that row, whoever owns it. source_id
  //      is PB's identity for the meeting and UNIQUE; a re-push of a row the
  //      title match would miss must update it, not 500 or duplicate.
  //   2. a lab series title: the lab row of that title on that date, whoever
  //      owns it (findLabSeriesRow);
  //   3. the rows of this title's owner on that date (the caller's own, or
  //      Nick's for a series title), by normalized title;
  //   4. for the PB key only, an owner-less row on that date created before
  //      schema-v119 was applied (ADOPTABLE_UNOWNED), which it then adopts.
  // The dedup path never rewrites a non-NULL owner (a series row's re-own to
  // Nick aside), nor audience.
  let existing: Candidate | undefined;
  if (writer.service && input.source_id) {
    existing = (await env.DB.prepare('SELECT * FROM meetings WHERE source_id = ? LIMIT 1')
      .bind(input.source_id).first<Candidate>()) ?? undefined;
  }
  if (!existing) existing = await findLabSeriesRow(env, input.date, input.title);
  if (!existing) {
    const sameDate = await env.DB.prepare(
      `SELECT * FROM meetings WHERE date = ? AND (owner_slug IS ? OR (? = 1 AND ${ADOPTABLE_UNOWNED}))`
    ).bind(input.date, rowOwner, writer.service ? 1 : 0).all<Candidate>();
    const titled = (sameDate.results ?? []).filter((m) => normalizeMeetingTitle(m.title) === normalizedTitle);
    existing = titled.find((m) => m.owner_slug !== null) ?? titled[0];
  }
  if (existing && existing.owner_slug === null && rowOwner && writer.service) {
    // A source_id match can land here on a window row; the same cutoff decides.
    const stamped = await env.DB.prepare(`UPDATE meetings SET owner_slug = ? WHERE id = ? AND ${ADOPTABLE_UNOWNED}`)
      .bind(rowOwner, existing.id).run();
    if (stamped.meta?.changes) existing = { ...existing, owner_slug: rowOwner };
  }

  // Upsert onto an existing row: if the push carries notes/decisions/tags/type,
  // refresh the row. The COALESCE-on-carried-value pattern means an
  // absent/empty field never wipes an existing value — only a provided
  // (non-null / non-empty) value overwrites. attendees and source_id are the
  // opposite direction, FILL-ONLY (existing wins): source_id is identity, and
  // attendees may hold a person's edit (see the header above). attendees fill
  // when NULL or '[]'; a NULL bind leaves the column as it is.
  //
  // A row owned by someone other than the writer (after a series row's re-own)
  // takes every field FILL-ONLY and no attendees at all (see the header above).
  const updateExisting = async (found: Candidate): Promise<Response> => {
    const row = await reownSeriesRow(env, found);
    const crossOwner = row.owner_slug !== owner;
    const hadNotes = !!row.notes;
    const hasNotes = input.notes !== undefined && input.notes !== null;
    const hasDecisions = input.decisions !== undefined && input.decisions !== null;
    const hasTags = tagsJson !== null;
    const hasAttendees = attendeesJson !== null && !crossOwner;
    // type: only overwrite when the payload carries a real value — never
    // clobber an existing row's type with a default.
    const hasType = typeof input.type === 'string' && input.type.length > 0;
    if (!(hasNotes || hasDecisions || hasTags || hasAttendees || hasType || input.source_id || facilitator)) {
      const unchanged = row === found ? row : await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(row.id).first();
      return json({ data: unchanged }, 200);
    }
    // The carried value replaces the column, or, on a cross-owner write, only
    // fills it while it is empty.
    const refresh = (col: string, empty: string) => crossOwner
      ? `${col} = CASE WHEN ${col} IS NULL OR ${empty} THEN COALESCE(?, ${col}) ELSE ${col} END`
      : `${col} = COALESCE(?, ${col})`;
    await env.DB.prepare(
      `UPDATE meetings
          SET ${refresh('notes', "notes = ''")},
              ${refresh('decisions', "decisions = ''")},
              ${refresh('tags', "tags = '[]'")},
              attendees = CASE WHEN attendees IS NULL OR attendees = '[]' THEN COALESCE(?, attendees) ELSE attendees END,
              ${refresh('type', "type = ''")},
              ${refresh('facilitator', "facilitator = ''")},
              source_id = COALESCE(source_id, ?),
              updated_at = datetime('now')
        WHERE id = ?`
    ).bind(
      hasNotes ? input.notes : null,
      hasDecisions ? input.decisions : null,
      hasTags ? tagsJson : null,
      hasAttendees ? attendeesJson : null,
      hasType ? input.type : null,
      facilitator,
      input.source_id ?? null,
      row.id,
    ).run();
    if (hasNotes && !hadNotes) {
      // The debrief bell rings for whoever wrote the debrief when that is the
      // PB service (Nick's push onto a lab row a member prepped rings Nick,
      // not the member); otherwise for the row's owner.
      const recipient = writer.service ? (owner ?? row.owner_slug) : row.owner_slug;
      await fireMeetingDebriefNotification(env, row.id, input.source_id ?? null, input.title, recipient);
    }
    const refreshed = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(row.id).first();
    return json({ data: refreshed }, 200);
  };

  if (existing) return updateExisting(existing);

  const id = `mtg-${input.date}-${generateId().slice(0, 8)}`;
  try {
    await env.DB.prepare(
      'INSERT INTO meetings (id, date, title, type, attendees, notes, decisions, tags, status, source_id, facilitator, owner_slug, audience) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      // type: whatever the writer said, or NULL. The old 'biweekly' default
      // stamped every Prep row and every untyped push a biweekly meeting.
      id, input.date, input.title, typeof input.type === 'string' && input.type ? input.type : null,
      attendeesJson,
      input.notes ?? null, input.decisions ?? null, tagsJson, 'upcoming',
      input.source_id ?? null, facilitator, rowOwner, initialAudience(input.title),
    ).run();
  } catch (e) {
    const collision = meetingCollision(e);
    if (!collision) throw e;
    // Another writer inserted this lab meeting between our lookup and our
    // INSERT. Land on its row instead (once; a second miss is a real error).
    // A series row is Nick's either way, so a race can trip either index.
    const winner = await findLabSeriesRow(env, input.date, input.title);
    if (winner) return updateExisting(winner);
    // A member writing a series title whose row Nick already has that day but
    // the member cannot see (Nick made it private): the series row is Nick's,
    // so the member gets no twin of it.
    if (collision === 'owner' && rowOwner !== owner) {
      return error('A meeting with this title already exists on this date', 409);
    }
    throw e;
  }

  await logActivity(env, 'meeting', `Created meeting: "${input.title}" on ${input.date}`, user.email, id, 'meeting');

  if (input.notes !== undefined && input.notes !== null) {
    await fireMeetingDebriefNotification(env, id, input.source_id ?? null, input.title, owner);
  }

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

/**
 * A series-titled row is Nick's (SERIES_OWNER_SLUG): stamp it on any row a
 * write lands on. Through the caller's handle, so only a row they can see. If
 * Nick already has a row of this title that day (the v119 per-owner index),
 * the owner stays as it is; canManageMeetingAccess still treats the row as
 * Nick's alone by its title.
 */
async function reownSeriesRow(env: Env, row: Candidate): Promise<Candidate> {
  if (!isLabSeriesTitle(row.title) || row.owner_slug === SERIES_OWNER_SLUG) return row;
  try {
    const res = await env.DB.prepare('UPDATE meetings SET owner_slug = ? WHERE id = ?')
      .bind(SERIES_OWNER_SLUG, row.id).run();
    return res.meta?.changes ? { ...row, owner_slug: SERIES_OWNER_SLUG } : row;
  } catch (e) {
    if (meetingCollision(e) !== 'owner') throw e;
    return row;
  }
}

const CIVIL_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The civil day `days` after a YYYY-MM-DD, as YYYY-MM-DD (UTC arithmetic on a date-only value). */
function shiftCivilDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  // eslint-disable-next-line local/time-discipline -- R21 targets reading "today" from a UTC clock; this is pure arithmetic on a date-only input built with Date.UTC, so the UTC slice IS the civil day.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// POST /api/meetings/prep-from-event — body { uid, start_at, day } (#2225).
//
// The Today Prep pill: make (or find) the Hub meeting for one of the caller's
// own calendar rows. Title and attendees are copied SERVER-SIDE from the
// calendar cache, so the client has no attendee field to forget or forge.
// The row is looked up by (uid, start_at), schema v61's natural key, which a
// re-poll keeps; the cache row `id` is re-minted every poll, so it is not
// accepted. `day` is the civil day the row was rendered on (the meetings
// table is keyed by date); it must fall within the event's span, one day of
// slack each side for time zones.
//
// Never writes source_id: that slot is set-once and belongs to the PB debrief
// push (CLAUDE.md rule 83; 9f41f605). Attendees go through upsertMeeting, so on
// an existing meeting they only fill an empty list. An event with no
// attendees (or a cache row written before v116) seeds NULL, so the debrief
// push can still fill it.
export async function handlePrepMeetingFromEvent(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { uid?: unknown; start_at?: unknown; day?: unknown } | null;
  const uid = typeof body?.uid === 'string' ? body.uid : '';
  const startAt = typeof body?.start_at === 'string' ? body.start_at : '';
  const day = typeof body?.day === 'string' ? body.day : '';
  if (!uid || !startAt || !CIVIL_DAY_RE.test(day)) return error('uid, start_at and day (YYYY-MM-DD) required', 400);

  // Same owner key the poller writes (calendar-feeds.ts handleAddFeed).
  const ev = await env.DB.prepare(
    `SELECT summary, start_at, end_at, attendees
       FROM user_calendar_events
      WHERE user_slug = ? AND uid = ? AND start_at = ?
      LIMIT 1`
  ).bind(user.slug, uid, startAt).first<{ summary: string | null; start_at: string; end_at: string | null; attendees: string | null }>();
  if (!ev) return error('Calendar event not found. The calendar may have refreshed; reload and try again.', 404);

  const firstDay = shiftCivilDay(ev.start_at.slice(0, 10), -1);
  const lastDay = shiftCivilDay((ev.end_at ?? ev.start_at).slice(0, 10), 1);
  if (day < firstDay || day > lastDay) return error('day is outside the event', 400);

  // The poller writes this column with JSON.stringify; a parse failure is a
  // bug worth a 500, not a silent empty list.
  const cached: unknown = ev.attendees ? JSON.parse(ev.attendees) : [];
  return upsertMeeting(env, await meetingWriter(request, user, env), {
    date: day,
    title: ev.summary?.trim() || '(no title)',
    attendees: await normalizeAttendees(env, cached),
  });
}
