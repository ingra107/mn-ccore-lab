import type { Env } from '../helpers';
import { json } from '../helpers';
import { isTestFixture } from '../lib/fixtures';

// GET /api/today/mentees -- the Today page's MENTEES row (Pulse card) and the
// Hermes Suggests "mentee next due" bullet.
//
// 2026-10-08: the row had shown "—" for every mentee since it was built
// (4e6b86bc, 2026-04-24). The client filtered the VIEWER's own task list
// (/api/tasks?assignee=<viewer>) by each mentee's slug, which can only ever
// match the viewer. It also showed the same hard-coded research-team list to
// every member, so Casey saw herself as her own mentee.
//
// The hub stores no per-person mentor link. The relationship it does store is
// team_members.member_type: the lab's directors mentor its research team. So:
//   - a viewer whose row is member_type='director' gets one entry per
//     research_team member: slug, name, and the due date of that member's
//     soonest open dated task (null when there is none);
//   - every other viewer, including one with no team row ('anonymous'), gets [].
// The viewer is the Worker-resolved slug (user.slug, #8945), passed in by the
// route, never read from the query string, so no client can widen it. Only a
// date leaves the server, never a task title, and PB-private tasks are dropped
// for a non-PI caller by the same rule /api/tasks uses (the viewer-bound handle).
export interface TodayMentee {
  slug: string;
  name: string;
  next_due: string | null;
}

export async function handleTodayMentees(env: Env, viewerSlug: string, _canSeePb = false): Promise<Response> {
  const mentees = await env.DB.prepare(
    `SELECT tm.slug, tm.name FROM team_members tm
     WHERE tm.member_type = 'research_team' AND tm.slug IS NOT NULL
       AND EXISTS (SELECT 1 FROM team_members v WHERE v.slug = ? AND v.member_type = 'director')`,
  ).bind(viewerSlug).all<{ slug: string; name: string }>();
  const rows = mentees.results ?? [];
  if (rows.length === 0) return json({ data: [] as TodayMentee[] });

  const tasks = await env.DB.prepare(
    `SELECT t.assignee, t.due_date, t.title FROM tasks t
     JOIN team_members tm ON tm.slug = t.assignee AND tm.member_type = 'research_team'
     WHERE t.completed = 0 AND t.deleted_at IS NULL AND t.due_date IS NOT NULL`,
  ).all<{ assignee: string; due_date: string; title: string | null }>();

  const soonest = new Map<string, string>();
  for (const t of tasks.results ?? []) {
    if (isTestFixture(t.title)) continue;
    const due = t.due_date.slice(0, 10);
    const cur = soonest.get(t.assignee);
    if (!cur || due < cur) soonest.set(t.assignee, due);
  }

  const data: TodayMentee[] = rows.map((m) => ({ slug: m.slug, name: m.name, next_due: soonest.get(m.slug) ?? null }));
  // Soonest first, so the Pulse card's top four are the ones that need a look.
  data.sort((a, b) => (a.next_due ?? '9999').localeCompare(b.next_due ?? '9999') || a.name.localeCompare(b.name));
  return json({ data });
}
