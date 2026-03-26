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
        }
      }

      // Write endpoints (POST/PUT, require auth)
      if (request.method === 'POST' || request.method === 'PUT') {
        const user = getAuthUser(request);
        if (!user) {
          return error('Authentication required', 401);
        }

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

  const result = await env.DB.prepare(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  if (result.meta.changes === 0) {
    return error('Project not found', 404);
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
