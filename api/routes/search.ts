import type { Env } from '../helpers';
import { json } from '../helpers';

// --- Scoring constants ---

const TYPE_PRIORITY: Record<string, number> = {
  task: 10,
  project: 8,
  meeting: 6,
  idea: 5,
  comment: 3,
  activity: 2,
};

const TASK_STATUS_BOOST: Record<string, number> = {
  in_progress: 2,
  todo: 1,
  blocked: 1,
  done: -2,
};

function recencyBoost(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const age = Date.now() - new Date(dateStr).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days <= 7) return 5;
  if (days <= 30) return 3;
  if (days <= 90) return 1;
  return 0;
}

function titleMatchBonus(title: string | null | undefined, query: string): number {
  if (!title) return 0;
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  let bonus = 0;
  if (lower.includes(q)) bonus += 3;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundary = new RegExp(`\\b${escaped}\\b`, 'i');
  if (wordBoundary.test(title)) bonus += 2;
  return bonus;
}

// --- Result type ---

interface ScoredResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  url?: string;
  score: number;
  timestamp?: string;
}

// --- Handler ---

// GET /api/search?q=
export async function handleSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json({ data: [], count: 0 });
  // Upper bound: 200-char search strings are already absurdly long; cap to
  // avoid HTTP 500 on pathologically large LIKE patterns (deep-audit 13.M).
  if (q.length > 200) return json({ data: [], count: 0, truncated: true });

  const like = `%${q}%`;
  const limit = 15;

  // Search across 6 tables in parallel
  const [tasks, projects, meetings, ideas, comments, activity] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, description, assignee, status, priority, due_date, created_at FROM tasks WHERE (title LIKE ? OR description LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT slug, title, category, stage, pi, updated_at FROM projects WHERE (title LIKE ? OR category LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, date, type FROM meetings WHERE title LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, description, submitted_by, status, created_at FROM ideas WHERE (title LIKE ? OR description LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT c.id, c.content, c.author_id, c.created_at, p.title as project_title, p.slug as project_slug FROM comments c JOIN projects p ON c.project_id = p.slug WHERE c.content LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    env.DB.prepare(
      'SELECT id, type, description, actor, timestamp FROM activity_log WHERE description LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(like, limit).all(),
  ]);

  const results: ScoredResult[] = [];

  // Tasks
  for (const t of (tasks.results || []) as any[]) {
    const timestamp = t.created_at || t.due_date;
    let score = TYPE_PRIORITY.task
      + recencyBoost(timestamp)
      + titleMatchBonus(t.title, q)
      + (TASK_STATUS_BOOST[t.status] ?? 0);
    results.push({
      id: t.id,
      type: 'task',
      title: t.title || t.description,
      subtitle: `${t.assignee} · ${t.status} · ${t.priority}`,
      url: `/tasks?open=${t.id}`,
      score,
      timestamp,
    });
  }

  // Projects
  for (const p of (projects.results || []) as any[]) {
    const timestamp = p.updated_at;
    const score = TYPE_PRIORITY.project
      + recencyBoost(timestamp)
      + titleMatchBonus(p.title, q);
    results.push({
      id: p.slug,
      type: 'project',
      title: p.title,
      subtitle: `${p.stage} · ${p.category}`,
      url: `/projects/${p.slug}`,
      score,
      timestamp,
    });
  }

  // Meetings
  for (const m of (meetings.results || []) as any[]) {
    const timestamp = m.date;
    const score = TYPE_PRIORITY.meeting
      + recencyBoost(timestamp)
      + titleMatchBonus(m.title, q);
    results.push({
      id: m.id,
      type: 'meeting',
      title: m.title,
      subtitle: m.date,
      url: `/meetings/${m.id}`,
      score,
      timestamp,
    });
  }

  // Ideas
  for (const i of (ideas.results || []) as any[]) {
    const timestamp = i.created_at;
    const score = TYPE_PRIORITY.idea
      + recencyBoost(timestamp)
      + titleMatchBonus(i.title, q);
    results.push({
      id: i.id,
      type: 'idea',
      title: i.title,
      subtitle: `${i.submitted_by} · ${i.status}`,
      url: '/ideas',
      score,
      timestamp,
    });
  }

  // Comments
  for (const c of (comments.results || []) as any[]) {
    const timestamp = c.created_at;
    const score = TYPE_PRIORITY.comment
      + recencyBoost(timestamp)
      + titleMatchBonus(c.content, q);
    results.push({
      id: c.id,
      type: 'comment',
      title: c.content?.slice(0, 100),
      subtitle: `on ${c.project_title}`,
      url: `/projects/${c.project_slug}`,
      score,
      timestamp,
    });
  }

  // Activity
  for (const a of (activity.results || []) as any[]) {
    const timestamp = a.timestamp;
    const score = TYPE_PRIORITY.activity
      + recencyBoost(timestamp)
      + titleMatchBonus(a.description, q);
    results.push({
      id: a.id,
      type: 'activity',
      title: a.description,
      subtitle: a.actor,
      url: '/activity',
      score,
      timestamp,
    });
  }

  // Sort by score descending, then by recency as tiebreaker
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });

  // Return top 20
  const top = results.slice(0, 20);

  return json({ data: top, count: top.length, query: q });
}
