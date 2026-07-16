import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, safeTaskRow, projectRefToCanonical } from '../helpers';
import { TASK_SELECT_COLS } from '../lib/task-cols';
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
    `SELECT COUNT(*) as n FROM tasks WHERE meeting_id IN (${placeholders})`
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
export async function handleGetMeeting(id: string, env: Env, isAuthed = false): Promise<Response> {
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
  // by design — only the task rows in action_items are the leak risk.
  //
  // v95: tasks.meeting_id may carry either the Hub-minted meeting id or PB's
  // calendar-match source_id, so the join matches either id space. NULL-safety
  // is by construction (`IN (id, NULL)` degrades to `= id`) — no guard needed.
  const sourceId = (meeting as { source_id?: string | null }).source_id ?? null;
  const [actionItemsRaw, agendaItems] = await Promise.all([
    env.DB.prepare(
      `SELECT ${TASK_SELECT_COLS} FROM tasks t WHERE t.meeting_id IN (?, ?) ORDER BY t.created_at`
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
// Hub edits are canonical: the PB pipeline only sets these on INSERT, so a
// manual edit here can never be overwritten by a re-push. Date is NOT editable
// (it is half of the dedup key).
export async function handleUpdateMeetingMeta(meetingId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { attendees?: string[]; title?: string; type?: string; tags?: string[] };
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (Array.isArray(body.attendees)) { sets.push('attendees = ?'); binds.push(JSON.stringify(body.attendees)); }
  if (typeof body.title === 'string' && body.title.trim()) { sets.push('title = ?'); binds.push(body.title.trim()); }
  if (typeof body.type === 'string' && body.type) { sets.push('type = ?'); binds.push(body.type); }
  if (Array.isArray(body.tags)) { sets.push('tags = ?'); binds.push(JSON.stringify(body.tags)); }
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

  const pbFilter = canSeePb ? '' : " AND (p.category IS NULL OR p.category != 'Peripheral Brain')";

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
           LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
           WHERE t.meeting_id IN (?, ?)${pbFilter}
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
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE t.due_date BETWEEN ? AND ? AND t.completed = 0${pbFilter}
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
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE t.due_date < ? AND t.completed = 0${pbFilter}
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
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE m.date < ? AND (t.completed = 0 OR t.status NOT IN ('done','completed'))${pbFilterP}
       ORDER BY m.date DESC, t.created_at
       LIMIT 20`
    ).bind(meeting.date).all<{ id: string; title: string; description: string; assignee: string; due_date: string; status: string }>(),
    // 2. Urgent / high-priority open tasks due this week
    env.DB.prepare(
      `SELECT t.id, t.title, t.assignee, t.due_date, t.priority, t.status
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
       WHERE t.status IN ('todo','in_progress','waiting_external')
         AND t.priority IN ('high','urgent')
         AND t.due_date BETWEEN ? AND ?
         AND (t.deleted_at IS NULL OR t.deleted_at = '')${pbFilterP}
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
       WHERE ae.entity_type='project' AND ae.kind='update' AND ae.created_at > ?${pbFilterP}
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
// shared-schema-registry.md "/meetings push payload" entry. Until this fix
// only the INSERT branch persisted them, so any meeting that already had a
// Hub row (pushed before this date, or any date+title dedup match) kept NULL
// attendees forever. Both now follow the same COALESCE-on-carried-value
// pattern as notes/decisions/tags: absent/empty never wipes an existing value.
export async function handleCreateMeeting(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    date: string; title: string; type?: string; attendees?: string[];
    notes?: string | null; decisions?: string | null; tags?: string[] | null;
    source_id?: string | null;
  };
  if (!body.date || !body.title) return error('date and title required', 400);

  // `tags` arrives as an array; persist as a JSON string (matches `attendees`).
  // An explicit null / absent tags stays null so the COALESCE guard below can
  // distinguish "no tags this push" from "wipe the tags".
  const tagsJson = Array.isArray(body.tags) ? JSON.stringify(body.tags) : null;

  // `attendees` mirrors `tags`'s JSON-string contract, but treats an EMPTY
  // array the same as absent (a push that carries `attendees: []` must not
  // wipe a previously-recorded attendee list on the dedup path). Matches the
  // INSERT branch's `JSON.stringify(body.attendees)` serialization exactly.
  const attendeesJson = Array.isArray(body.attendees) && body.attendees.length > 0
    ? JSON.stringify(body.attendees)
    : null;

  const normalizedTitle = normalizeMeetingTitle(body.title);

  // Fetch candidates on the same date and normalize each one's title before
  // comparing. This beats a naive `WHERE date=? AND title=?` match which would
  // miss "Lab Meeting" vs "lab  meeting".
  const sameDate = await env.DB.prepare(
    'SELECT * FROM meetings WHERE date = ?'
  ).bind(body.date).all<{ id: string; date: string; title: string; notes: string | null }>();
  const existing = (sameDate.results ?? []).find(
    (m) => normalizeMeetingTitle(m.title) === normalizedTitle,
  );
  if (existing) {
    // Upsert: if the re-push carries notes/decisions/tags/attendees/type,
    // refresh the row. The COALESCE-on-carried-value pattern means an
    // absent/empty field never wipes an existing value — only a provided
    // (non-null / non-empty) value overwrites. source_id is SET-ONCE
    // (COALESCE(source_id, ?) — existing wins): identity, not refreshable
    // content, opposite direction from the other fields.
    const hadNotes = !!(existing as { notes?: string | null }).notes;
    const hasNotes = body.notes !== undefined && body.notes !== null;
    const hasDecisions = body.decisions !== undefined && body.decisions !== null;
    const hasTags = tagsJson !== null;
    const hasAttendees = attendeesJson !== null;
    // type: only overwrite when the payload carries a real value — never
    // clobber an existing row's type with a default (matches the INSERT
    // branch's `body.type ?? 'biweekly'` default applying to NEW rows only).
    const hasType = typeof body.type === 'string' && body.type.length > 0;
    if (hasNotes || hasDecisions || hasTags || hasAttendees || hasType || body.source_id) {
      await env.DB.prepare(
        `UPDATE meetings
            SET notes = COALESCE(?, notes),
                decisions = COALESCE(?, decisions),
                tags = COALESCE(?, tags),
                attendees = COALESCE(?, attendees),
                type = COALESCE(?, type),
                source_id = COALESCE(source_id, ?),
                updated_at = datetime('now')
          WHERE id = ?`
      ).bind(
        hasNotes ? body.notes : null,
        hasDecisions ? body.decisions : null,
        hasTags ? tagsJson : null,
        hasAttendees ? attendeesJson : null,
        hasType ? body.type : null,
        body.source_id ?? null,
        existing.id,
      ).run();
      if (hasNotes && !hadNotes) {
        await fireMeetingDebriefNotification(env, existing.id, body.source_id ?? null, body.title);
      }
      const refreshed = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(existing.id).first();
      return json({ data: refreshed }, 200);
    }
    return json({ data: existing }, 200);
  }

  const id = `mtg-${body.date}-${generateId().slice(0, 8)}`;
  await env.DB.prepare(
    'INSERT INTO meetings (id, date, title, type, attendees, notes, decisions, tags, status, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, body.date, body.title, body.type ?? 'biweekly',
    body.attendees ? JSON.stringify(body.attendees) : null,
    body.notes ?? null, body.decisions ?? null, tagsJson, 'upcoming',
    body.source_id ?? null,
  ).run();

  await logActivity(env, 'meeting', `Created meeting: "${body.title}" on ${body.date}`, user.email, id, 'meeting');

  if (body.notes !== undefined && body.notes !== null) {
    await fireMeetingDebriefNotification(env, id, body.source_id ?? null, body.title);
  }

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
