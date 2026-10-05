import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, safeTaskRow, projectRefToCanonical, pbTaskVisibilitySql, actorSlug } from '../helpers';
import { TASK_SELECT_COLS } from '../lib/task-cols';
import { normalizeAttendees, attendeesColumnValue, type NormalizedAttendees } from '../lib/meeting-write';
import { ctToday } from '../lib/ct-date';
import { nowInstant } from '../lib/time';

// GET /api/meetings/next — next upcoming meeting (lightweight, for sidebar badge)
export async function handleNextMeeting(env: Env): Promise<Response> {
  const today = ctToday()
  const result = await env.DB.prepare(
    'SELECT id, title, date FROM meetings WHERE date >= ? ORDER BY date ASC LIMIT 1'
  ).bind(today).first()
  return json({ data: result || null })
}

// AM-3 (SEC-T0-1): public-safe meeting columns. Excludes internal meeting
// content — `agenda`, `notes`, `decisions`, `attendees` — which the public
// `SELECT *` previously leaked. Authed callers (the gated /portal/meetings
// list page) get the full row so the existing UI keeps rendering those fields.
const MEETING_PUBLIC_COLS = 'id, date, title, type, status, facilitator, created_at, updated_at, source_id';

// One-shot "debrief landed" bell: fires only when a push transitions a meeting
// from notes-less to notes-full (insert-with-notes or first notes upsert).
// Later re-pushes surface via the entity_seen teal dot, never a second bell.
async function fireMeetingDebriefNotification(env: Env, meetingId: string, sourceId: string | null, title: string): Promise<void> {
  const ids = sourceId ? [meetingId, sourceId] : [meetingId];
  const placeholders = ids.map(() => '?').join(',');
  const cnt = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM tasks WHERE meeting_id IN (${placeholders}) AND deleted_at IS NULL`
  ).bind(...ids).first<{ n: number }>();
  const n = cnt?.n ?? 0;
  await env.DB.prepare(
    'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    generateId(), 'nick-ingraham', 'meeting_debrief', 'meeting', meetingId,
    `Meeting debriefed: ${title}`,
    n > 0 ? `${n} task${n === 1 ? '' : 's'} linked — review, edit, or reassign` : 'Notes ready to review',
    `/portal/meetings/${meetingId}`,
  ).run();
}

// GET /api/meetings — list all meetings
// `isAuthed` true when the caller has a valid JWT or API key (resolved by the
// index.ts router). Unauth callers get the redacted projection.
export async function handleGetMeetings(env: Env, isAuthed = false): Promise<Response> {
  const cols = isAuthed ? '*' : MEETING_PUBLIC_COLS;
  const result = await env.DB.prepare(
    `SELECT ${cols} FROM meetings ORDER BY date DESC`
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/meetings/:id — single meeting with action items + agenda items.
// `isAuthed` true when the caller has a valid JWT or API key (resolved by
// index.ts, mirroring the handleGetMeetings pattern). Unauth callers get the
// public-safe column projection; authed callers get the full row.
//
// `canSeePb` (#8842 R6): action items are TASK rows, so a non-PI caller gets
// the same PB-project filter as every other task feed (pbTaskVisibilitySql).
// Before this the route returned PB-private tasks to any authed team member.
export async function handleGetMeeting(id: string, env: Env, isAuthed = false, canSeePb = false): Promise<Response> {
  const cols = isAuthed ? '*' : MEETING_PUBLIC_COLS;
  const meeting = await env.DB.prepare(`SELECT ${cols} FROM meetings WHERE id = ?`).bind(id).first();
  if (!meeting) return error('Meeting not found', 404);

  // SEC-P2-02: exclude the private `notes` column from task rows returned in
  // the meeting detail (TASK_SELECT_COLS omits it; safeTaskRow is defense-in-
  // depth). Alias the table `t` and use TASK_SELECT_COLS verbatim so its
  // embedded project_id slug-resolution subquery (which references t.project_id)
  // resolves correctly. (The prior `.replace(/\bt\./g,'')` strip was a fragile
  // hack once project_id became a correlated subquery — aliasing is the root fix.)
  // Meeting agenda/notes (the meeting row itself) are team-internal-visible
  // by design. The task rows in action_items carry two risks: the private
  // `notes` column (handled here) and PB-private ROWS (pbTaskVisibilitySql).
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
      `SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.meeting_id IN (?, ?) AND t.deleted_at IS NULL${pbTaskVisibilitySql('t', canSeePb)} ORDER BY t.created_at`
    ).bind(id, sourceId ?? id).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at').bind(id).all(),
  ]);
  const actionItems = { ...actionItemsRaw, results: (actionItemsRaw.results ?? []).map(safeTaskRow) };

  return json({
    data: {
      ...meeting,
      action_items: actionItems.results,
      agenda_items: agendaItems.results,
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
export async function handleUpdateMeetingMeta(meetingId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { attendees?: string[]; title?: string; type?: string; tags?: string[]; facilitator?: string | null };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (Array.isArray(body.attendees)) {
    const attendees: NormalizedAttendees = await normalizeAttendees(env, body.attendees);
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
  if (sets.length === 0) return error('no editable fields provided', 400);
  const result = await env.DB.prepare(
    `UPDATE meetings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...binds, meetingId).run();
  if (!result.meta || result.meta.changes === 0) return error('Meeting not found', 404);
  await logActivity(env, 'meeting', `Updated meeting details`, user.email, meetingId, 'meeting');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  return json({ data: updated });
}

// GET /api/meetings/:id/prep — facilitator prep view data.
// Auth-gated: prep data contains task details, prior action items, activity log.
// Unauth callers get 401 (mirrors the handleGetMeeting pattern).
// Phase 1b-extended: cross-project feed; filter PB-category rows for non-PI.
// `canSeePb` is piped from the dispatch site (`await isPiRequest(...)`).
export async function handleMeetingPrep(meetingId: string, env: Env, isAuthed = false, canSeePb = false): Promise<Response> {
  if (!isAuthed) return error('Authentication required', 401);
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  if (!meeting) return error('Meeting not found', 404);

  // Task rows only: the shared rule (fails closed on an unknown project ref,
  // like canSeePbProject). The LEFT JOIN projects this used to need is gone.
  const pbTasks = pbTaskVisibilitySql('t', canSeePb);

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
    // Action items from previous meeting (if any). PB-filtered via the join.
    // v95: matches either the Hub id or PB's calendar-match source_id.
    prevMeeting
      ? env.DB.prepare(
          `SELECT t.id, t.description, t.assignee, t.completed, t.due_date
           FROM tasks t
           WHERE t.meeting_id IN (?, ?) AND t.deleted_at IS NULL${pbTasks}
           ORDER BY t.completed ASC, t.assignee`
        ).bind(prevMeeting.id, prevMeeting.source_id ?? prevMeeting.id).all()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    // Recent project activity (last 14 days) — stage changes, completed tasks, comments.
    env.DB.prepare(
      canSeePb
        ? `SELECT a.type, a.description, a.actor, a.related_id as entity_id, a.related_type as entity_type, a.timestamp as created_at
           FROM activity_log a
           WHERE a.timestamp > ?
           ORDER BY a.timestamp DESC LIMIT 30`
        : `SELECT a.type, a.description, a.actor, a.related_id as entity_id, a.related_type as entity_type, a.timestamp as created_at
           FROM activity_log a
           LEFT JOIN projects p ON a.related_type = 'project' AND (p.id = a.related_id OR p.slug = a.related_id)
           WHERE a.timestamp > ?
             AND (a.related_type != 'project' OR p.category IS NULL OR p.category != 'Peripheral Brain')
           ORDER BY a.timestamp DESC LIMIT 30`
    ).bind(twoWeeksAgo).all(),
    // Upcoming deadlines (next 14 days)
    env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.priority, t.status
       FROM tasks t
       WHERE t.due_date BETWEEN ? AND ? AND t.completed = 0 AND t.deleted_at IS NULL${pbTasks}
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
       WHERE t.due_date < ? AND t.completed = 0 AND t.deleted_at IS NULL${pbTasks}
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
// Phase 1b-extended: cross-project feed; filter PB-category rows for non-PI.
export async function handleGenerateAgenda(meetingId: string, env: Env, isAuthed = false, canSeePb = false): Promise<Response> {
  if (!isAuthed) return error('Authentication required', 401);
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first<{ id: string; title: string; date: string }>();
  if (!meeting) return error('Meeting not found', 404);

  // Find the previous meeting date for context
  const prevMeeting = await env.DB.prepare(
    'SELECT id, date FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date).first<{ id: string; date: string }>();

  const prevDate = prevMeeting?.date ?? '1970-01-01';

  // Task rows use the shared rule; pbFilterP stays for the non-task rows
  // (regulatory items, project updates) that join projects p themselves.
  const pbTasks = pbTaskVisibilitySql('t', canSeePb);
  const pbFilterP = canSeePb ? '' : " AND (p.category IS NULL OR p.category != 'Peripheral Brain')";
  const pbFilterDirect = canSeePb ? '' : " AND (category IS NULL OR category != 'Peripheral Brain')";
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
       WHERE m.date < ? AND t.deleted_at IS NULL AND (t.completed = 0 OR t.status NOT IN ('done','completed'))${pbTasks}
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
         AND (t.deleted_at IS NULL OR t.deleted_at = '')${pbTasks}
       ORDER BY t.due_date
       LIMIT 15`
    ).bind(today, weekOut).all<{ id: string; title: string; assignee: string; due_date: string; priority: string; status: string }>(),
    // 3. Stalled manuscripts / projects (in active status but not updated in 30+ days)
    env.DB.prepare(
      `SELECT id, title, stage, category, updated_at
       FROM projects
       WHERE status IN ('active','In Review','In Preparation')
         AND julianday('now') - julianday(updated_at) > 30${pbFilterDirect}
       ORDER BY updated_at ASC
       LIMIT 8`
    ).all<{ id: string; title: string; stage: string; category: string; updated_at: string }>(),
    // 4. Regulatory items expiring within 60 days
    env.DB.prepare(
      `SELECT r.id, r.title, r.item_type, r.expiration_date, r.status
       FROM regulatory_items r
       LEFT JOIN projects p ON p.id = r.project_id OR p.slug = r.project_id
       WHERE r.status IN ('active','action_needed','expiring_soon')
         AND r.expiration_date < date('now', '+60 days')${pbFilterP}
       ORDER BY r.expiration_date ASC
       LIMIT 10`
    ).all<{ id: string; title: string; item_type: string; expiration_date: string; status: string }>(),
    // 5. Recent project updates since previous meeting (activity_entries kind='update')
    env.DB.prepare(
      `SELECT ae.id, ae.body AS content, ae.update_type, ae.actor_slug AS author, ae.created_at, p.title as project_title
       FROM activity_entries ae
       LEFT JOIN projects p ON ae.project_id = p.id
       WHERE ae.entity_type='project' AND ae.kind='update' AND ae.hidden_at IS NULL AND ae.created_at > ?${pbFilterP}
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
  return upsertMeeting(env, user, {
    date: body.date,
    title: body.title,
    type: body.type,
    attendees: await normalizeAttendees(env, body.attendees),
    notes: body.notes,
    decisions: body.decisions,
    tags: body.tags,
    source_id: body.source_id,
    facilitator: body.facilitator,
  });
}

interface MeetingUpsert {
  date: string; title: string; type?: string;
  attendees: NormalizedAttendees;
  notes?: string | null; decisions?: string | null; tags?: string[] | null;
  source_id?: string | null; facilitator?: string | null;
}

// The one INSERT-or-dedup-UPDATE for meetings, shared by POST /api/meetings
// and POST /api/meetings/prep-from-event. Keyed on (date, normalized title).
async function upsertMeeting(env: Env, user: AuthUser, input: MeetingUpsert): Promise<Response> {
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
  const sameDate = await env.DB.prepare(
    'SELECT * FROM meetings WHERE date = ?'
  ).bind(input.date).all<{ id: string; date: string; title: string; notes: string | null }>();
  const existing = (sameDate.results ?? []).find(
    (m) => normalizeMeetingTitle(m.title) === normalizedTitle,
  );
  if (existing) {
    // Upsert: if the re-push carries notes/decisions/tags/type, refresh the
    // row. The COALESCE-on-carried-value pattern means an absent/empty field
    // never wipes an existing value — only a provided (non-null / non-empty)
    // value overwrites. attendees and source_id are the opposite direction,
    // FILL-ONLY (existing wins): source_id is identity, and attendees may hold
    // a person's edit (see the header above). attendees fill when NULL or
    // '[]'; a NULL bind leaves the column as it is.
    const hadNotes = !!(existing as { notes?: string | null }).notes;
    const hasNotes = input.notes !== undefined && input.notes !== null;
    const hasDecisions = input.decisions !== undefined && input.decisions !== null;
    const hasTags = tagsJson !== null;
    const hasAttendees = attendeesJson !== null;
    // type: only overwrite when the payload carries a real value — never
    // clobber an existing row's type with a default (matches the INSERT
    // branch's `type ?? 'biweekly'` default applying to NEW rows only).
    const hasType = typeof input.type === 'string' && input.type.length > 0;
    if (hasNotes || hasDecisions || hasTags || hasAttendees || hasType || input.source_id || facilitator) {
      await env.DB.prepare(
        `UPDATE meetings
            SET notes = COALESCE(?, notes),
                decisions = COALESCE(?, decisions),
                tags = COALESCE(?, tags),
                attendees = CASE WHEN attendees IS NULL OR attendees = '[]' THEN COALESCE(?, attendees) ELSE attendees END,
                type = COALESCE(?, type),
                facilitator = COALESCE(?, facilitator),
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
        existing.id,
      ).run();
      if (hasNotes && !hadNotes) {
        await fireMeetingDebriefNotification(env, existing.id, input.source_id ?? null, input.title);
      }
      const refreshed = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(existing.id).first();
      return json({ data: refreshed }, 200);
    }
    return json({ data: existing }, 200);
  }

  const id = `mtg-${input.date}-${generateId().slice(0, 8)}`;
  await env.DB.prepare(
    'INSERT INTO meetings (id, date, title, type, attendees, notes, decisions, tags, status, source_id, facilitator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, input.date, input.title, input.type ?? 'biweekly',
    attendeesJson,
    input.notes ?? null, input.decisions ?? null, tagsJson, 'upcoming',
    input.source_id ?? null, facilitator,
  ).run();

  await logActivity(env, 'meeting', `Created meeting: "${input.title}" on ${input.date}`, user.email, id, 'meeting');

  if (input.notes !== undefined && input.notes !== null) {
    await fireMeetingDebriefNotification(env, id, input.source_id ?? null, input.title);
  }

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

const CIVIL_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The civil day `days` after a YYYY-MM-DD, as YYYY-MM-DD (UTC arithmetic on a date-only value). */
function shiftCivilDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  // anti-pattern-allowed: R21 targets reading "today" from a UTC clock; this is pure arithmetic on a date-only input built with Date.UTC, so the UTC slice IS the civil day.
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
  ).bind(actorSlug(user.email), uid, startAt).first<{ summary: string | null; start_at: string; end_at: string | null; attendees: string | null }>();
  if (!ev) return error('Calendar event not found. The calendar may have refreshed; reload and try again.', 404);

  const firstDay = shiftCivilDay(ev.start_at.slice(0, 10), -1);
  const lastDay = shiftCivilDay((ev.end_at ?? ev.start_at).slice(0, 10), 1);
  if (day < firstDay || day > lastDay) return error('day is outside the event', 400);

  // The poller writes this column with JSON.stringify; a parse failure is a
  // bug worth a 500, not a silent empty list.
  const cached: unknown = ev.attendees ? JSON.parse(ev.attendees) : [];
  return upsertMeeting(env, user, {
    date: day,
    title: ev.summary?.trim() || '(no title)',
    attendees: await normalizeAttendees(env, cached),
  });
}
