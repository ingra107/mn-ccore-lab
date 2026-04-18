import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug } from '../helpers';

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

  const baseSlug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO projects (id, title, slug, category, stage, description, pi, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
  ).bind(
    id,
    body.title.trim(),
    slug,
    body.category || 'lab',
    body.stage || 'Idea',
    body.description || '',
    body.pi || user.email.split('@')[0],
  ).run();

  await logActivity(env, 'project', `Created project: ${body.title.trim()}`, user.email, id, null);

  const created = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// GET /api/projects?status=&category=
export async function handleProjects(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');

  let query = 'SELECT * FROM projects WHERE 1=1';
  const params: string[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY title ASC';

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

// GET /api/updates/recent?limit=20
export async function handleRecentUpdates(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const result = await env.DB.prepare(
    'SELECT * FROM project_updates ORDER BY created_at DESC LIMIT ?'
  ).bind(limit).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/projects/:id — update project fields
// Hoisted to module scope — avoids allocation per request
const PROJECT_ALLOWED_FIELDS = new Set([
  'title', 'status', 'description', 'category', 'stage', 'pi', 'slug',
  'pi_context', 'strategic_context', 'short_name',
  // key_link_* added in schema-v42
  'key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc',
]);
const PROJECT_REQUIRED_FIELDS = new Set(['status', 'stage', 'category']);

// Canonical enum guards — reject arbitrary string storage. Keep in sync with
// Peripheral-Brain's scripts/db/enums.py (R10 taxonomy). Found during deep
// audit Suite 2 — "bogus_value" was round-tripping through PUT/POST.
const PROJECT_STATUS_VALUES = new Set(['active', 'waiting_external', 'blocked', 'done']);
const PROJECT_STAGE_VALUES = new Set(['Idea', 'Data Collection', 'Data Analysis', 'Writing', 'Submitted', 'Accepted', 'Published']);
const PROJECT_CATEGORY_VALUES = new Set(['clif', 'lab', 'nate', 'mentee']);
const PROJECT_ENUM_GUARDS: Record<string, Set<string>> = {
  status: PROJECT_STATUS_VALUES,
  stage: PROJECT_STAGE_VALUES,
  category: PROJECT_CATEGORY_VALUES,
};

export async function handleUpdateProject(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
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

  updates.push("updated_at = datetime('now')");
  values.push(id);

  // Try update first
  const result = await env.DB.prepare(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ? OR slug = ?`
  ).bind(...values, id).run();

  if (result.meta.changes === 0) {
    // Project doesn't exist — create it (upsert)
    const slug = (body.slug as string) || id;
    const newId = id.length === 32 ? id : generateId();
    await env.DB.prepare(
      `INSERT INTO projects (id, title, status, description, category, stage, pi, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId,
      (body.title as string) || 'Untitled',
      (body.status as string) || 'active',
      (body.description as string) || '',
      (body.category as string) || 'lab',
      (body.stage as string) || 'Idea',
      (body.pi as string) || 'nick',
      slug,
    ).run();
  }

  await logActivity(env, 'project_update', `Updated project fields: ${Object.keys(body).join(', ')}`, user.email, id, 'project');

  const updated = await env.DB.prepare('SELECT * FROM projects WHERE id = ? OR slug = ?').bind(id, id).first();
  return json({ data: updated });
}

// POST /api/projects/:id/delete — delete a project row by id or slug
// Intentionally narrow: used for duplicate cleanup after slug drift. Does not
// cascade — caller must reparent tasks/milestones/etc before invoking.
export async function handleDeleteProject(
  id: string,
  user: AuthUser,
  env: Env,
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

  const result = await env.DB.prepare(
    'DELETE FROM projects WHERE id = ? OR slug = ?'
  ).bind(id, id).run();

  if (result.meta.changes === 0) {
    return error('Project not found', 404);
  }

  await logActivity(env, 'project_delete', `Deleted project: ${existing.title}`, user.email, existing.id, 'project');

  return json({ data: { deleted: existing.id, slug: existing.slug, title: existing.title } });
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

      for (const slug of mentions) {
        if (!validSet.has(slug)) continue;
        if (slug === authorSlug) continue; // don't notify yourself

        // source_id references the PROJECT (what the user cares about on click),
        // not the comment row id. Link resolves to the project's canonical slug
        // so old id-based URLs keep working.
        await env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          generateId(),
          slug,
          'mention',
          'project_comment',
          project.id,
          `${user.name || user.email} mentioned you in a comment`,
          body.content.trim().slice(0, 200),
          `/projects/${project.slug ?? projectId}`
        ).run();
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

      for (const mentionSlug of mentions) {
        if (!validSet.has(mentionSlug)) continue;
        if (mentionSlug === authorSlug) continue; // don't notify yourself

        await env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          generateId(),
          mentionSlug,
          'mention',
          'project_update',
          id,
          `${user.name || user.email} mentioned you in a project update`,
          body.content.slice(0, 200),
          `/projects/${slug}`
        ).run();
      }
    }
  } catch (e) {
    // Notification creation should not break the main update operation
    console.error('Failed to create mention notifications for project update:', e);
  }

  const created = await env.DB.prepare('SELECT * FROM project_updates WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
