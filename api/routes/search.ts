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
  /** Snippet (~120 chars) centered on the matched token in the matched
   * field. Frontend renders below title with <mark> highlights. */
  snippet?: string | null;
  /** Human label of the field that produced the match ("description",
   * "abstract", etc.) so the frontend can show "matched in description". */
  matchedField?: string | null;
  /** Per-type metadata for type-specific row rendering (S-12). */
  details?: Record<string, any> | null;
}

/** Build a ~120-char snippet centered on the first occurrence of `q`
 * inside `text`. Returns null when text doesn't contain q. */
function buildSnippet(text: string | null | undefined, q: string, maxLen = 160): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return null;
  const ctx = Math.max(0, Math.floor((maxLen - q.length) / 2));
  let start = Math.max(0, idx - ctx);
  let end = Math.min(text.length, idx + q.length + ctx);
  // Snap to word boundaries when possible.
  if (start > 0) {
    const ws = text.lastIndexOf(' ', start);
    if (ws > start - 12 && ws >= 0) start = ws + 1;
  }
  if (end < text.length) {
    const ws = text.indexOf(' ', end);
    if (ws !== -1 && ws < end + 12) end = ws;
  }
  let out = text.slice(start, end).trim();
  if (start > 0) out = '… ' + out;
  if (end < text.length) out = out + ' …';
  return out;
}

/** Pick the matched field across N candidates and emit the snippet +
 * field name. Returns the first field that contains the query. */
function pickMatch(q: string, fields: Array<{ name: string; value: string | null | undefined }>): { snippet: string | null; matchedField: string | null } {
  for (const f of fields) {
    const snip = buildSnippet(f.value, q);
    if (snip) return { snippet: snip, matchedField: f.name };
  }
  return { snippet: null, matchedField: null };
}

// --- Handler ---

// GET /api/search?q=
// AM-4 (SEC-T0-2): `canSeePb` true for PI/Nick/service (resolved by the
// index.ts router). Non-PI/unauth callers must never see content derived from
// a 'Peripheral Brain'-category project — applied via a single shared SQL
// predicate to EVERY project-derived query: projects, project comments,
// project notes (project_updates), tasks (by parent project), and files (by
// parent project). Non-project entities (ideas, meetings, publications,
// grants, decisions, activity) are unaffected here.
export async function handleGetSearch(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return json({ data: [], count: 0 });
  // Upper bound: 200-char search strings are already absurdly long; cap to
  // avoid HTTP 500 on pathologically large LIKE patterns (deep-audit 13.M).
  if (q.length > 200) return json({ data: [], count: 0, truncated: true });

  const like = `%${q}%`;
  const limit = 15;

  // visibleProjectPredicate — shared PB-category exclusion. Empty for PI;
  // for everyone else, excludes any project (or project-derived row) whose
  // category is 'Peripheral Brain'. `pAlias` is the projects table alias in
  // the query (''=bare projects, 'p'=joined). The subquery form covers tasks
  // and files where the project isn't directly joined.
  const projPred = canSeePb ? '' : "category != 'Peripheral Brain' OR category IS NULL";
  const joinedProjPred = canSeePb ? '' : "p.category != 'Peripheral Brain' OR p.category IS NULL";
  // For tasks/files: exclude rows whose project_id/entity_id points at a PB
  // project (matched by id OR slug). Non-project rows pass through.
  const pbProjectIdSet = `SELECT id FROM projects WHERE category = 'Peripheral Brain'
      UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'`;

  // Search across 14 tables in parallel — Slack-parity unified search.
  const [
    tasks, projects, meetings, ideas, comments, activity,
    notes, taskNotes, taskComments, decisions, files, actionItems,
    publications, grants,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, description, assignee, status, priority, due_date, project_id, created_at FROM tasks WHERE (title LIKE ? OR description LIKE ?) AND deleted_at IS NULL${
        canSeePb ? '' : ` AND (project_id IS NULL OR project_id NOT IN (${pbProjectIdSet}))`
      } LIMIT ?`
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      `SELECT slug, title, category, stage, pi, description, updated_at FROM projects WHERE (title LIKE ? OR category LIKE ? OR description LIKE ?) AND deleted_at IS NULL${
        projPred ? ` AND (${projPred})` : ''
      } LIMIT ?`
    ).bind(like, like, like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, date, type, notes FROM meetings WHERE (title LIKE ? OR notes LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      'SELECT id, title, description, submitted_by, status, created_at FROM ideas WHERE (title LIKE ? OR description LIKE ?) LIMIT ?'
    ).bind(like, like, limit).all(),
    env.DB.prepare(
      `SELECT c.id, c.content, c.author_id, c.created_at, p.title as project_title, p.slug as project_slug FROM comments c JOIN projects p ON c.project_id = p.id OR c.project_id = p.slug WHERE c.content LIKE ?${
        joinedProjPred ? ` AND (${joinedProjPred})` : ''
      } LIMIT ?`
    ).bind(like, limit).all(),
    env.DB.prepare(
      'SELECT id, type, description, actor, timestamp FROM activity_log WHERE description LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(like, limit).all(),
    // Project notes (project_updates)
    env.DB.prepare(
      `SELECT u.id, u.content, u.author, u.update_type, u.created_at, p.title as project_title, p.slug as project_slug FROM project_updates u JOIN projects p ON u.project_id = p.slug OR u.project_id = p.id WHERE u.content LIKE ?${
        joinedProjPred ? ` AND (${joinedProjPred})` : ''
      } LIMIT ?`
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
      'SELECT id, title, rationale, context, outcome, project_slug, decided_by, created_at FROM hub_decisions WHERE (title LIKE ? OR rationale LIKE ? OR context LIKE ? OR outcome LIKE ?) LIMIT ?'
    ).bind(like, like, like, like, limit).all(),
    // File attachments — exclude files attached to a PB-category project.
    env.DB.prepare(
      `SELECT id, filename, entity_type, entity_id, content_type, uploaded_by, created_at FROM file_attachments WHERE filename LIKE ?${
        canSeePb ? '' : ` AND NOT (entity_type = 'project' AND entity_id IN (${pbProjectIdSet}))`
      } LIMIT ?`
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
    const score = TYPE_PRIORITY.task
      + recencyBoost(timestamp)
      + titleMatchBonus(t.title, q)
      + (TASK_STATUS_BOOST[t.status] ?? 0);
    const match = pickMatch(q, [
      { name: 'title', value: t.title },
      { name: 'description', value: t.description },
    ]);
    // S-07: deeplink into project context when task has a project_id.
    const url = t.project_id
      ? `/portal/projects/${t.project_id}?openTask=${t.id}`
      : `/portal/my-tasks?open=${t.id}`;
    results.push({
      id: t.id,
      type: 'task',
      title: t.title || t.description,
      subtitle: `${t.assignee} · ${t.status} · ${t.priority}`,
      url,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        assignee: t.assignee,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        project_id: t.project_id,
      },
    });
  }

  // Projects
  for (const p of (projects.results || []) as any[]) {
    const timestamp = p.updated_at;
    const score = TYPE_PRIORITY.project
      + recencyBoost(timestamp)
      + titleMatchBonus(p.title, q);
    const match = pickMatch(q, [
      { name: 'title', value: p.title },
      { name: 'description', value: p.description },
      { name: 'category', value: p.category },
    ]);
    results.push({
      id: p.slug,
      type: 'project',
      title: p.title,
      subtitle: `${p.stage} · ${p.category}`,
      url: `/portal/projects/${p.slug}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        category: p.category,
        stage: p.stage,
        pi: p.pi,
      },
    });
  }

  // Meetings
  for (const m of (meetings.results || []) as any[]) {
    const timestamp = m.date;
    const score = TYPE_PRIORITY.meeting
      + recencyBoost(timestamp)
      + titleMatchBonus(m.title, q);
    const match = pickMatch(q, [
      { name: 'title', value: m.title },
      { name: 'notes', value: m.notes },
    ]);
    results.push({
      id: m.id,
      type: 'meeting',
      title: m.title,
      subtitle: m.date,
      url: `/portal/meetings/${m.id}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        date: m.date,
        type: m.type,
      },
    });
  }

  // Ideas
  for (const i of (ideas.results || []) as any[]) {
    const timestamp = i.created_at;
    const score = TYPE_PRIORITY.idea
      + recencyBoost(timestamp)
      + titleMatchBonus(i.title, q);
    const match = pickMatch(q, [
      { name: 'title', value: i.title },
      { name: 'description', value: i.description },
    ]);
    results.push({
      id: i.id,
      type: 'idea',
      title: i.title,
      subtitle: `${i.submitted_by} · ${i.status}`,
      url: '/portal/ideas',
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Comments
  for (const c of (comments.results || []) as any[]) {
    const timestamp = c.created_at;
    const score = TYPE_PRIORITY.comment
      + recencyBoost(timestamp)
      + titleMatchBonus(c.content, q);
    const match = pickMatch(q, [{ name: 'content', value: c.content }]);
    results.push({
      id: c.id,
      type: 'comment',
      title: c.content?.slice(0, 100),
      subtitle: `on ${c.project_title}`,
      url: `/portal/projects/${c.project_slug}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Activity
  for (const a of (activity.results || []) as any[]) {
    const timestamp = a.timestamp;
    const score = TYPE_PRIORITY.activity
      + recencyBoost(timestamp)
      + titleMatchBonus(a.description, q);
    const match = pickMatch(q, [{ name: 'description', value: a.description }]);
    results.push({
      id: a.id,
      type: 'activity',
      title: a.description,
      subtitle: a.actor,
      url: '/portal/activity',
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Project notes (project_updates)
  for (const n of (notes.results || []) as any[]) {
    const timestamp = n.created_at;
    const score = TYPE_PRIORITY.note
      + recencyBoost(timestamp)
      + titleMatchBonus(n.content, q);
    const match = pickMatch(q, [{ name: 'content', value: n.content }]);
    results.push({
      id: n.id,
      type: 'note',
      title: (n.content || '').slice(0, 120),
      subtitle: `note on ${n.project_title || n.project_slug} · ${n.author}`,
      url: `/portal/projects/${n.project_slug}?tab=notes`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Task notes (task_updates)
  for (const n of (taskNotes.results || []) as any[]) {
    const timestamp = n.created_at;
    const score = TYPE_PRIORITY.task_note
      + recencyBoost(timestamp)
      + titleMatchBonus(n.content, q);
    const match = pickMatch(q, [{ name: 'content', value: n.content }]);
    results.push({
      id: n.id,
      type: 'task_note',
      title: (n.content || '').slice(0, 120),
      subtitle: `note on task · ${n.task_title || n.task_id} · ${n.author_slug}`,
      url: `/portal/my-tasks?open=${n.task_id}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Task comments
  for (const c of (taskComments.results || []) as any[]) {
    const timestamp = c.created_at;
    const score = TYPE_PRIORITY.task_comment
      + recencyBoost(timestamp)
      + titleMatchBonus(c.content, q);
    const match = pickMatch(q, [{ name: 'content', value: c.content }]);
    results.push({
      id: c.id,
      type: 'task_comment',
      title: (c.content || '').slice(0, 120),
      subtitle: `comment on task · ${c.task_title || c.task_id} · ${c.author_slug}`,
      url: `/portal/my-tasks?open=${c.task_id}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Decisions
  for (const d of (decisions.results || []) as any[]) {
    const timestamp = d.created_at;
    const score = TYPE_PRIORITY.decision
      + recencyBoost(timestamp)
      + titleMatchBonus(d.title, q);
    const parts = [d.decided_by, d.outcome].filter(Boolean);
    const match = pickMatch(q, [
      { name: 'title', value: d.title },
      { name: 'rationale', value: d.rationale },
      { name: 'context', value: d.context },
      { name: 'outcome', value: d.outcome },
    ]);
    results.push({
      id: d.id,
      type: 'decision',
      title: d.title,
      subtitle: parts.join(' · ') || (d.rationale || '').slice(0, 80),
      url: `/portal/decisions?open=${d.id}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        outcome: d.outcome,
        decided_by: d.decided_by,
      },
    });
  }

  // File attachments
  for (const f of (files.results || []) as any[]) {
    const timestamp = f.created_at;
    const score = TYPE_PRIORITY.file
      + recencyBoost(timestamp)
      + titleMatchBonus(f.filename, q);
    // S-08: route file → meeting when entity_type=meeting (was self-loop
    // to /portal/search). Also keep project/task branches.
    const entityUrl = f.entity_type === 'project'
      ? `/portal/projects/${f.entity_id}`
      : f.entity_type === 'task'
        ? `/portal/my-tasks?open=${f.entity_id}`
        : f.entity_type === 'meeting'
          ? `/portal/meetings/${f.entity_id}`
          : '/portal/search';
    const match = pickMatch(q, [{ name: 'filename', value: f.filename }]);
    results.push({
      id: f.id,
      type: 'file',
      title: f.filename,
      subtitle: `${f.entity_type} · ${f.uploaded_by || 'unknown'}`,
      url: entityUrl,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Meeting action items
  for (const a of (actionItems.results || []) as any[]) {
    const timestamp = a.created_at;
    const score = TYPE_PRIORITY.action_item
      + recencyBoost(timestamp)
      + titleMatchBonus(a.description, q)
      + (a.completed ? -2 : 1);
    const match = pickMatch(q, [{ name: 'description', value: a.description }]);
    results.push({
      id: a.id,
      type: 'action_item',
      title: a.description,
      subtitle: `action · ${a.assignee}${a.meeting_title ? ` · ${a.meeting_title}` : ''}${a.due_date ? ` · due ${a.due_date}` : ''}`,
      url: a.meeting_id ? `/portal/meetings/${a.meeting_id}` : '/portal/meetings',
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
    });
  }

  // Publications
  for (const p of (publications.results || []) as any[]) {
    const timestamp = p.created_at;
    const score = TYPE_PRIORITY.publication
      + recencyBoost(timestamp)
      + titleMatchBonus(p.title, q);
    const match = pickMatch(q, [
      { name: 'title', value: p.title },
      { name: 'journal', value: p.journal },
      { name: 'authors', value: p.authors },
    ]);
    results.push({
      id: p.id,
      type: 'publication',
      title: p.title,
      subtitle: [p.journal, p.year, p.status].filter(Boolean).join(' · '),
      url: `/publications/${p.id}`,
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        journal: p.journal,
        year: p.year,
        status: p.status,
      },
    });
  }

  // NIH grants
  for (const g of (grants.results || []) as any[]) {
    const timestamp = g.last_synced;
    const score = TYPE_PRIORITY.grant
      + recencyBoost(timestamp)
      + titleMatchBonus(g.title, q);
    const match = pickMatch(q, [
      { name: 'title', value: g.title },
      { name: 'pi_name', value: g.pi_name },
    ]);
    results.push({
      id: g.project_number,
      type: 'grant',
      title: g.title || g.project_number,
      subtitle: [g.pi_name, g.fiscal_year && `FY${g.fiscal_year}`].filter(Boolean).join(' · '),
      url: '/portal/grants',
      score,
      timestamp,
      snippet: match.snippet,
      matchedField: match.matchedField,
      details: {
        pi_name: g.pi_name,
        fiscal_year: g.fiscal_year,
        total_cost: g.total_cost,
      },
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
