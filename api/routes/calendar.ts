import type { Env } from '../helpers';
import { json } from '../helpers';
import { ctToday } from '../lib/ct-date';
import { NOT_QUESTION_SQL_T } from '../../shared/taskKinds';

// GET /api/calendar/events?start=&end=
//
// Task rows come through the caller's handle (#145), so the calendar shows only
// tasks the caller may read. Soft-deleted tasks are excluded too (the query had
// no tombstone filter, so a deleted task kept its deadline on the calendar).
//
// `viewerSlug` (2026-10-08, Nick: "the lab calendar and Today page show tasks
// not assigned to the user"): task deadlines are the CALLER'S OWN tasks.
// Meetings stay lab-wide; a task is someone's work, and
// on the first team logins every member's calendar was Nick's to-do list. The
// slug is the Worker-resolved identity (`user.slug`, #8945), never a query
// param, so no client can ask for someone else's tasks here, and a caller
// with no team identity ('anonymous') matches no assignee and gets none.
export async function handleCalendarEvents(url: URL, env: Env, viewerSlug: string): Promise<Response> {
  const startDate = url.searchParams.get('start') || ctToday(-30);
  const endDate = url.searchParams.get('end') || ctToday(90);

  // Aggregate from multiple sources
  const [meetings, tasks] = await Promise.all([
    // Meetings come through the viewer-bound handle (#145), so this is the
    // caller's meetings, not the lab's. The caller's OWN row sorts first on a
    // tie so the title+date merge below keeps it over a same-titled row
    // someone else owns (owner-scoped dedup, schema-v119, makes that pair
    // possible).
    env.DB.prepare('SELECT DISTINCT id, date, title, type, (owner_slug IS ?) AS mine FROM meetings WHERE date >= ? AND date <= ? ORDER BY date, mine DESC, id')
      .bind(viewerSlug, startDate, endDate).all<{ id: string; date: string; title: string; type: string }>(),
    // The two-date rule (products.ts): due_date is the internal date, deadline
    // the hard one, and a milestone may carry only the hard one (R14). A task
    // with both sits on its due date, as it always has.
    env.DB.prepare(`SELECT t.id, t.title, t.short_title, t.description, t.kind, t.due_date, t.deadline, t.assignee, t.status, t.priority FROM tasks t WHERE COALESCE(t.due_date, t.deadline) >= ? AND COALESCE(t.due_date, t.deadline) <= ? AND t.completed = 0 AND t.deleted_at IS NULL AND ${NOT_QUESTION_SQL_T} AND t.assignee = ? ORDER BY t.due_date`)
      .bind(startDate, endDate, viewerSlug).all<{ id: string; title: string; short_title: string | null; description: string; kind: string | null; due_date: string | null; deadline: string | null; assignee: string; status: string; priority: string }>(),
    // A milestone is a task with kind='milestone' (Rule 86), so the tasks leg
    // above returns it; the legacy `milestones` table has no leg here.
  ]);

  // `title` stays the FULL title (the dedup key below and the client's
  // production-visibility filter read it); `short_title` is what the page
  // shows, through src/lib/displayNames.ts taskShortLabel (eval item 34).
  // `kind` rides along so that label names a check-in or milestone task
  // ("Check-in: X"; schema-v156 stopped storing the prefix in the title).
  // Meetings carry kind null.
  const events: { id: string; date: string; title: string; short_title?: string | null; kind: string | null; type: string; category: string; meta?: Record<string, unknown> }[] = [];

  // Meetings
  for (const m of meetings.results || []) {
    events.push({ id: m.id, date: m.date, title: m.title, kind: null, type: 'meeting', category: m.type });
  }

  // Task deadlines
  for (const t of tasks.results || []) {
    events.push({
      id: t.id,
      date: (t.due_date ?? t.deadline) as string, // the WHERE above refuses a task with neither
      title: t.title || t.description,
      short_title: t.short_title || null,
      kind: t.kind ?? 'task',
      type: 'task',
      category: t.priority,
      // date_kind names what this row's date means, so the page can say so.
      meta: { assignee: t.assignee, status: t.status, date_kind: t.due_date ? 'due' : 'deadline' },
    });
  }

  // Dedup by title+date (meetings may have duplicates from multiple syncs with different IDs)
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const key = e.type === 'meeting' ? `meeting::${e.date}::${e.title}` : `${e.type}::${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  return json({ data: deduped, count: deduped.length });
}
