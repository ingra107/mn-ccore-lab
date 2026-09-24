import type { Env } from '../helpers';
import { json, pbTaskVisibilitySql } from '../helpers';
import { ctToday } from '../lib/ct-date';

// GET /api/calendar/events?start=&end=
//
// `canSeePb` (#8842 R6): the task-deadline rows are TASK rows, so a non-PI
// caller gets the shared PB-project filter; before this every authed team
// member saw PB-private task titles and assignees on the calendar. Soft-
// deleted tasks are excluded too (the query had no tombstone filter, so a
// deleted task kept its deadline on the calendar).
export async function handleCalendarEvents(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const startDate = url.searchParams.get('start') || ctToday(-30);
  const endDate = url.searchParams.get('end') || ctToday(90);

  // Aggregate from multiple sources
  const [meetings, tasks, milestones] = await Promise.all([
    env.DB.prepare('SELECT DISTINCT id, date, title, type FROM meetings WHERE date >= ? AND date <= ? ORDER BY date')
      .bind(startDate, endDate).all<{ id: string; date: string; title: string; type: string }>(),
    env.DB.prepare(`SELECT t.id, t.title, t.description, t.due_date, t.assignee, t.status, t.priority FROM tasks t WHERE t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ? AND t.completed = 0 AND t.deleted_at IS NULL${pbTaskVisibilitySql('t', canSeePb)} ORDER BY t.due_date`)
      .bind(startDate, endDate).all<{ id: string; title: string; description: string; due_date: string; assignee: string; status: string; priority: string }>(),
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
