import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions, actorSlug } from '../helpers';

// ── AI Co-Scientist: detect @claude mentions and create pending request ──
async function handleClaudeMention(
  content: string,
  sourceType: string,
  sourceId: string,
  projectId: string,
  user: AuthUser,
  env: Env,
): Promise<void> {
  if (!content.toLowerCase().includes('@claude')) return;

  const aiPrompt = content.replace(/@claude/gi, '').trim();
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

  const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO projects (id, title, slug, category, stage, description, pi, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', datetime('now'), datetime('now'))`
  ).bind(
    id,
    body.title.trim(),
    slug,
    body.category || 'research',
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
  const result = await env.DB.prepare(
    `SELECT c.id, c.content, c.created_at, c.author_id,
       COALESCE(t.name, CASE WHEN c.author_id = 'claude-ai' THEN 'Claude AI' END) as author_name,
       COALESCE(t.slug, CASE WHEN c.author_id = 'claude-ai' THEN 'claude-ai' END) as author_slug
     FROM comments c
     LEFT JOIN team_members t ON c.author_id = t.id
     WHERE c.project_id = ?
     ORDER BY c.created_at DESC`
  ).bind(projectId).all();
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
  // Get all active projects
  const projects = await env.DB.prepare(
    "SELECT id, slug, title, stage, status, updated_at FROM projects WHERE status IN ('Active', 'In Review', 'In Preparation')"
  ).all<{ id: string; slug: string; title: string; stage: string; status: string; updated_at: string }>();

  const now = new Date();
  const healthData = [];

  for (const p of projects.results) {
    // ── 1. Activity recency (30 pts max) ──────────────────────
    const [latestUpdate, latestAction, latestActivity, latestComment] = await Promise.all([
      env.DB.prepare(
        'SELECT MAX(created_at) as latest FROM project_updates WHERE project_id = ?'
      ).bind(p.slug).first<{ latest: string | null }>(),
      env.DB.prepare(
        'SELECT MAX(completed_at) as latest FROM tasks WHERE project_id = ? AND completed_at IS NOT NULL'
      ).bind(p.slug).first<{ latest: string | null }>(),
      env.DB.prepare(
        "SELECT MAX(timestamp) as latest FROM activity_log WHERE related_id = ? AND related_type = 'project'"
      ).bind(p.slug).first<{ latest: string | null }>(),
      env.DB.prepare(
        'SELECT MAX(created_at) as latest FROM comments WHERE project_id = ?'
      ).bind(p.id).first<{ latest: string | null }>(),
    ]);

    const dates = [
      latestUpdate?.latest,
      latestAction?.latest,
      latestActivity?.latest,
      latestComment?.latest,
      p.updated_at,
    ].filter(Boolean) as string[];

    const lastUpdateDate = dates.length > 0
      ? dates.reduce((a, b) => (a > b ? a : b))
      : null;

    const daysSinceUpdate = lastUpdateDate
      ? Math.floor((now.getTime() - new Date(lastUpdateDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    let activityScore: number;
    if (daysSinceUpdate <= 7) activityScore = 30;
    else if (daysSinceUpdate <= 14) activityScore = 20;
    else if (daysSinceUpdate <= 30) activityScore = 10;
    else activityScore = 0;

    // ── 2. Task completion velocity (25 pts max) ──────────────
    // Count tasks completed on time vs overdue when completed
    const completedTasks = await env.DB.prepare(
      'SELECT due_date, completed_at FROM tasks WHERE project_id = ? AND completed = 1 AND completed_at IS NOT NULL'
    ).bind(p.slug).all<{ due_date: string | null; completed_at: string }>();

    let onTimeCount = 0;
    let totalCompletedWithDue = 0;
    for (const t of completedTasks.results) {
      if (t.due_date) {
        totalCompletedWithDue++;
        // Task was on time if completed_at <= due_date end of day
        if (t.completed_at <= t.due_date + 'T23:59:59') {
          onTimeCount++;
        }
      }
    }

    let velocityScore: number;
    if (totalCompletedWithDue === 0) {
      // No tasks with due dates completed — neutral score
      velocityScore = 15;
    } else {
      const onTimePct = onTimeCount / totalCompletedWithDue;
      if (onTimePct >= 0.8) velocityScore = 25;
      else if (onTimePct >= 0.6) velocityScore = 20;
      else if (onTimePct >= 0.4) velocityScore = 15;
      else velocityScore = 5;
    }

    // ── 3. Overdue tasks (25 pts max, penalty) ────────────────
    const nowIso = now.toISOString().split('T')[0];
    const overdueResult = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND completed = 0 AND due_date IS NOT NULL AND due_date < ?'
    ).bind(p.slug, nowIso).first<{ c: number }>();

    const overdueCount = overdueResult?.c ?? 0;
    let overdueScore: number;
    if (overdueCount === 0) overdueScore = 25;
    else if (overdueCount === 1) overdueScore = 15;
    else if (overdueCount <= 3) overdueScore = 5;
    else overdueScore = 0;

    // ── 4. Milestone progress (20 pts max) ────────────────────
    const nextMilestone = await env.DB.prepare(
      "SELECT target_date, status FROM milestones WHERE (project_id = ? OR project_id = ?) AND status IN ('pending', 'in_progress') AND target_date IS NOT NULL ORDER BY target_date ASC LIMIT 1"
    ).bind(p.slug, p.id).first<{ target_date: string; status: string }>();

    let milestoneScore: number;
    if (!nextMilestone) {
      // No milestones — neutral
      milestoneScore = 10;
    } else {
      const msDate = new Date(nextMilestone.target_date);
      const daysUntil = Math.floor((msDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil > 7) milestoneScore = 20;       // On track
      else if (daysUntil >= 0) milestoneScore = 15;  // Approaching deadline
      else milestoneScore = 5;                        // Overdue
    }

    // ── Total score and status ────────────────────────────────
    const score = activityScore + velocityScore + overdueScore + milestoneScore;

    let status: 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical';
    if (score >= 80) status = 'Healthy';
    else if (score >= 60) status = 'Needs Attention';
    else if (score >= 40) status = 'At Risk';
    else status = 'Critical';

    // Pending tasks count for display
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND completed = 0'
    ).bind(p.slug).first<{ c: number }>();

    healthData.push({
      slug: p.slug,
      title: p.title,
      stage: p.stage,
      score,
      status,
      factors: {
        activity: activityScore,
        velocity: velocityScore,
        overdue: overdueScore,
        milestones: milestoneScore,
      },
      last_activity: lastUpdateDate ? lastUpdateDate.split('T')[0] : null,
      overdue_count: overdueCount,
      days_since_update: daysSinceUpdate === 999 ? null : daysSinceUpdate,
      pending_actions: pendingCount?.c ?? 0,
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
export async function handleUpdateProject(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Allowlisted fields that can be updated
  const allowed = ['title', 'status', 'description', 'category', 'stage', 'pi', 'slug', 'pi_context', 'strategic_context'];
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  // Fields that must never be set to null
  const requiredFields = new Set(['status', 'stage', 'category']);

  for (const [key, val] of Object.entries(body)) {
    if (allowed.includes(key)) {
      // Don't allow null on required fields — skip silently
      if (requiredFields.has(key) && (val === null || val === undefined || val === '')) {
        continue;
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
      (body.status as string) || 'Active',
      (body.description as string) || '',
      (body.category as string) || 'lab',
      (body.stage as string) || 'Idea',
      (body.pi as string) || 'nick',
      slug,
    ).run();
  }

  await logActivity(env, 'project_update', `Updated project fields: ${Object.keys(body).join(', ')}`, user.email, id, 'project');

  const updated = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/projects/:id/comments — add comment
export async function handleAddComment(
  projectId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { content?: string };

  if (!body.content || body.content.trim().length === 0) {
    return error('Comment content is required', 400);
  }

  // Verify project exists
  const project = await env.DB.prepare('SELECT id, title FROM projects WHERE id = ?').bind(projectId).first<{ id: string; title: string }>();
  if (!project) {
    return error('Project not found', 404);
  }

  // Look up author by email → team member
  const member = await env.DB.prepare('SELECT id FROM team_members WHERE slug = ?')
    .bind(actorSlug(user.email))
    .first<{ id: string }>();

  const commentId = generateId();
  await env.DB.prepare(
    'INSERT INTO comments (id, project_id, author_id, content) VALUES (?, ?, ?, ?)'
  ).bind(commentId, projectId, member?.id ?? null, body.content.trim()).run();

  await logActivity(env, 'comment', `Commented on "${project.title}"`, user.email, projectId, 'project');

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

        await env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          generateId(),
          slug,
          'mention',
          'comment',
          commentId,
          `${user.name || user.email} mentioned you in a comment`,
          body.content.trim().slice(0, 200),
          `/projects/${projectId}`
        ).run();
      }
    }
  } catch (e) {
    // Notification creation should not break the main comment operation
    console.error('Failed to create mention notifications for comment:', e);
  }

  // Check for @claude mention → create AI request + placeholder comment
  try {
    await handleClaudeMention(body.content, 'project_comment', commentId, projectId, user, env);
  } catch (e) {
    console.error('Failed to create AI request for @claude mention:', e);
  }

  return json({ data: { id: commentId, project_id: projectId, content: body.content.trim(), author: user.email } }, 201);
}

// POST /api/projects/:slug/updates — post project update
export async function handlePostProjectUpdate(slug: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; update_type?: string };
  if (!body.content) return error('content required', 400);

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO project_updates (id, project_id, author, content, update_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, slug, user.email, body.content, body.update_type ?? 'progress').run();

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
