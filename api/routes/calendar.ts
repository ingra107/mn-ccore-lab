import type { Env } from '../helpers';
import { json } from '../helpers';
import { ctToday } from '../lib/ct-date';

// GET /api/calendar/events?start=&end=
//
// Task rows come through the caller's handle (#145), so the calendar shows only
// tasks the caller may read. Soft-deleted tasks are excluded too (the query had
// no tombstone filter, so a deleted task kept its deadline on the calendar).
//
// `viewerSlug` (2026-10-08, Nick: "the lab calendar and Today page show tasks
// not assigned to the user"): task deadlines are the CALLER'S OWN tasks.
// Meetings and grant milestones stay lab-wide; a task is someone's work, and
// on the first team logins every member's calendar was Nick's to-do list. The
// slug is the Worker-resolved identity (`user.slug`, #8945), never a query
// param, so no client can ask for someone else's tasks here, and a caller
// with no team identity ('anonymous') matches no assignee and gets none.
export async function handleCalendarEvents(url: URL, env: Env, viewerSlug: string): Promise<Response> {
  const startDate = url.searchParams.get('start') || ctToday(-30);
  const endDate = url.searchParams.get('end') || ctToday(90);

  // Aggregate from multiple sources
  const [meetings, tasks, milestones] = await Promise.all([
    // Meetings come through the viewer-bound handle (#145), so this is the
    // caller's meetings, not the lab's. The caller's OWN row sorts first on a
    // tie so the title+date merge below keeps it over a same-titled row
    // someone else owns (owner-scoped dedup, schema-v119, makes that pair
    // possible).
    env.DB.prepare('SELECT DISTINCT id, date, title, type, (owner_slug IS ?) AS mine FROM meetings WHERE date >= ? AND date <= ? ORDER BY date, mine DESC, id')
      .bind(viewerSlug, startDate, endDate).all<{ id: string; date: string; title: string; type: string }>(),
    env.DB.prepare(`SELECT t.id, t.title, t.description, t.due_date, t.assignee, t.status, t.priority FROM tasks t WHERE t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ? AND t.completed = 0 AND t.deleted_at IS NULL AND t.assignee = ? ORDER BY t.due_date`)
      .bind(startDate, endDate, viewerSlug).all<{ id: string; title: string; description: string; due_date: string; assignee: string; status: string; priority: string }>(),
    env.DB.prepare('SELECT m.id, m.title, m.target_date, m.status, g.mechanism, g.title as grant_title FROM milestones m LEFT JOIN grants g ON m.grant_id = g.id WHERE m.target_date >= ? AND m.target_date <= ? ORDER BY m.target_date')
      .bind(startDate, endDate).all<{ id: string; title: string; target_date: string; status: string; mechanism: string | null; grant_title: string | null }>(),
  ]);

  const events: { id: string; date: string; title: string; type: string; category: string; meta?: Record<string, unknown> }[] = [];

  // Meetings
  for (const m of meetings.results || []) {
    events.push({ id: m.id, date: m.date, title: m.title, type: 'meeting', category: m.type });
  }

  // Task deadlines
  for (const t of tasks.results || []) {
    events.push({
      id: t.id,
      date: t.due_date,
      title: t.title || t.description,
      type: 'task',
      category: t.priority,
      meta: { assignee: t.assignee, status: t.status },
    });
  }

  // Grant milestones
  for (const m of milestones.results || []) {
    events.push({
      id: m.id,
      date: m.target_date,
      title: m.mechanism ? `${m.mechanism}: ${m.title}` : m.title,
      type: 'milestone',
      category: 'grant',
      meta: { grant_title: m.grant_title },
    });
  }

  // Dedup by title+date (meetings may have duplicates from multiple syncs with different IDs)
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const key = `${e.type}::${e.date}::${e.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  return json({ data: deduped, count: deduped.length });
}
