import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, safeTaskRow } from '../helpers';
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
const MEETING_PUBLIC_COLS = 'id, date, title, type, status, facilitator, created_at, updated_at';

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
  // the meeting detail. TASK_SELECT_COLS prefixes cols with `t.` for JOIN
  // queries; strip the prefix for a plain FROM tasks query. safeTaskRow
  // provides defense-in-depth (strips any remnant notes).
  // Meeting agenda/notes (the meeting row itself) are team-internal-visible
  // by design — only the task rows in action_items are the leak risk.
  const taskCols = TASK_SELECT_COLS.replace(/\bt\./g, '');
  const [actionItemsRaw, agendaItems] = await Promise.all([
    env.DB.prepare(`SELECT ${taskCols} FROM tasks WHERE meeting_id = ? ORDER BY created_at`).bind(id).all<Record<string, unknown>>(),
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

  const id = generateId();
  const maxOrder = await env.DB.prepare('SELECT MAX(sort_order) as m FROM agenda_items WHERE meeting_id = ?').bind(meetingId).first<{ m: number | null }>();

  await env.DB.prepare(
    'INSERT INTO agenda_items (id, meeting_id, content, added_by, project_id, type, document_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, meetingId, body.content, user.email, body.project_id ?? null, body.type ?? 'discussion', body.document_url ?? null, (maxOrder?.m ?? 0) + 1).run();

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
    'SELECT id, date, title FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date as string).first();

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
    prevMeeting
      ? env.DB.prepare(
          `SELECT t.id, t.description, t.assignee, t.completed, t.due_date
           FROM tasks t
           LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
           WHERE t.meeting_id = ?${pbFilter}
           ORDER BY t.completed ASC, t.assignee`
        ).bind(prevMeeting.id).all()
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
    // 1. Carried-forward and open action items from previous meetings
    env.DB.prepare(
      `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.status
       FROM tasks t
       JOIN meetings m ON t.meeting_id = m.id
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
    // 5. Recent project updates since previous meeting
    env.DB.prepare(
      `SELECT pu.id, pu.content, pu.update_type, pu.author, pu.created_at, p.title as project_title
       FROM project_updates pu
       LEFT JOIN projects p ON pu.project_id = p.id OR pu.project_id = p.slug
       WHERE pu.created_at > ?${pbFilterP}
       ORDER BY pu.created_at DESC
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

// POST /api/meetings — create meeting (dedup by date+normalized title)
export async function handleCreateMeeting(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { date: string; title: string; type?: string; attendees?: string[] };
  if (!body.date || !body.title) return error('date and title required', 400);

  const normalizedTitle = normalizeMeetingTitle(body.title);

  // Fetch candidates on the same date and normalize each one's title before
  // comparing. This beats a naive `WHERE date=? AND title=?` match which would
  // miss "Lab Meeting" vs "lab  meeting".
  const sameDate = await env.DB.prepare(
    'SELECT * FROM meetings WHERE date = ?'
  ).bind(body.date).all<{ id: string; date: string; title: string }>();
  const existing = (sameDate.results ?? []).find(
    (m) => normalizeMeetingTitle(m.title) === normalizedTitle,
  );
  if (existing) {
    return json({ data: existing }, 200);
  }

  const id = `mtg-${body.date}-${generateId().slice(0, 8)}`;
  await env.DB.prepare(
    'INSERT INTO meetings (id, date, title, type, attendees, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.date, body.title, body.type ?? 'biweekly', body.attendees ? JSON.stringify(body.attendees) : null, 'upcoming').run();

  await logActivity(env, 'meeting', `Created meeting: "${body.title}" on ${body.date}`, user.email, id, 'meeting');

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
