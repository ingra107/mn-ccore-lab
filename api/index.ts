import type { Env, PublicationRow, TeamMemberRow, CollaborationGraph, GraphNode, GraphEdge, Stats } from './types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function error(message: string, status = 500): Response {
  return json({ error: message }, status);
}

// Extract authenticated user from Cloudflare Access JWT
// The JWT is in the Cf-Access-Jwt-Assertion header, set by Cloudflare Access
interface AuthUser {
  email: string
  name?: string
}

function getAuthUser(request: Request): AuthUser | null {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;

  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.email) return null;
    return {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
    };
  } catch {
    return null;
  }
}

// GET /api/auth/me — return current user or 401
function handleAuthMe(request: Request): Response {
  const user = getAuthUser(request);
  if (!user) {
    return json({ authenticated: false }, 200);
  }
  return json({ authenticated: true, ...user });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Auth endpoint — returns current user from Cloudflare Access JWT
      if (url.pathname === '/api/auth/me') {
        return handleAuthMe(request);
      }

      // Read endpoints (GET only)
      if (request.method === 'GET') {
        // Digest endpoints (must come before parameterized catch-alls)
        if (url.pathname === '/api/digest/dates') {
          return await handleDigestDates(env);
        }
        if (url.pathname === '/api/digest') {
          return await handleDigest(url, env);
        }

        // Parameterized GET routes
        const commentsGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/comments$/);
        if (commentsGet) {
          return await handleGetComments(commentsGet[1], env);
        }

        const meetingGet = url.pathname.match(/^\/api\/meetings\/([^/]+)$/);
        if (meetingGet) {
          return await handleGetMeeting(meetingGet[1], env);
        }

        const agendaGet = url.pathname.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
        if (agendaGet) {
          return await handleGetAgendaItems(agendaGet[1], env);
        }

        const projectUpdatesGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/updates$/);
        if (projectUpdatesGet) {
          return await handleGetProjectUpdates(projectUpdatesGet[1], env);
        }

        switch (url.pathname) {
          case '/api/publications':
            return await handlePublications(url, env);
          case '/api/projects':
            return await handleProjects(url, env);
          case '/api/team':
            return await handleTeam(env);
          case '/api/grants':
            return await handleGrants(env);
          case '/api/graph/collaboration':
            return await handleCollaborationGraph(env);
          case '/api/stats':
            return await handleStats(env);
          case '/api/activity':
            return await handleActivity(url, env);
          case '/api/meetings':
            return await handleMeetings(env);
          case '/api/action-items':
            return await handleActionItems(url, env);
          case '/api/updates/recent':
            return await handleRecentUpdates(url, env);
          case '/api/projects/health':
            return await handleProjectHealth(env);
        }
      }

      // Write endpoints (POST/PUT)
      // Auth is optional — when Cloudflare Access is configured, JWT provides identity.
      // When Access is not configured, writes are open (public site mode).
      if (request.method === 'POST' || request.method === 'PUT') {
        const user = getAuthUser(request) || { email: 'anonymous', name: 'Team Member' };

        const path = url.pathname;

        // POST /api/projects/:id — update project fields
        const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
        if (request.method === 'POST' && projectMatch) {
          return await handleUpdateProject(projectMatch[1], request, user, env);
        }

        // POST /api/projects/:id/comments — add comment
        const commentMatch = path.match(/^\/api\/projects\/([^/]+)\/comments$/);
        if (request.method === 'POST' && commentMatch) {
          return await handleAddComment(commentMatch[1], request, user, env);
        }

        // PUT /api/team/:slug — team member updates own profile
        const teamMatch = path.match(/^\/api\/team\/([^/]+)$/);
        if (request.method === 'PUT' && teamMatch) {
          return await handleUpdateTeamMember(teamMatch[1], request, user, env);
        }

        // POST /api/action-items/:id/toggle — toggle action item completion
        const toggleMatch = path.match(/^\/api\/action-items\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && toggleMatch) {
          return await handleToggleActionItem(toggleMatch[1], user, env);
        }

        // POST /api/action-items — create new action item
        if (request.method === 'POST' && path === '/api/action-items') {
          return await handleCreateActionItem(request, user, env);
        }

        // POST /api/meetings/:id/agenda — add agenda item
        const agendaMatch = path.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
        if (request.method === 'POST' && agendaMatch) {
          return await handleAddAgendaItem(agendaMatch[1], request, user, env);
        }

        // POST /api/projects/:slug/updates — post project update
        const updateMatch = path.match(/^\/api\/projects\/([^/]+)\/updates$/);
        if (request.method === 'POST' && updateMatch) {
          return await handlePostProjectUpdate(updateMatch[1], request, user, env);
        }

        // POST /api/meetings — create meeting
        if (request.method === 'POST' && path === '/api/meetings') {
          return await handleCreateMeeting(request, user, env);
        }

        // POST /api/digest — create/upsert digest paper
        if (request.method === 'POST' && path === '/api/digest') {
          return await handleCreateDigestPaper(request, env);
        }

        // POST /api/digest/:id/status — update paper status
        const digestStatusMatch = path.match(/^\/api\/digest\/([^/]+)\/status$/);
        if (request.method === 'POST' && digestStatusMatch) {
          return await handleUpdateDigestStatus(digestStatusMatch[1], request, user, env);
        }

        return error('Not found', 404);
      }

      if (request.method !== 'GET') {
        return error('Method not allowed', 405);
      }

      // No matching route
      return error('Not found', 404);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Internal server error';
      return error(message, 500);
    }
  },
};

// GET /api/publications?year=&status=&topic=
async function handlePublications(url: URL, env: Env): Promise<Response> {
  const year = url.searchParams.get('year');
  const status = url.searchParams.get('status');
  const topic = url.searchParams.get('topic');

  let query = 'SELECT * FROM publications WHERE 1=1';
  const params: (string | number)[] = [];

  if (year) {
    query += ' AND year = ?';
    params.push(parseInt(year, 10));
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (topic) {
    // topics is stored as JSON array, use LIKE for simple matching
    query += ' AND topics LIKE ?';
    params.push(`%"${topic}"%`);
  }

  query += ' ORDER BY year DESC, title ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects?status=&category=
async function handleProjects(url: URL, env: Env): Promise<Response> {
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

// GET /api/team
async function handleTeam(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM team_members ORDER BY member_type, name'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/grants
async function handleGrants(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM grants ORDER BY mechanism, title'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/graph/collaboration
// Builds a co-authorship network from publications.
// Nodes = team members who appear in author_slugs.
// Edges = co-authorship pairs weighted by number of shared publications.
async function handleCollaborationGraph(env: Env): Promise<Response> {
  const pubs = await env.DB.prepare(
    'SELECT id, title, author_slugs FROM publications WHERE author_slugs IS NOT NULL'
  ).all<Pick<PublicationRow, 'id' | 'title' | 'author_slugs'>>();

  const members = await env.DB.prepare(
    'SELECT id, name, slug FROM team_members WHERE slug IS NOT NULL'
  ).all<Pick<TeamMemberRow, 'id' | 'name' | 'slug'>>();

  // Build slug -> member lookup
  const memberBySlug = new Map<string, { id: string; name: string; slug: string }>();
  for (const m of members.results) {
    if (m.slug) memberBySlug.set(m.slug, m as { id: string; name: string; slug: string });
  }

  // Count publications per author and build co-authorship edges
  const pubCounts = new Map<string, number>();
  const edgeMap = new Map<string, { weight: number; sharedPublications: string[] }>();

  for (const pub of pubs.results) {
    if (!pub.author_slugs) continue;
    let slugs: string[];
    try {
      slugs = JSON.parse(pub.author_slugs);
    } catch {
      continue;
    }

    // Count per-author publications
    for (const slug of slugs) {
      pubCounts.set(slug, (pubCounts.get(slug) || 0) + 1);
    }

    // Build co-authorship pairs
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        const key = [slugs[i], slugs[j]].sort().join('::');
        const existing = edgeMap.get(key);
        if (existing) {
          existing.weight++;
          existing.sharedPublications.push(pub.id);
        } else {
          edgeMap.set(key, { weight: 1, sharedPublications: [pub.id] });
        }
      }
    }
  }

  // Build nodes (only authors that appear in at least one publication)
  const nodes: GraphNode[] = [];
  for (const [slug, count] of pubCounts) {
    const member = memberBySlug.get(slug);
    nodes.push({
      id: slug,
      name: member?.name || slug,
      slug,
      publicationCount: count,
    });
  }

  // Build edges
  const edges: GraphEdge[] = [];
  for (const [key, data] of edgeMap) {
    const [source, target] = key.split('::');
    edges.push({ source, target, ...data });
  }

  const graph: CollaborationGraph = { nodes, edges };
  return json({ data: graph });
}

// GET /api/stats
async function handleStats(env: Env): Promise<Response> {
  const [pubCount, teamCount, grantCount, projectCount, activeCount, featuredCount] =
    await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM publications').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM team_members').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM grants').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM projects').first<{ c: number }>(),
      env.DB.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'Active'").first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM publications WHERE featured = 1').first<{ c: number }>(),
    ]);

  const stats: Stats = {
    publicationCount: pubCount?.c ?? 0,
    teamSize: teamCount?.c ?? 0,
    grantCount: grantCount?.c ?? 0,
    projectCount: projectCount?.c ?? 0,
    activeProjectCount: activeCount?.c ?? 0,
    featuredPublicationCount: featuredCount?.c ?? 0,
  };

  return json({ data: stats });
}

// GET /api/activity?limit=20
async function handleActivity(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const result = await env.DB.prepare(
    'SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?'
  ).bind(limit).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/:id/comments
async function handleGetComments(projectId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT c.id, c.content, c.created_at, t.name as author_name, t.slug as author_slug
     FROM comments c
     LEFT JOIN team_members t ON c.author_id = t.id
     WHERE c.project_id = ?
     ORDER BY c.created_at DESC`
  ).bind(projectId).all();
  return json({ data: result.results, count: result.results.length });
}

// ── Write endpoints ─────────────────────────────────────────

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function logActivity(
  env: Env,
  type: string,
  description: string,
  actor: string,
  relatedId?: string,
  relatedType?: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO activity_log (id, type, description, actor, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), type, description, actor, relatedId ?? null, relatedType ?? null).run();
}

// POST /api/projects/:id — update project fields
async function handleUpdateProject(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Allowlisted fields that can be updated
  const allowed = ['title', 'status', 'description', 'category', 'stage', 'pi', 'slug'];
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
async function handleAddComment(
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

  return json({ data: { id: commentId, project_id: projectId, content: body.content.trim(), author: user.email } }, 201);
}

// PUT /api/team/:slug — team member updates own profile
async function handleUpdateTeamMember(
  slug: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Allowlisted fields that team members can update about themselves
  const allowed = ['bio', 'photo_url', 'scholar_id', 'title', 'department'];
  const updates: string[] = [];
  const values: (string | null)[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val as string | null);
    }
  }

  if (updates.length === 0) {
    return error('No valid fields to update', 400);
  }

  values.push(slug);

  const result = await env.DB.prepare(
    `UPDATE team_members SET ${updates.join(', ')} WHERE slug = ?`
  ).bind(...values).run();

  if (result.meta.changes === 0) {
    return error('Team member not found', 404);
  }

  await logActivity(env, 'team_update', `Updated profile for ${slug}`, user.email, slug, 'team_member');

  const updated = await env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first();
  return json({ data: updated });
}

// ── Meeting & Team Portal Endpoints ─────────────────────────

// GET /api/meetings — list all meetings
async function handleMeetings(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM meetings ORDER BY date DESC'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/meetings/:id — single meeting with action items + agenda items
async function handleGetMeeting(id: string, env: Env): Promise<Response> {
  const meeting = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  if (!meeting) return error('Meeting not found', 404);

  const [actionItems, agendaItems] = await Promise.all([
    env.DB.prepare('SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at').bind(id).all(),
    env.DB.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at').bind(id).all(),
  ]);

  return json({
    data: {
      ...meeting,
      action_items: actionItems.results,
      agenda_items: agendaItems.results,
    },
  });
}

// GET /api/meetings/:id/agenda — agenda items for a meeting
async function handleGetAgendaItems(meetingId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY sort_order, created_at'
  ).bind(meetingId).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/action-items?assignee=&completed=&meeting_id=
async function handleActionItems(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee');
  const completed = url.searchParams.get('completed');
  const meetingId = url.searchParams.get('meeting_id');

  let query = 'SELECT ai.*, m.title as meeting_title, m.date as meeting_date FROM action_items ai LEFT JOIN meetings m ON ai.meeting_id = m.id WHERE 1=1';
  const params: (string | number)[] = [];

  if (assignee) { query += ' AND ai.assignee = ?'; params.push(assignee); }
  if (completed !== null && completed !== undefined) { query += ' AND ai.completed = ?'; params.push(completed === 'true' ? 1 : 0); }
  if (meetingId) { query += ' AND ai.meeting_id = ?'; params.push(meetingId); }

  query += ' ORDER BY ai.completed ASC, ai.due_date ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/:slug/updates
async function handleGetProjectUpdates(slug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM project_updates WHERE project_id = ? ORDER BY created_at DESC'
  ).bind(slug).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/projects/health — project health metrics
async function handleProjectHealth(env: Env): Promise<Response> {
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
        'SELECT MAX(completed_at) as latest FROM action_items WHERE project_id = ? AND completed_at IS NOT NULL'
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
      'SELECT COUNT(*) as c FROM action_items WHERE project_id = ? AND completed = 0'
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
async function handleRecentUpdates(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const result = await env.DB.prepare(
    'SELECT * FROM project_updates ORDER BY created_at DESC LIMIT ?'
  ).bind(limit).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/action-items/:id/toggle — toggle completion
async function handleToggleActionItem(id: string, user: AuthUser, env: Env): Promise<Response> {
  const item = await env.DB.prepare('SELECT * FROM action_items WHERE id = ?').bind(id).first<{ completed: number; description: string }>();
  if (!item) return error('Action item not found', 404);

  const newCompleted = item.completed ? 0 : 1;
  await env.DB.prepare(
    'UPDATE action_items SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?'
  ).bind(newCompleted, newCompleted ? new Date().toISOString() : null, newCompleted ? user.email : null, id).run();

  await logActivity(env, 'action_item', `${newCompleted ? 'Completed' : 'Reopened'}: "${item.description}"`, user.email, id, 'action_item');

  const updated = await env.DB.prepare('SELECT * FROM action_items WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/action-items — create new action item
async function handleCreateActionItem(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { meeting_id?: string; project_id?: string; description: string; assignee: string; due_date?: string };
  if (!body.description || !body.assignee) return error('description and assignee required', 400);

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO action_items (id, meeting_id, project_id, description, assignee, due_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.meeting_id ?? null, body.project_id ?? null, body.description, body.assignee, body.due_date ?? null).run();

  await logActivity(env, 'action_item', `Created action item: "${body.description}" → ${body.assignee}`, user.email, id, 'action_item');

  const created = await env.DB.prepare('SELECT * FROM action_items WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/meetings/:id/agenda — add agenda item
async function handleAddAgendaItem(meetingId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; project_id?: string; type?: string; document_url?: string };
  if (!body.content) return error('content required', 400);

  const id = generateId();
  const maxOrder = await env.DB.prepare('SELECT MAX(sort_order) as m FROM agenda_items WHERE meeting_id = ?').bind(meetingId).first<{ m: number | null }>();

  await env.DB.prepare(
    'INSERT INTO agenda_items (id, meeting_id, content, added_by, project_id, type, document_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, meetingId, body.content, user.email, body.project_id ?? null, body.type ?? 'discussion', body.document_url ?? null, (maxOrder?.m ?? 0) + 1).run();

  await logActivity(env, 'agenda', `Added agenda item: "${body.content}"`, user.email, meetingId, 'meeting');

  const created = await env.DB.prepare('SELECT * FROM agenda_items WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/projects/:slug/updates — post project update
async function handlePostProjectUpdate(slug: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; update_type?: string };
  if (!body.content) return error('content required', 400);

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO project_updates (id, project_id, author, content, update_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, slug, user.email, body.content, body.update_type ?? 'progress').run();

  await logActivity(env, 'project_update', `Posted update on ${slug}: "${body.content.slice(0, 100)}"`, user.email, slug, 'project');

  const created = await env.DB.prepare('SELECT * FROM project_updates WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── Research Digest Endpoints ─────────────────────────────

// GET /api/digest?date=&status=&topic=&limit=
async function handleDigest(url: URL, env: Env): Promise<Response> {
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const topic = url.searchParams.get('topic');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 300);

  let query = 'SELECT * FROM research_digest WHERE 1=1';
  const params: (string | number)[] = [];

  if (date) {
    query += ' AND digest_date = ?';
    params.push(date);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (topic) {
    query += ' AND topics LIKE ?';
    params.push(`%"${topic}"%`);
  }

  query += ' ORDER BY relevance_score DESC, pub_date DESC LIMIT ?';
  params.push(limit);

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/digest/dates — list available digest dates with paper counts
async function handleDigestDates(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT digest_date as date, COUNT(*) as count
     FROM research_digest
     WHERE digest_date IS NOT NULL
     GROUP BY digest_date
     ORDER BY digest_date DESC`
  ).all();
  return json({ data: result.results });
}

// POST /api/digest/:id/status — update paper status (save/dismiss)
async function handleUpdateDigestStatus(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { status?: string };
  const validStatuses = ['new', 'saved', 'dismissed'];

  if (!body.status || !validStatuses.includes(body.status)) {
    return error('Invalid status. Must be: new, saved, or dismissed', 400);
  }

  const result = await env.DB.prepare(
    'UPDATE research_digest SET status = ?, saved_by = ? WHERE id = ?'
  ).bind(body.status, body.status === 'saved' ? user.email : null, id).run();

  if (result.meta.changes === 0) {
    return error('Paper not found', 404);
  }

  await logActivity(env, 'digest', `${body.status === 'saved' ? 'Saved' : body.status === 'dismissed' ? 'Dismissed' : 'Reset'} digest paper`, user.email, id, 'digest');

  const updated = await env.DB.prepare('SELECT * FROM research_digest WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/digest — create or upsert a digest paper
async function handleCreateDigestPaper(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  if (!body.id || !body.title) return error('id and title required', 400);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO research_digest (id, title, authors, journal, pub_date, abstract, pmid, doi, relevance_score, relevance_reason, topics, status, digest_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.id as string,
    body.title as string,
    (body.authors as string) ?? null,
    (body.journal as string) ?? null,
    (body.pub_date as string) ?? null,
    (body.abstract as string) ?? null,
    (body.pmid as string) ?? null,
    (body.doi as string) ?? null,
    (body.relevance_score as number) ?? 0,
    (body.relevance_reason as string) ?? null,
    (body.topics as string) ?? null,
    (body.status as string) ?? 'new',
    (body.digest_date as string) ?? null,
  ).run();

  return json({ data: { id: body.id } }, 201);
}

// POST /api/meetings — create meeting
async function handleCreateMeeting(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { date: string; title: string; type?: string; attendees?: string[] };
  if (!body.date || !body.title) return error('date and title required', 400);

  const id = `mtg-${body.date}-${generateId().slice(0, 8)}`;
  await env.DB.prepare(
    'INSERT INTO meetings (id, date, title, type, attendees, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.date, body.title, body.type ?? 'biweekly', body.attendees ? JSON.stringify(body.attendees) : null, 'upcoming').run();

  await logActivity(env, 'meeting', `Created meeting: "${body.title}" on ${body.date}`, user.email, id, 'meeting');

  const created = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
