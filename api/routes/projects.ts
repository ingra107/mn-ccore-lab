import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, parseMentions } from '../helpers';

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
    `SELECT c.id, c.content, c.created_at, t.name as author_name, t.slug as author_slug
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

// GET /api/projects/health — project health metrics
export async function handleProjectHealth(env: Env): Promise<Response> {
  // Get all active projects
  const projects = await env.DB.prepare(
    "SELECT id, slug, title, stage, status, updated_at FROM projects WHERE status IN ('Active', 'In Review', 'In Preparation')"
  ).all<{ id: string; slug: string; title: string; stage: string; status: string; updated_at: string }>();

  const now = new Date();
  const healthData = [];

  for (const p of projects.results) {
    // Find the most recent update timestamp across multiple tables
    const [latestUpdate, latestAction, latestActivity] = await Promise.all([
      env.DB.prepare(
        'SELECT MAX(created_at) as latest FROM project_updates WHERE project_id = ?'
      ).bind(p.slug).first<{ latest: string | null }>(),
      env.DB.prepare(
        'SELECT MAX(completed_at) as latest FROM tasks WHERE project_id = ? AND completed_at IS NOT NULL'
      ).bind(p.slug).first<{ latest: string | null }>(),
      env.DB.prepare(
        "SELECT MAX(timestamp) as latest FROM activity_log WHERE related_id = ? AND related_type = 'project'"
      ).bind(p.slug).first<{ latest: string | null }>(),
    ]);

    // Also consider the project's own updated_at
    const dates = [
      latestUpdate?.latest,
      latestAction?.latest,
      latestActivity?.latest,
      p.updated_at,
    ].filter(Boolean) as string[];

    const lastUpdateDate = dates.length > 0
      ? dates.reduce((a, b) => (a > b ? a : b))
      : null;

    const daysSinceUpdate = lastUpdateDate
      ? Math.floor((now.getTime() - new Date(lastUpdateDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Count pending action items for this project
    const pendingCount = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND completed = 0'
    ).bind(p.slug).first<{ c: number }>();

    // Count recent updates (last 30 days)
    const recentCount = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM project_updates WHERE project_id = ? AND created_at > datetime('now', '-30 days')"
    ).bind(p.slug).first<{ c: number }>();

    // Determine health
    const pending = pendingCount?.c ?? 0;
    let health: 'green' | 'yellow' | 'red';
    if (daysSinceUpdate <= 14 || (pending > 0 && daysSinceUpdate <= 30)) {
      health = 'green';
    } else if (daysSinceUpdate <= 30) {
      health = 'yellow';
    } else {
      health = 'red';
    }

    healthData.push({
      slug: p.slug,
      title: p.title,
      stage: p.stage,
      status: p.status,
      days_since_update: daysSinceUpdate === 999 ? null : daysSinceUpdate,
      health,
      pending_actions: pending,
      recent_updates: recentCount?.c ?? 0,
      last_update_date: lastUpdateDate ? lastUpdateDate.split('T')[0] : null,
    });
  }

  // Sort by health (red first, then yellow, then green)
  const healthOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 };
  healthData.sort((a, b) => healthOrder[a.health] - healthOrder[b.health]);

  const summary = {
    total: healthData.length,
    green: healthData.filter((h) => h.health === 'green').length,
    yellow: healthData.filter((h) => h.health === 'yellow').length,
    red: healthData.filter((h) => h.health === 'red').length,
    avg_days_since_update: healthData.length > 0
      ? Math.round(
          healthData
            .filter((h) => h.days_since_update !== null)
            .reduce((sum, h) => sum + (h.days_since_update ?? 0), 0) /
          Math.max(healthData.filter((h) => h.days_since_update !== null).length, 1)
        )
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

  for (const [key, val] of Object.entries(body)) {
    if (allowed.includes(key)) {
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
    .bind(user.email.split('@')[0].toLowerCase())
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
      const authorSlug = user.email.split('@')[0].toLowerCase();

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
      const authorSlug = user.email.split('@')[0].toLowerCase();

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
