import type { Env } from '../helpers';
import { json } from '../helpers';

// --- Scoring constants ---

const TYPE_PRIORITY: Record<string, number> = {
  task: 10,
  project: 8,
  meeting: 6,
  idea: 5,
  decision: 5,
  note: 4,
  task_note: 4,
  action_item: 4,
  publication: 4,
  grant: 4,
  comment: 3,
  task_comment: 3,
  file: 3,
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

  // Search across 14 tables in parallel — Slack-parity unified search.
  const [
    tasks, projects, meetings, ideas, comments, activity,
    notes, taskNotes, taskComments, decisions, files, actionItems,
    publications, grants,
  ] = await Promise.all([
    env.DB.prepare(
      'SELECT id, title, description, assignee, status, priority, due_date, created_at FROM tasks WHERE (title LIKE ? OR description LIKE ?) AND deleted_at IS NULL LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT slug, title, category, stage, pi, updated_at FROM projects WHERE (title LIKE ? OR category LIKE ? OR description LIKE ?) AND deleted_at IS NULL LIMIT ?'
    ).bind(like, like, like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, date, type, notes FROM meetings WHERE (title LIKE ? OR notes LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, description, submitted_by, status, created_at FROM ideas WHERE (title LIKE ? OR description LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT c.id, c.content, c.author_id, c.created_at, p.title as project_title, p.slug as project_slug FROM comments c JOIN projects p ON c.project_id = p.slug WHERE c.content LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    env.DB.prepare(
      'SELECT id, type, description, actor, timestamp FROM activity_log WHERE description LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(like, limit).all(),
    // Project notes (project_updates)
    env.DB.prepare(
      'SELECT u.id, u.content, u.author, u.update_type, u.created_at, p.title as project_title, p.slug as project_slug FROM project_updates u JOIN projects p ON u.project_id = p.slug OR u.project_id = p.id WHERE u.content LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    // Task notes (task_updates)
    env.DB.prepare(
      'SELECT u.id, u.content, u.author_slug, u.update_type, u.created_at, u.task_id, t.title as task_title FROM task_updates u LEFT JOIN tasks t ON u.task_id = t.id WHERE u.content LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    // Task comments
    env.DB.prepare(
      'SELECT c.id, c.content, c.author_slug, c.created_at, c.task_id, t.title as task_title FROM task_comments c LEFT JOIN tasks t ON c.task_id = t.id WHERE c.content LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    // Decisions
    env.DB.prepare(
      'SELECT id, title, rationale, context, outcome, project_slug, decided_by, created_at FROM decision_log WHERE (title LIKE ? OR rationale LIKE ? OR context LIKE ? OR outcome LIKE ?) LIMIT ?'
    ).bind(like, like, like, like, limit).all(),
    // File attachments
    env.DB.prepare(
      'SELECT id, filename, entity_type, entity_id, content_type, uploaded_by, created_at FROM file_attachments WHERE filename LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    // Action items
    env.DB.prepare(
      'SELECT a.id, a.description, a.assignee, a.completed, a.due_date, a.meeting_id, a.created_at, m.title as meeting_title FROM action_items a LEFT JOIN meetings m ON a.meeting_id = m.id WHERE a.description LIKE ? LIMIT ?'
    ).bind(like, limit).all(),
    // Publications
    env.DB.prepare(
      'SELECT id, title, journal, year, authors, status, created_at FROM publications WHERE (title LIKE ? OR journal LIKE ? OR authors LIKE ? OR abstract LIKE ?) LIMIT ?'
    ).bind(like, like, like, like, limit).all(),
    // NIH grants
    env.DB.prepare(
      'SELECT project_number, title, pi_name, fiscal_year, total_cost, last_synced FROM nih_grants WHERE (title LIKE ? OR pi_name LIKE ? OR abstract LIKE ?) LIMIT ?'
    ).bind(like, like, like, limit).all(),
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
      url: `/portal/my-tasks?open=${t.id}`,
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
      url: `/portal/projects/${p.slug}`,
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
      url: `/portal/meetings/${m.id}`,
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
      url: '/portal/ideas',
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
      url: `/portal/projects/${c.project_slug}`,
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
      url: '/portal/activity',
      score,
      timestamp,
    });
  }

  // Project notes (project_updates)
  for (const n of (notes.results || []) as any[]) {
    const timestamp = n.created_at;
    const score = TYPE_PRIORITY.note
      + recencyBoost(timestamp)
      + titleMatchBonus(n.content, q);
    results.push({
      id: n.id,
      type: 'note',
      title: (n.content || '').slice(0, 120),
      subtitle: `note on ${n.project_title || n.project_slug} · ${n.author}`,
      url: `/portal/projects/${n.project_slug}?tab=notes`,
      score,
      timestamp,
    });
  }

  // Task notes (task_updates)
  for (const n of (taskNotes.results || []) as any[]) {
    const timestamp = n.created_at;
    const score = TYPE_PRIORITY.task_note
      + recencyBoost(timestamp)
      + titleMatchBonus(n.content, q);
    results.push({
      id: n.id,
      type: 'task_note',
      title: (n.content || '').slice(0, 120),
      subtitle: `note on task · ${n.task_title || n.task_id} · ${n.author_slug}`,
      url: `/portal/my-tasks?open=${n.task_id}`,
      score,
      timestamp,
    });
  }

  // Task comments
  for (const c of (taskComments.results || []) as any[]) {
    const timestamp = c.created_at;
    const score = TYPE_PRIORITY.task_comment
      + recencyBoost(timestamp)
      + titleMatchBonus(c.content, q);
    results.push({
      id: c.id,
      type: 'task_comment',
      title: (c.content || '').slice(0, 120),
      subtitle: `comment on task · ${c.task_title || c.task_id} · ${c.author_slug}`,
      url: `/portal/my-tasks?open=${c.task_id}`,
      score,
      timestamp,
    });
  }

  // Decisions
  for (const d of (decisions.results || []) as any[]) {
    const timestamp = d.created_at;
    const score = TYPE_PRIORITY.decision
      + recencyBoost(timestamp)
      + titleMatchBonus(d.title, q);
    const parts = [d.decided_by, d.outcome].filter(Boolean);
    results.push({
      id: d.id,
      type: 'decision',
      title: d.title,
      subtitle: parts.join(' · ') || (d.rationale || '').slice(0, 80),
      url: `/portal/decisions?open=${d.id}`,
      score,
      timestamp,
    });
  }

  // File attachments
  for (const f of (files.results || []) as any[]) {
    const timestamp = f.created_at;
    const score = TYPE_PRIORITY.file
      + recencyBoost(timestamp)
      + titleMatchBonus(f.filename, q);
    const entityUrl = f.entity_type === 'project'
      ? `/portal/projects/${f.entity_id}`
      : f.entity_type === 'task'
        ? `/portal/my-tasks?open=${f.entity_id}`
        : '/portal/search';
    results.push({
      id: f.id,
      type: 'file',
      title: f.filename,
      subtitle: `${f.entity_type} · ${f.uploaded_by || 'unknown'}`,
      url: entityUrl,
      score,
      timestamp,
    });
  }

  // Meeting action items
  for (const a of (actionItems.results || []) as any[]) {
    const timestamp = a.created_at;
    const score = TYPE_PRIORITY.action_item
      + recencyBoost(timestamp)
      + titleMatchBonus(a.description, q)
      + (a.completed ? -2 : 1);
    results.push({
      id: a.id,
      type: 'action_item',
      title: a.description,
      subtitle: `action · ${a.assignee}${a.meeting_title ? ` · ${a.meeting_title}` : ''}${a.due_date ? ` · due ${a.due_date}` : ''}`,
      url: a.meeting_id ? `/portal/meetings/${a.meeting_id}` : '/portal/meetings',
      score,
      timestamp,
    });
  }

  // Publications
  for (const p of (publications.results || []) as any[]) {
    const timestamp = p.created_at;
    const score = TYPE_PRIORITY.publication
      + recencyBoost(timestamp)
      + titleMatchBonus(p.title, q);
    results.push({
      id: p.id,
      type: 'publication',
      title: p.title,
      subtitle: [p.journal, p.year, p.status].filter(Boolean).join(' · '),
      url: `/publications/${p.id}`,
      score,
      timestamp,
    });
  }

  // NIH grants
  for (const g of (grants.results || []) as any[]) {
    const timestamp = g.last_synced;
    const score = TYPE_PRIORITY.grant
      + recencyBoost(timestamp)
      + titleMatchBonus(g.title, q);
    results.push({
      id: g.project_number,
      type: 'grant',
      title: g.title || g.project_number,
      subtitle: [g.pi_name, g.fiscal_year && `FY${g.fiscal_year}`].filter(Boolean).join(' · '),
      url: '/portal/grants',
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

  // Return top 50 — with 14 entity types searched, 20 was too narrow
  // (notes/decisions/files got pushed out by tasks/projects hitting the
  // cap). 50 gives per-type visibility without overwhelming the UI.
  const top = results.slice(0, 50);

  return json({ data: top, count: top.length, query: q });
}
