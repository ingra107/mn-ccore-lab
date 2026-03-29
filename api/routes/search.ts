import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/search?q=
export async function handleSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json({ data: [], count: 0 });

  const like = `%${q}%`;
  const limit = 8;

  // Search across 6 tables in parallel
  const [tasks, projects, meetings, ideas, comments, activity] = await Promise.all([
    env.DB.prepare('SELECT id, title, description, assignee, status, priority, due_date FROM tasks WHERE (title LIKE ? OR description LIKE ?) LIMIT ?')
      .bind(like, like, limit).all(),
    env.DB.prepare('SELECT slug, title, category, stage, pi FROM projects WHERE (title LIKE ? OR category LIKE ?) LIMIT ?')
      .bind(like, like, limit).all(),
    env.DB.prepare('SELECT id, title, date, type FROM meetings WHERE title LIKE ? LIMIT ?')
      .bind(like, limit).all(),
    env.DB.prepare('SELECT id, title, description, submitted_by, status FROM ideas WHERE (title LIKE ? OR description LIKE ?) LIMIT ?')
      .bind(like, like, limit).all(),
    env.DB.prepare("SELECT c.id, c.content, c.author_id, c.created_at, p.title as project_title, p.slug as project_slug FROM comments c JOIN projects p ON c.project_id = p.slug WHERE c.content LIKE ? LIMIT ?")
      .bind(like, limit).all(),
    env.DB.prepare("SELECT id, type, description, actor, timestamp FROM activity_log WHERE description LIKE ? ORDER BY timestamp DESC LIMIT ?")
      .bind(like, limit).all(),
  ]);

  const results: { id: string; type: string; title: string; subtitle?: string; url?: string; meta?: Record<string, unknown> }[] = [];

  for (const t of (tasks.results || []) as any[]) {
    results.push({ id: t.id, type: 'task', title: t.title || t.description, subtitle: `${t.assignee} · ${t.status} · ${t.priority}`, url: `/tasks?open=${t.id}` });
  }
  for (const p of (projects.results || []) as any[]) {
    results.push({ id: p.slug, type: 'project', title: p.title, subtitle: `${p.stage} · ${p.category}`, url: `/projects/${p.slug}` });
  }
  for (const m of (meetings.results || []) as any[]) {
    results.push({ id: m.id, type: 'meeting', title: m.title, subtitle: m.date, url: `/meetings/${m.id}` });
  }
  for (const i of (ideas.results || []) as any[]) {
    results.push({ id: i.id, type: 'idea', title: i.title, subtitle: `${i.submitted_by} · ${i.status}`, url: '/ideas' });
  }
  for (const c of (comments.results || []) as any[]) {
    results.push({ id: c.id, type: 'comment', title: c.content?.slice(0, 100), subtitle: `on ${c.project_title}`, url: `/projects/${c.project_slug}` });
  }
  for (const a of (activity.results || []) as any[]) {
    results.push({ id: a.id, type: 'activity', title: a.description, subtitle: a.actor, url: '/activity' });
  }

  return json({ data: results, count: results.length, query: q });
}
