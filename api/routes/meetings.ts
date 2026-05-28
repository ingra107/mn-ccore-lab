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

// GET /api/meetings/:id/agenda — agenda items for a meeting
export async function handleGetAgendaItems(meetingId: string, env: Env): Promise<Response> {
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

// GET /api/meetings/:id/prep — facilitator prep view data
export async function handleMeetingPrep(meetingId: string, env: Env): Promise<Response> {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first();
  if (!meeting) return error('Meeting not found', 404);

  // Find the previous meeting (for carry-forward context)
  const prevMeeting = await env.DB.prepare(
    'SELECT id, date, title FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date as string).first();

  // Action items from previous meeting (if any)
  const prevActionItems = prevMeeting
    ? (await env.DB.prepare(
        'SELECT id, description, assignee, completed, due_date FROM tasks WHERE meeting_id = ? ORDER BY completed ASC, assignee'
      ).bind(prevMeeting.id).all()).results
    : [];

  // Recent project activity (last 14 days) — stage changes, completed tasks, comments
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const recentActivity = (await env.DB.prepare(
    'SELECT type, description, actor, related_id as entity_id, related_type as entity_type, timestamp as created_at FROM activity_log WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 30'
  ).bind(twoWeeksAgo).all()).results;

  // Upcoming deadlines (next 14 days)
  const twoWeeksOut = ctToday(14);
  const today = ctToday();
  const upcomingDeadlines = (await env.DB.prepare(
    'SELECT id, title, description, assignee, due_date, priority, status FROM tasks WHERE due_date BETWEEN ? AND ? AND completed = 0 ORDER BY due_date'
  ).bind(today, twoWeeksOut).all()).results;

  // Current meeting's agenda items
  const agendaItems = (await env.DB.prepare(
    'SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at'
  ).bind(meetingId).all()).results;

  // Overdue tasks
  const overdueTasks = (await env.DB.prepare(
    'SELECT id, title, description, assignee, due_date, priority FROM tasks WHERE due_date < ? AND completed = 0 ORDER BY due_date'
  ).bind(today).all()).results;

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

// GET /api/meetings/:id/generate-agenda — autogenerate agenda from carried-forward + open items
export async function handleGenerateAgenda(meetingId: string, env: Env): Promise<Response> {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(meetingId).first<{ id: string; title: string; date: string }>();
  if (!meeting) return error('Meeting not found', 404);

  // Find the previous meeting date for context
  const prevMeeting = await env.DB.prepare(
    'SELECT id, date FROM meetings WHERE date < ? ORDER BY date DESC LIMIT 1'
  ).bind(meeting.date).first<{ id: string; date: string }>();

  const prevDate = prevMeeting?.date ?? '1970-01-01';

  // 1. Carried-forward and open action items from previous meetings
  const carriedForward = await env.DB.prepare(
    `SELECT t.id, t.title, t.description, t.assignee, t.due_date, t.status
     FROM tasks t
     JOIN meetings m ON t.meeting_id = m.id
     WHERE m.date < ? AND (t.completed = 0 OR t.status NOT IN ('done','completed'))
     ORDER BY m.date DESC, t.created_at
     LIMIT 20`
  ).bind(meeting.date).all<{ id: string; title: string; description: string; assignee: string; due_date: string; status: string }>();

  // 2. Urgent / high-priority open tasks due this week
  const today = ctToday();
  const weekOut = ctToday(7);
  const urgentTasks = await env.DB.prepare(
    `SELECT id, title, assignee, due_date, priority, status
     FROM tasks
     WHERE status IN ('todo','in_progress','waiting_external')
       AND priority IN ('high','urgent')
       AND due_date BETWEEN ? AND ?
       AND (deleted_at IS NULL OR deleted_at = '')
     ORDER BY due_date
     LIMIT 15`
  ).bind(today, weekOut).all<{ id: string; title: string; assignee: string; due_date: string; priority: string; status: string }>();

  // 3. Stalled manuscripts / projects (in active status but not updated in 30+ days)
  const stalledProjects = await env.DB.prepare(
    `SELECT id, title, stage, category, updated_at
     FROM projects
     WHERE status IN ('active','In Review','In Preparation')
       AND julianday('now') - julianday(updated_at) > 30
     ORDER BY updated_at ASC
     LIMIT 8`
  ).all<{ id: string; title: string; stage: string; category: string; updated_at: string }>();

  // 4. Regulatory items expiring within 60 days
  const regulatory = await env.DB.prepare(
    `SELECT id, title, item_type, expiration_date, status
     FROM regulatory_items
     WHERE status IN ('active','action_needed','expiring_soon')
       AND expiration_date < date('now', '+60 days')
     ORDER BY expiration_date ASC
     LIMIT 10`
  ).all<{ id: string; title: string; item_type: string; expiration_date: string; status: string }>();

  // 5. Recent project updates since previous meeting
  const recentUpdates = await env.DB.prepare(
    `SELECT pu.id, pu.content, pu.update_type, pu.author, pu.created_at, p.title as project_title
     FROM project_updates pu
     LEFT JOIN projects p ON pu.project_id = p.id OR pu.project_id = p.slug
     WHERE pu.created_at > ?
     ORDER BY pu.created_at DESC
     LIMIT 15`
  ).bind(prevDate).all<{ id: string; content: string; update_type: string; author: string; created_at: string; project_title: string }>();

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
