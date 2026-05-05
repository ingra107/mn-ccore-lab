import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug } from '../helpers';
import { applyMutation } from './mutations';

// ── AI Co-Scientist: detect @hermes/@claude mentions and create pending request ──
async function handleClaudeMention(
  content: string,
  sourceType: string,
  sourceId: string,
  projectId: string,
  user: AuthUser,
  env: Env,
): Promise<void> {
  if (!/@(hermes|claude)\b/i.test(content)) return;

  const aiPrompt = content.replace(/@(hermes|claude)/gi, '').trim();
  if (aiPrompt.length <= 5) return;

  // Create AI request record
  const aiId = generateId();
  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(aiId, sourceType, sourceId, projectId, aiPrompt, `Project: ${projectId}`, user.email).run();

  // Create a placeholder comment from "claude-ai"
  const responseId = generateId();
  await env.DB.prepare(
    "INSERT INTO comments (id, project_id, author_id, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(responseId, projectId, 'claude-ai', 'Thinking about this... (AI response pending)').run();
}

// GET /api/milestones?project_id=&grant_id=
export async function handleGetMilestones(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  const grantId = url.searchParams.get('grant_id');

  let query = 'SELECT * FROM milestones WHERE 1=1';
  const params: string[] = [];

  if (projectId) {
    query += ' AND project_id = ?';
    params.push(projectId);
  }

  if (grantId) {
    query += ' AND grant_id = ?';
    params.push(grantId);
  }

  query += ' ORDER BY target_date ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/milestones/:id/complete — toggle milestone completion
// 2026-04-20 Airtable Funeral P2-2: PWA syncMilestoneToAirtable flips
// to this endpoint. Body: {completed: true|false}. Sets status +
// completed_date atomically.
export async function handleUpdateMilestoneCompletion(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { completed: boolean };

  if (typeof body.completed !== 'boolean') {
    return error('completed field (boolean) is required', 400);
  }

  const completedDate = body.completed ? new Date().toISOString().split('T')[0] : null;
  const status = body.completed ? 'completed' : 'pending';

  await env.DB.prepare(
    'UPDATE milestones SET status = ?, completed_date = ? WHERE id = ?'
  ).bind(status, completedDate, id).run();

  const updated = await env.DB.prepare('SELECT * FROM milestones WHERE id = ?').bind(id).first();
  if (!updated) {
    return error('Milestone not found', 404);
  }

  await logActivity(env, 'milestone', `${body.completed ? 'Completed' : 'Reopened'} milestone`, user.email, id, 'milestone');

  return json({ data: updated });
}

// POST /api/milestones/:id/note — add/update "Future Me" note
export async function handleUpdateMilestoneNote(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { note: string };

  if (typeof body.note !== 'string') {
    return error('note field is required', 400);
  }

  // Allow clearing a note by setting to empty string
  const noteValue = body.note.trim() || null;

  await env.DB.prepare(
    'UPDATE milestones SET future_note = ?, future_note_author = ? WHERE id = ?'
  ).bind(noteValue, user.email, id).run();

  const updated = await env.DB.prepare('SELECT * FROM milestones WHERE id = ?').bind(id).first();
  if (!updated) {
    return error('Milestone not found', 404);
  }

  await logActivity(env, 'milestone_note', `${noteValue ? 'Added' : 'Cleared'} Future Me note on milestone`, user.email, id, 'milestone');

  return json({ data: updated });
}

// POST /api/projects — create new project
export async function handleCreateProject(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    title: string
    slug?: string
    category?: string
    stage?: string
    description?: string
    pi?: string
  };

  if (!body.title?.trim()) {
    return error('title required', 400);
  }

  // Sanitize: `[a-z0-9-]` only. A client-supplied body.slug of e.g.
  // `(mceachron)-project` would otherwise break react-router path matching
  // downstream. Apply the same pass to the title-derived fallback.
  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const baseSlug = body.slug ? sanitize(body.slug) : sanitize(body.title);
  if (!baseSlug) return error('title/slug yields empty slug after sanitization', 400);
  // Collision-avoidance: if slug already exists, append -2, -3, ... until free.
  // Found by deep-audit Suite 8 — two creates with same title collided on slug,
  // effectively corrupting the first project's identity.
  let slug = baseSlug;
  let attempt = 2;
  while (true) {
    const existing = await env.DB.prepare('SELECT id FROM projects WHERE slug = ?').bind(slug).first();
    if (!existing) break;
    slug = `${baseSlug}-${attempt}`;
    attempt += 1;
    if (attempt > 100) return error(`Cannot generate unique slug after 100 attempts from "${baseSlug}"`, 500);
  }
  const id = generateId('project');  // A1.2: typed ULID

  const createProjMut = await applyMutation(env, {
    table: 'projects',
    record_id: id,
    op: 'insert',
    payload: {
      title: body.title.trim(),
      slug,
      category: body.category || 'lab',
      stage: body.stage || 'Idea',
      description: body.description || '',
      pi: body.pi || user.email.split('@')[0],
      status: 'active',
      created_at: new Date().toISOString(),
    },
    route: 'handleCreateProject',
    user,
  });
  if (createProjMut.status !== 'accepted') {
    return error(`mutation rejected: ${createProjMut.status} — ${createProjMut.reason ?? ''}`, 409);
  }

  await logActivity(env, 'project', `Created project: ${body.title.trim()}`, user.email, id, null);

  const created = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// GET /api/projects?status=&category=&include_deleted=1[&seq_after=N&limit=N]
// Sync pipelines can opt into seeing soft-deleted rows via ?include_deleted=1
// (mirrors the tasks endpoint contract added 2026-04-18 for sync_d1_pull).
// Default behavior filters deleted_at IS NULL so UI never shows tombstones.
//
// 2026-04-28 (schema-v51): when ?seq_after=N is present, switches to
// sync-cursor mode: filters seq > N, orders by seq ASC, applies limit
// (default 2000). This is the canonical pull path for brain.db's hub.py
// driver post-seq-cursor cutover. Wall-clock updated_at remains usable
// for non-sync clients; seq_after takes precedence when both are sent.
export async function handleProjects(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  const seqAfterRaw = url.searchParams.get('seq_after');
  const limitRaw = url.searchParams.get('limit');

  const deletedFilter = includeDeleted ? '1=1' : 'deleted_at IS NULL';
  let query = `SELECT * FROM projects WHERE ${deletedFilter}`;
  const params: (string | number)[] = [];

  if (seqAfterRaw !== null) {
    const seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return json({ error: 'seq_after must be a non-negative integer' }, 400);
    }
    query += ' AND seq > ?';
    params.push(seqAfter);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (seqAfterRaw !== null) {
    const limit = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000) : 2000;
    query += ' ORDER BY seq ASC LIMIT ?';
    params.push(limit);
  } else {
    query += ' ORDER BY title ASC';
  }

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/:id/comments
export async function handleGetComments(projectId: string, env: Env): Promise<Response> {
  // URL param may be slug or id. Resolve first so we can match comments by the
  // canonical project.id, while ALSO accepting any legacy rows that were
  // stored against the slug (older writes did so).
  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? OR slug = ?').bind(projectId, projectId).first<{ id: string }>();
  const canonicalId = project?.id ?? projectId;
  const result = await env.DB.prepare(
    `SELECT c.id, c.content, c.created_at, c.author_id,
       COALESCE(t.name, CASE WHEN c.author_id = 'claude-ai' THEN 'Claude AI' END) as author_name,
       COALESCE(t.slug, CASE WHEN c.author_id = 'claude-ai' THEN 'claude-ai' END) as author_slug
     FROM comments c
     LEFT JOIN team_members t ON c.author_id = t.id
     WHERE c.project_id = ? OR c.project_id = ?
     ORDER BY c.created_at DESC`
  ).bind(canonicalId, projectId).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/:slug/updates
export async function handleGetProjectUpdates(slug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(slug).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/health — project health metrics (scored 0-100)
export async function handleProjectHealth(env: Env): Promise<Response> {
  // Batched implementation — prior version ran 7 queries per active project
  // (N+1 anti-pattern). With 68 projects this was ~476 sequential queries
  // and 8.8s p95. Found via deep-audit Suite 14.
  //
  // New approach: one aggregation query per data source, keyed by project_id,
  // merged in memory. Total query count is now constant (6 regardless of
  // project count). Benchmarked ~80ms for 68 projects.
  const projects = await env.DB.prepare(
    "SELECT id, slug, title, stage, status, updated_at FROM projects WHERE status = 'active'"
  ).all<{ id: string; slug: string; title: string; stage: string; status: string; updated_at: string }>();

  const now = new Date();
  const nowIso = now.toISOString().split('T')[0];

  // Six aggregation queries — whole-table scans but one-shot.
  const [updatesAgg, tasksCompAgg, activityAgg, commentsAgg, tasksVelocityAgg, milestonesAgg] = await Promise.all([
    env.DB.prepare('SELECT project_id, MAX(created_at) as latest FROM project_updates GROUP BY project_id').all<{ project_id: string; latest: string }>(),
    env.DB.prepare('SELECT project_id, MAX(completed_at) as latest, COUNT(*) as done_count, SUM(CASE WHEN due_date IS NOT NULL AND completed_at <= due_date || \'T23:59:59\' THEN 1 ELSE 0 END) as on_time_count, SUM(CASE WHEN due_date IS NOT NULL THEN 1 ELSE 0 END) as with_due_count FROM tasks WHERE completed = 1 AND completed_at IS NOT NULL GROUP BY project_id').all<{ project_id: string; latest: string; done_count: number; on_time_count: number; with_due_count: number }>(),
    env.DB.prepare("SELECT related_id, MAX(timestamp) as latest FROM activity_log WHERE related_type = 'project' GROUP BY related_id").all<{ related_id: string; latest: string }>(),
    env.DB.prepare('SELECT project_id, MAX(created_at) as latest FROM comments GROUP BY project_id').all<{ project_id: string; latest: string }>(),
    env.DB.prepare('SELECT project_id, COUNT(*) as pending_count, SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) as overdue_count FROM tasks WHERE completed = 0 AND deleted_at IS NULL GROUP BY project_id').bind(nowIso).all<{ project_id: string; pending_count: number; overdue_count: number }>(),
    env.DB.prepare("SELECT project_id, MIN(target_date) as next_target FROM milestones WHERE status IN ('pending', 'in_progress') AND target_date IS NOT NULL GROUP BY project_id").all<{ project_id: string; next_target: string }>(),
  ]);

  // Build maps keyed by both slug and id — project_id column stores either.
  const mapByKey = <T>(rows: T[], keyFn: (r: T) => string): Map<string, T> => {
    const m = new Map<string, T>();
    for (const r of rows) { const k = keyFn(r); if (k) m.set(k, r); }
    return m;
  };

  const updates = mapByKey(updatesAgg.results || [], (r) => r.project_id);
  const tasksComp = mapByKey(tasksCompAgg.results || [], (r) => r.project_id);
  const activity = mapByKey(activityAgg.results || [], (r) => r.related_id);
  const comments = mapByKey(commentsAgg.results || [], (r) => r.project_id);
  const velocity = mapByKey(tasksVelocityAgg.results || [], (r) => r.project_id);
  const milestones = mapByKey(milestonesAgg.results || [], (r) => r.project_id);

  const lookup = <T>(m: Map<string, T>, slug: string, id: string): T | undefined => m.get(slug) ?? m.get(id);

  const healthData = [];
  for (const p of projects.results) {
    const latestUpdate = lookup(updates, p.slug, p.id);
    const latestTaskDone = lookup(tasksComp, p.slug, p.id);
    const latestActivity = lookup(activity, p.slug, p.id);
    const latestComment = lookup(comments, p.slug, p.id);
    const v = lookup(velocity, p.slug, p.id);
    const nextMilestone = lookup(milestones, p.slug, p.id);

    const dates = [latestUpdate?.latest, latestTaskDone?.latest, latestActivity?.latest, latestComment?.latest, p.updated_at].filter(Boolean) as string[];
    const lastUpdateDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    const daysSinceUpdate = lastUpdateDate ? Math.floor((now.getTime() - new Date(lastUpdateDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

    let activityScore: number;
    if (daysSinceUpdate <= 7) activityScore = 30;
    else if (daysSinceUpdate <= 14) activityScore = 20;
    else if (daysSinceUpdate <= 30) activityScore = 10;
    else activityScore = 0;

    let velocityScore: number;
    const withDue = v?.with_due_count ?? 0;
    if (withDue === 0) velocityScore = 15;
    else {
      const onTimePct = (v?.on_time_count ?? 0) / withDue;
      if (onTimePct >= 0.8) velocityScore = 25;
      else if (onTimePct >= 0.6) velocityScore = 20;
      else if (onTimePct >= 0.4) velocityScore = 15;
      else velocityScore = 5;
    }

    const overdueCount = v?.overdue_count ?? 0;
    let overdueScore: number;
    if (overdueCount === 0) overdueScore = 25;
    else if (overdueCount === 1) overdueScore = 15;
    else if (overdueCount <= 3) overdueScore = 5;
    else overdueScore = 0;

    let milestoneScore: number;
    if (!nextMilestone) milestoneScore = 10;
    else {
      const msDate = new Date(nextMilestone.next_target);
      const daysUntil = Math.floor((msDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil > 7) milestoneScore = 20;
      else if (daysUntil >= 0) milestoneScore = 15;
      else milestoneScore = 5;
    }

    const score = activityScore + velocityScore + overdueScore + milestoneScore;
    let status: 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical';
    if (score >= 80) status = 'Healthy';
    else if (score >= 60) status = 'Needs Attention';
    else if (score >= 40) status = 'At Risk';
    else status = 'Critical';

    healthData.push({
      slug: p.slug,
      title: p.title,
      stage: p.stage,
      score,
      status,
      factors: { activity: activityScore, velocity: velocityScore, overdue: overdueScore, milestones: milestoneScore },
      last_activity: lastUpdateDate ? lastUpdateDate.split('T')[0] : null,
      overdue_count: overdueCount,
      days_since_update: daysSinceUpdate === 999 ? null : daysSinceUpdate,
      pending_actions: v?.pending_count ?? 0,
    });
  }

  // Sort by score ascending (worst health first)
  healthData.sort((a, b) => a.score - b.score);

  const summary = {
    total: healthData.length,
    healthy: healthData.filter((h) => h.status === 'Healthy').length,
    needs_attention: healthData.filter((h) => h.status === 'Needs Attention').length,
    at_risk: healthData.filter((h) => h.status === 'At Risk').length,
    critical: healthData.filter((h) => h.status === 'Critical').length,
    avg_score: healthData.length > 0
      ? Math.round(healthData.reduce((sum, h) => sum + h.score, 0) / healthData.length)
      : 0,
  };

  return json({ data: healthData, summary });
}

// GET /api/updates/recent?limit=N[&since=ISO_TIMESTAMP]
//
// 2026-04-28 (silent-data-loss class P3): added `since` cursor support.
// Codex review caught a follow-up bug: ORDER BY DESC + advance-to-MAX leaks
// when volume > limit. Fix: when `since` is present, return ASC so client
// can paginate forward and never miss the oldest rows; when no `since`
// (UI-style "give me 20 newest"), keep DESC for back-compat. Brain.db
// pull_project_updates now paginates until response_count < limit.
export async function handleRecentUpdates(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 500);
  const since = url.searchParams.get('since');
  let query = 'SELECT * FROM project_updates';
  const binds: unknown[] = [];
  if (since) {
    query += ' WHERE created_at > ?';
    binds.push(since);
    // Sync mode: ASC + tiebreak on id ensures the client can resume
    // exactly from the last seen (created_at, id) pair without overlap or skip.
    query += ' ORDER BY created_at ASC, id ASC LIMIT ?';
  } else {
    query += ' ORDER BY created_at DESC LIMIT ?';
  }
  binds.push(limit);
  const result = await env.DB.prepare(query).bind(...binds).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/projects/:id — update project fields
// Hoisted to module scope — avoids allocation per request
const PROJECT_ALLOWED_FIELDS = new Set([
  'title', 'status', 'description', 'category', 'stage', 'pi', 'slug',
  'pi_context', 'strategic_context', 'short_name',
  // key_link_* added in schema-v42
  'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc',
  // W1 (schema-v55) operational state + pipeline metadata
  'state', 'next_artifact', 'last_meaningful_movement', 'stale_active_since',
]);
const PROJECT_REQUIRED_FIELDS = new Set(['status', 'stage', 'category']);

// Canonical enum guards — reject arbitrary string storage. Keep in sync with
// Peripheral-Brain's scripts/db/enums.py (R10 taxonomy). Found during deep
// audit Suite 2 — "bogus_value" was round-tripping through PUT/POST.
const PROJECT_STATUS_VALUES = new Set(['active', 'waiting_external', 'blocked', 'done']);
const PROJECT_STAGE_VALUES = new Set(['Idea', 'Data Collection', 'Data Analysis', 'Writing', 'Submitted', 'Revisions', 'Accepted', 'Published']);
const PROJECT_CATEGORY_VALUES = new Set(['clif', 'lab', 'nate', 'mentee']);
// W1 (schema-v55) operational state — distinct from .status (lifecycle).
const PROJECT_STATE_VALUES = new Set(['Active', 'Waiting', 'Delegated', 'Incubating', 'Parked', 'Closing', 'Dead']);
const PROJECT_ENUM_GUARDS: Record<string, Set<string>> = {
  status: PROJECT_STATUS_VALUES,
  stage: PROJECT_STAGE_VALUES,
  category: PROJECT_CATEGORY_VALUES,
  state: PROJECT_STATE_VALUES,
};

export async function handleUpdateProject(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // client_updated_at was a LWW guard for the legacy direct-SQL path.
  // Post-Phase-3.1, Hub UI writes go through applyMutation (base_seq=null =>
  // always authoritative from Hub). Strip it from the patch so it doesn't
  // end up in the field-whitelist check.
  delete body.client_updated_at;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (PROJECT_ALLOWED_FIELDS.has(key)) {
      if (PROJECT_REQUIRED_FIELDS.has(key) && (val === null || val === undefined || val === '')) {
        continue;
      }
      // Enum validation — reject unknown values instead of silently storing them.
      const guard = PROJECT_ENUM_GUARDS[key];
      if (guard && typeof val === 'string' && !guard.has(val)) {
        return error(`Invalid ${key}: "${val}". Must be one of: ${[...guard].join(', ')}`, 400);
      }
      updates.push(`${key} = ?`);
      values.push(val as string | number | null);
    }
  }

  if (updates.length === 0) {
    return error('No valid fields to update', 400);
  }

  // Check row existence to distinguish "row not found" (fallback INSERT)
  // from "row found" (UPDATE).
  const existingCheck = await env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1'
  ).bind(id, id).first<{ id: string }>();

  if (!existingCheck) {
    // Project doesn't exist — create it (upsert; preserves legacy behavior).
    const upsertSlug = (body.slug as string) || id;
    const newId = id.length === 32 ? id : generateId('project');
    const upsertMut = await applyMutation(env, {
      table: 'projects',
      record_id: newId,
      op: 'insert',
      payload: {
        title: (body.title as string) || 'Untitled',
        status: (body.status as string) || 'active',
        description: (body.description as string) || '',
        category: (body.category as string) || 'lab',
        stage: (body.stage as string) || 'Idea',
        pi: (body.pi as string) || 'nick',
        slug: upsertSlug,
      },
      route: 'handleUpdateProject',
      user,
    });
    if (upsertMut.status !== 'accepted') {
      return error(`mutation rejected: ${upsertMut.status} — ${upsertMut.reason ?? ''}`, 409);
    }
  } else {
    // Build patch from validated fields
    const patchFields: Record<string, unknown> = {};
    for (let i = 0; i < updates.length; i++) {
      const col = updates[i].split(' = ')[0].trim();
      patchFields[col] = values[i];
    }

    const updateProjMut = await applyMutation(env, {
      table: 'projects',
      record_id: existingCheck.id,
      op: 'update',
      patch: patchFields,
      route: 'handleUpdateProject',
      user,
    });
    if (updateProjMut.status !== 'accepted' && updateProjMut.status !== 'merged_clean') {
      // Return current server state so the caller can reconcile (mirrors old LWW guard behavior).
      const current = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(existingCheck.id).first();
      return json({ data: current, rejected: updateProjMut.status,
                    message: `mutation ${updateProjMut.status}: ${updateProjMut.reason ?? ''}` });
    }
  }

  await logActivity(env, 'project_update', `Updated project fields: ${Object.keys(body).join(', ')}`, user.email, id, 'project');

  const updated = await env.DB.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').bind(id, id).first();
  return json({ data: updated });
}

// POST /api/projects/:id/delete — soft-delete a project, mirror to brain.db
//
// Cascade chain (D1-only, post-2026-04-21 Airtable retirement):
//   1. D1: set projects.deleted_at = now (soft-delete, keeps row for
//      /api/projects/deleted-since consumers until a 30-day sweep reclaims).
//   2. D1: cascade-clean comments/project_updates (hard DELETE), NULL out
//      tasks.project_id (keep the task, clear the dangling ref).
//   3. brain.db consumer: scripts/db/sync/ pulls /api/projects/deleted-since
//      and mirrors status='done' + retires slug via boundary.retire_alias.
//
// Airtable DELETE cascade removed in CX-S2 (2026-04-28): Airtable was retired
// 2026-04-21 and there's no live write path on PB side. Pre-removal this
// function shipped 65 LOC of cascadeAirtableProjectDelete + looksLikeAirtableRecId
// + secret config that all no-op'd today (AIRTABLE_TOKEN unset on Hub since
// retirement). Codex 2026-04-28 holistic-review SIMPLIFY finding.
export async function handleDeleteProject(
  id: string,
  user: AuthUser,
  env: Env,
  url?: URL,
): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT id, title, slug FROM projects WHERE id = ? OR slug = ?'
  ).bind(id, id).first<{ id: string; title: string; slug: string }>();

  if (!existing) {
    return error('Project not found', 404);
  }

  // Cascade-clean related rows to avoid FK-like errors or orphaned refs.
  // `comments` and `project_updates` hold a free-form project_id (not an
  // enforced FK), but leaving them behind means stale joins forever.
  // `tasks.project_id` is soft-orphaned to NULL (keep the task, clear the ref)
  // so users don't lose work — dangling refs found by deep-audit Suite 8.
  try {
    await env.DB.prepare('DELETE FROM comments WHERE project_id = ? OR project_id = ?').bind(existing.id, existing.slug).run();
    await env.DB.prepare('DELETE FROM project_updates WHERE project_id = ? OR project_id = ?').bind(existing.id, existing.slug).run();
    await env.DB.prepare('UPDATE tasks SET project_id = NULL, updated_at = datetime(\'now\') WHERE (project_id = ? OR project_id = ?) AND deleted_at IS NULL').bind(existing.id, existing.slug).run();
  } catch (e) {
    console.error('project cascade-clean failed:', e);
  }

  // Check idempotency: already soft-deleted?
  const projectRow = await env.DB.prepare(
    'SELECT deleted_at FROM projects WHERE id = ?'
  ).bind(existing.id).first<{ deleted_at: string | null }>();
  if (projectRow?.deleted_at) {
    await logActivity(env, 'project_delete', `Deleted project (idempotent): ${existing.title}`, user.email, existing.id, 'project');
    return json({ data: { deleted: existing.id, slug: existing.slug, title: existing.title, idempotent: true } });
  }

  // Soft-delete via applyMutation — stamps last_mutation_id + records in processed_mutations.
  const deleteProjMut = await applyMutation(env, {
    table: 'projects',
    record_id: existing.id,
    op: 'delete',
    route: 'handleDeleteProject',
    user,
  });
  if (deleteProjMut.status !== 'accepted' && deleteProjMut.status !== 'merged_clean') {
    return error(`mutation rejected: ${deleteProjMut.status} — ${deleteProjMut.reason ?? ''}`, 409);
  }

  await logActivity(
    env,
    'project_delete',
    `Deleted project: ${existing.title}`,
    user.email,
    existing.id,
    'project',
  );

  return json({
    data: {
      deleted: existing.id,
      slug: existing.slug,
      title: existing.title,
    },
  });
}

// GET /api/projects/deleted-since?since=ISO_TIMESTAMP — tombstone list
//
// Consumed by scripts/db/sync_d1_pull.py::pull_hub_projects to mirror Hub
// project deletes into brain.db (mark status='done', retire slug alias).
//
// `since` is an ISO-8601 datetime string. Returns rows where
// deleted_at > since. When `since` is omitted, returns all tombstoned rows
// (cap 1000, ordered newest first).
export async function handleGetDeletedProjectsSince(
  url: URL,
  env: Env,
): Promise<Response> {
  const since = url.searchParams.get('since');
  const seqAfterRaw = url.searchParams.get('seq_after');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000', 10), 5000);

  // 2026-04-28 (silent-data-loss class P3): added seq_after support so brain.db
  // pulls can advance with monotonic guarantees instead of re-fetching all
  // tombstones every poll. seq_after takes precedence over since when both sent;
  // since remains for back-compat.
  let rows: D1Result<Record<string, unknown>>;
  if (seqAfterRaw !== null) {
    const seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
    rows = await env.DB.prepare(
      'SELECT id, title, slug, category, stage, status, deleted_at, updated_at, seq FROM projects WHERE deleted_at IS NOT NULL AND seq > ? ORDER BY seq ASC LIMIT ?'
    ).bind(seqAfter, limit).all();
  } else if (since) {
    rows = await env.DB.prepare(
      'SELECT id, title, slug, category, stage, status, deleted_at, updated_at, seq FROM projects WHERE deleted_at IS NOT NULL AND deleted_at > ? ORDER BY deleted_at DESC LIMIT ?'
    ).bind(since, limit).all();
  } else {
    rows = await env.DB.prepare(
      'SELECT id, title, slug, category, stage, status, deleted_at, updated_at, seq FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?'
    ).bind(limit).all();
  }

  return json({ data: rows.results, count: rows.results.length });
}

// POST /api/projects/:id/comments — add comment
export async function handleAddComment(
  projectId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { content?: string; author_slug?: string };

  if (!body.content || body.content.trim().length === 0) {
    return error('Comment content is required', 400);
  }

  // Verify project exists (accept either id or slug — URL param can be either).
  const project = await env.DB.prepare('SELECT id, title, slug FROM projects WHERE id = ? OR slug = ?').bind(projectId, projectId).first<{ id: string; title: string; slug: string | null }>();
  if (!project) {
    return error('Project not found', 404);
  }

  // Look up author — body.author_slug takes precedence so API-driven seeding
  // attributes correctly. Falls back to the signed-in user's slug.
  const authorSlugResolved = body.author_slug?.trim() || actorSlug(user.email);
  const member = await env.DB.prepare('SELECT id FROM team_members WHERE slug = ?')
    .bind(authorSlugResolved)
    .first<{ id: string }>();

  // Use the resolved project.id (not URL param) to keep comments.project_id
  // canonical. URL can be slug, but we store against projects.id.
  const commentId = generateId();
  await env.DB.prepare(
    'INSERT INTO comments (id, project_id, author_id, content) VALUES (?, ?, ?, ?)'
  ).bind(commentId, project.id, member?.id ?? null, body.content.trim()).run();

  await logActivity(env, 'comment', `Commented on "${project.title}"`, user.email, project.id, 'project');

  // Create notifications for @mentions
  try {
    const mentions = parseMentions(body.content);
    if (mentions.length > 0) {
      const validSlugs = await env.DB.prepare(
        'SELECT slug FROM team_members WHERE slug IN (' + mentions.map(() => '?').join(',') + ')'
      ).bind(...mentions).all();

      const validSet = new Set((validSlugs.results || []).map((r: any) => r.slug));
      const authorSlug = actorSlug(user.email);
      // source_id references the PROJECT (what the user cares about on click),
      // not the comment row id. Link resolves to the project's canonical slug
      // so old id-based URLs keep working.
      const targets = mentions.filter((slug) => validSet.has(slug) && slug !== authorSlug);
      if (targets.length > 0) {
        const title = `${user.name || user.email} mentioned you in a comment`;
        const bodyPreview = body.content.trim().slice(0, 200);
        const link = `/projects/${project.slug ?? projectId}`;
        const stmt = env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        await env.DB.batch(
          targets.map((slug) =>
            stmt.bind(generateId(), slug, 'mention', 'project_comment', project.id, title, bodyPreview, link)
          )
        );
      }
    }
  } catch (e) {
    // Notification creation should not break the main comment operation
    console.error('Failed to create mention notifications for comment:', e);
  }

  // Check for @hermes/@claude mention → create AI request + placeholder comment
  try {
    await handleClaudeMention(body.content, 'project_comment', commentId, projectId, user, env);
  } catch (e) {
    console.error('Failed to create AI request for @hermes mention:', e);
  }

  return json({ data: { id: commentId, project_id: projectId, content: body.content.trim(), author: user.email } }, 201);
}

// POST /api/projects/:slug/updates — post project update
export async function handlePostProjectUpdate(slug: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; update_type?: string; author?: string };
  if (!body.content) return error('content required', 400);

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO project_updates (id, project_id, author, content, update_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, slug, body.author?.trim() || user.email, body.content, body.update_type ?? 'progress').run();

  await logActivity(env, 'project_update', `Posted update on ${slug}: "${body.content.slice(0, 100)}"`, user.email, slug, 'project');

  // Create notifications for @mentions
  try {
    const mentions = parseMentions(body.content);
    if (mentions.length > 0) {
      const validSlugs = await env.DB.prepare(
        'SELECT slug FROM team_members WHERE slug IN (' + mentions.map(() => '?').join(',') + ')'
      ).bind(...mentions).all();

      const validSet = new Set((validSlugs.results || []).map((r: any) => r.slug));
      const authorSlug = actorSlug(user.email);
      const targets = mentions.filter((m) => validSet.has(m) && m !== authorSlug);
      if (targets.length > 0) {
        const title = `${user.name || user.email} mentioned you in a project update`;
        const bodyPreview = body.content.slice(0, 200);
        const link = `/projects/${slug}`;
        const stmt = env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        await env.DB.batch(
          targets.map((mentionSlug) =>
            stmt.bind(generateId(), mentionSlug, 'mention', 'project_update', id, title, bodyPreview, link)
          )
        );
      }
    }
  } catch (e) {
    // Notification creation should not break the main update operation
    console.error('Failed to create mention notifications for project update:', e);
  }

  const created = await env.DB.prepare('SELECT * FROM project_updates WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
