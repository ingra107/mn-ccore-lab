import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// GET /api/meetings — list all meetings
export async function handleMeetings(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM meetings ORDER BY date DESC'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/meetings/:id — single meeting with action items + agenda items
export async function handleGetMeeting(id: string, env: Env): Promise<Response> {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  if (!meeting) return error('Meeting not found', 404);

  const [actionItems, agendaItems] = await Promise.all([
    env.DB.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY created_at').bind(id).all(),
    env.DB.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at').bind(id).all(),
  ]);

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
  await env.DB.prepare(
    'UPDATE meetings SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(body.notes, meetingId).run();

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
  const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
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

// POST /api/meetings — create meeting (dedup by date+title)
export async function handleCreateMeeting(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { date: string; title: string; type?: string; attendees?: string[] };
  if (!body.date || !body.title) return error('date and title required', 400);

  // Dedup: return existing meeting if same date+title already exists
  const existing = await env.DB.prepare(
    'SELECT * FROM meetings WHERE date = ? AND title = ?'
  ).bind(body.date, body.title).first();
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
