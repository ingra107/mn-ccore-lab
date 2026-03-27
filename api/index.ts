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
          case '/api/tasks':
            return await handleTasks(url, env);
          case '/api/action-items':
            return await handleTasks(url, env);  // backward compat alias
          case '/api/updates/recent':
            return await handleRecentUpdates(url, env);
          case '/api/projects/health':
            return await handleProjectHealth(env);
          case '/api/grants/timeline':
            return await handleGrantsTimeline(env);
          case '/api/notifications':
            return await handleNotifications(url, request, env);
          case '/api/notifications/count':
            return await handleNotificationCount(url, request, env);
          case '/api/commitments':
            return await handleCommitments(url, env);
          case '/api/team/slugs':
            return await handleTeamSlugs(env);
          case '/api/ideas':
            return await handleIdeas(url, env);
          case '/api/calendar/events':
            return await handleCalendarEvents(url, env);
        }

        // GET /api/team/:slug/cv-data
        const cvDataGet = url.pathname.match(/^\/api\/team\/([^/]+)\/cv-data$/);
        if (cvDataGet) {
          return await handleCVData(cvDataGet[1], env);
        }

        // GET /api/tasks/:id/comments
        const taskCommentsGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
        if (taskCommentsGet) {
          return await handleGetTaskComments(taskCommentsGet[1], env);
        }

        // GET /api/tasks/:id/activity
        const taskActivityGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/activity$/);
        if (taskActivityGet) {
          return await handleGetTaskActivity(taskActivityGet[1], env);
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

        // POST /api/tasks/:id/status — change task status
        const taskStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/);
        if (request.method === 'POST' && taskStatusMatch) {
          return await handleUpdateTaskStatus(taskStatusMatch[1], request, user, env);
        }

        // POST /api/tasks/:id — update task fields
        const taskUpdateMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
        if (request.method === 'POST' && taskUpdateMatch) {
          return await handleUpdateTask(taskUpdateMatch[1], request, user, env);
        }

        // POST /api/tasks — create new task
        if (request.method === 'POST' && path === '/api/tasks') {
          return await handleCreateTask(request, user, env);
        }

        // POST /api/action-items/:id/toggle — backward compat alias
        const toggleMatch = path.match(/^\/api\/action-items\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && toggleMatch) {
          return await handleToggleTask(toggleMatch[1], user, env);
        }

        // POST /api/action-items — backward compat alias
        if (request.method === 'POST' && path === '/api/action-items') {
          return await handleCreateTask(request, user, env);
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

        // POST /api/commitments — create/upsert commitment
        if (request.method === 'POST' && path === '/api/commitments') {
          return await handleCreateCommitment(request, env);
        }

        // POST /api/notifications/:id/read — mark notification as read
        const notifReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
        if (request.method === 'POST' && notifReadMatch) {
          return await handleMarkNotificationRead(notifReadMatch[1], env);
        }

        // POST /api/notifications/read-all — mark all read
        if (request.method === 'POST' && path === '/api/notifications/read-all') {
          const body = await request.json() as Record<string, string>;
          return await handleMarkAllNotificationsRead(body.recipient || user.email.split('@')[0], env);
        }

        // POST /api/tasks/:id/comments — add task comment
        const taskCommentMatch = path.match(/^\/api\/tasks\/([^/]+)\/comments$/);
        if (request.method === 'POST' && taskCommentMatch) {
          return await handleAddTaskComment(taskCommentMatch[1], request, user, env);
        }

        // POST /api/ideas — create idea
        if (request.method === 'POST' && path === '/api/ideas') {
          return await handleCreateIdea(request, user, env);
        }

        // POST /api/ideas/:id — update idea
        const ideaUpdateMatch = path.match(/^\/api\/ideas\/([^/]+)$/);
        if (request.method === 'POST' && ideaUpdateMatch) {
          return await handleUpdateIdea(ideaUpdateMatch[1], request, user, env);
        }

        // POST /api/ideas/:id/vote — upvote idea
        const ideaVoteMatch = path.match(/^\/api\/ideas\/([^/]+)\/vote$/);
        if (request.method === 'POST' && ideaVoteMatch) {
          return await handleVoteIdea(ideaVoteMatch[1], env);
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

  // ── Scheduled: Morning Pulse Email ─────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.SENDGRID_API_KEY) {
      console.log('[Pulse] No SENDGRID_API_KEY configured — skipping email send');
      return;
    }

    console.log('[Pulse] Starting morning pulse email...');

    // Get all team members with emails
    const members = await env.DB.prepare(
      'SELECT slug, name, email FROM team_members WHERE slug IS NOT NULL'
    ).all<{ slug: string; name: string; email: string | null }>();

    if (!members.results?.length) {
      console.log('[Pulse] No team members found');
      return;
    }

    let sent = 0;
    for (const member of members.results) {
      const email = member.email || `${member.slug}@umn.edu`;
      const firstName = member.name.split(' ')[0];

      // Get their pending action items
      const actions = await env.DB.prepare(
        'SELECT title, description, due_date, priority, status FROM tasks WHERE assignee = ? AND completed = 0 ORDER BY due_date ASC'
      ).bind(member.slug).all<{ description: string; due_date: string | null }>();

      // Get unread notifications
      const notifCount = await env.DB.prepare(
        'SELECT COUNT(*) as c FROM notifications WHERE recipient_slug = ? AND read = 0'
      ).bind(member.slug).first<{ c: number }>();

      // Get recent team activity (last 24 hours)
      const recentUpdates = await env.DB.prepare(
        "SELECT author, content, project_id FROM project_updates WHERE created_at > datetime('now', '-1 day') AND author != ? ORDER BY created_at DESC LIMIT 5"
      ).bind(member.slug).all<{ author: string; content: string; project_id: string }>();

      // Only send if there's something to report
      const pendingItems = actions.results || [];
      const unread = notifCount?.c ?? 0;
      const updates = recentUpdates.results || [];

      if (pendingItems.length === 0 && unread === 0 && updates.length === 0) {
        continue; // Nothing to report for this person
      }

      // Build email body
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      let itemsHtml = '';

      if (pendingItems.length > 0) {
        itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Your Action Items</h3><ul style="padding-left:20px;">';
        for (const item of pendingItems) {
          const overdue = item.due_date && item.due_date < new Date().toISOString().slice(0, 10);
          const dueLabel = item.due_date
            ? `<span style="color:${overdue ? '#7a0019' : '#64748b'};font-size:12px;"> — ${overdue ? 'overdue' : 'due'} ${item.due_date}</span>`
            : '';
          itemsHtml += `<li style="margin-bottom:8px;font-size:14px;color:#0f1923;">${item.description.replace(/^\[Carried forward\]\s*/i, '')}${dueLabel}</li>`;
        }
        itemsHtml += '</ul>';
      }

      if (unread > 0) {
        itemsHtml += `<p style="font-size:14px;color:#0f1923;margin-top:16px;">You have <strong style="color:#c9a84c;">${unread}</strong> unread notification${unread > 1 ? 's' : ''} on the Hub.</p>`;
      }

      if (updates.length > 0) {
        itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Team Activity</h3><ul style="padding-left:20px;">';
        for (const u of updates) {
          itemsHtml += `<li style="margin-bottom:6px;font-size:13px;color:#2c3e50;">${u.author}: ${u.content.slice(0, 100)}${u.content.length > 100 ? '...' : ''}</li>`;
        }
        itemsHtml += '</ul>';
      }

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#faf8f3;">
  <div style="border-bottom:2px solid #c9a84c;padding-bottom:12px;margin-bottom:20px;">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#0f1923;margin:0;">Good morning, ${firstName}</h1>
    <p style="font-size:13px;color:#64748b;margin:4px 0 0;">${today}</p>
  </div>
  ${itemsHtml}
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e8eff5;">
    <a href="https://mn-ccore-lab.pages.dev/my-items" style="display:inline-block;padding:10px 20px;background:#c9a84c;color:#0f1923;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View All Items</a>
  </div>
  <p style="font-size:11px;color:#64748b;margin-top:24px;">MN-CCORE Lab Hub — <a href="https://mn-ccore-lab.pages.dev" style="color:#c9a84c;">mn-ccore-lab.pages.dev</a></p>
</body>
</html>`;

      // Send via SendGrid
      try {
        const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email, name: member.name }] }],
            from: { email: 'hub@mnccore.org', name: 'MN-CCORE Lab Hub' },
            subject: `${firstName}, you have ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} today`,
            content: [{ type: 'text/html', value: html }],
          }),
        });
        if (sgResp.ok || sgResp.status === 202) {
          sent++;
          console.log(`[Pulse] Sent to ${email}`);
        } else {
          console.log(`[Pulse] Failed for ${email}: ${sgResp.status}`);
        }
      } catch (e) {
        console.log(`[Pulse] Error sending to ${email}: ${e}`);
      }
    }

    console.log(`[Pulse] Done — sent ${sent} emails`);
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
    env.DB.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY created_at').bind(id).all(),
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

// GET /api/tasks?assignee=&status=&priority=&project=&meeting=&completed=&source=
async function handleTasks(url: URL, env: Env): Promise<Response> {
  const assignee = url.searchParams.get('assignee');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const project = url.searchParams.get('project');
  const meetingId = url.searchParams.get('meeting') || url.searchParams.get('meeting_id');
  const completed = url.searchParams.get('completed');
  const source = url.searchParams.get('source');

  let query = 'SELECT t.*, m.title as meeting_title, m.date as meeting_date FROM tasks t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE 1=1';
  const params: (string | number)[] = [];

  if (assignee) { query += ' AND t.assignee = ?'; params.push(assignee); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (project) { query += ' AND t.project_id = ?'; params.push(project); }
  if (meetingId) { query += ' AND t.meeting_id = ?'; params.push(meetingId); }
  if (source) { query += ' AND t.source = ?'; params.push(source); }
  if (completed !== null && completed !== undefined) {
    query += ' AND t.completed = ?';
    params.push(completed === 'true' ? 1 : 0);
  }

  query += ' ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC';

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
async function handleRecentUpdates(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const result = await env.DB.prepare(
    'SELECT * FROM project_updates ORDER BY created_at DESC LIMIT ?'
  ).bind(limit).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/tasks/:id/status — change task status (todo/in_progress/done/blocked)
async function handleUpdateTaskStatus(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { status: string };
  if (!body.status || !['todo', 'in_progress', 'done', 'blocked'].includes(body.status)) {
    return error('status must be one of: todo, in_progress, done, blocked', 400);
  }

  const item = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ title: string; description: string; assignee: string; assigned_by: string | null }>();
  if (!item) return error('Task not found', 404);

  const completed = body.status === 'done' ? 1 : 0;
  const completedAt = completed ? new Date().toISOString() : null;
  const completedBy = completed ? user.email : null;

  await env.DB.prepare(
    'UPDATE tasks SET status = ?, completed = ?, completed_at = ?, completed_by = ? WHERE id = ?'
  ).bind(body.status, completed, completedAt, completedBy, id).run();

  await logActivity(env, 'task', `${body.status === 'done' ? 'Completed' : `Status → ${body.status}`}: "${item.title || item.description}"`, user.email, id, 'task');

  // Notify assigner when task is completed
  if (completed && item.assigned_by) {
    try {
      const assignerSlug = item.assigned_by.split('@')[0].toLowerCase();
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), assignerSlug, 'update', 'task', id, `${user.name || user.email} completed a task`, (item.title || item.description).slice(0, 200), '/tasks').run();
    } catch (e) { console.error('Failed to create completion notification:', e); }
  }

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/action-items/:id/toggle — backward compat (toggles done/todo)
async function handleToggleTask(id: string, user: AuthUser, env: Env): Promise<Response> {
  const item = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<{ completed: number; title: string; description: string }>();
  if (!item) return error('Task not found', 404);

  const newCompleted = item.completed ? 0 : 1;
  const newStatus = newCompleted ? 'done' : 'todo';
  await env.DB.prepare(
    'UPDATE tasks SET status = ?, completed = ?, completed_at = ?, completed_by = ? WHERE id = ?'
  ).bind(newStatus, newCompleted, newCompleted ? new Date().toISOString() : null, newCompleted ? user.email : null, id).run();

  await logActivity(env, 'task', `${newCompleted ? 'Completed' : 'Reopened'}: "${item.title || item.description}"`, user.email, id, 'task');

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/tasks/:id — update task fields
async function handleUpdateTask(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'assignee', 'assigned_by', 'due_date', 'priority', 'status', 'project_id', 'meeting_id'];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  // Handle status -> completed sync
  if ('status' in body) {
    const isDone = body.status === 'done';
    updates.push('completed = ?');
    params.push(isDone ? 1 : 0);
    if (isDone) {
      updates.push('completed_at = ?', 'completed_by = ?');
      params.push(new Date().toISOString(), user.email);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  params.push(id);
  await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!updated) return error('Task not found', 404);
  return json({ data: updated });
}

// POST /api/tasks — create new task
async function handleCreateTask(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    title?: string; description: string; assignee: string;
    meeting_id?: string; project_id?: string; due_date?: string;
    priority?: string; source?: string;
  };
  if (!body.description || !body.assignee) return error('description and assignee required', 400);

  const id = generateId();
  const title = body.title || body.description;
  const source = body.source || (body.meeting_id ? 'meeting' : 'manual');
  const priority = body.priority || 'medium';

  await env.DB.prepare(
    'INSERT INTO tasks (id, title, description, assignee, assigned_by, meeting_id, project_id, due_date, priority, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, body.description, body.assignee, user.email, body.meeting_id ?? null, body.project_id ?? null, body.due_date ?? null, priority, source).run();

  await logActivity(env, 'task', `Created task: "${title}" → ${body.assignee}`, user.email, id, 'task');

  // Notify assignee if it's someone else
  try {
    const assignee = body.assignee;
    const authorSlug = user.email.split('@')[0].toLowerCase();
    if (assignee && assignee !== authorSlug) {
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        generateId(),
        assignee,
        'assignment',
        'task',
        id,
        `${user.name || user.email} assigned you a task`,
        title.slice(0, 200),
        '/tasks'
      ).run();
    }
  } catch (e) {
    console.error('Failed to create assignment notification:', e);
  }

  const created = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
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

// ── Grants Timeline ─────────────────────────────────────────

async function handleGrantsTimeline(env: Env): Promise<Response> {
  const grants = await env.DB.prepare(
    'SELECT * FROM grants ORDER BY proposed ASC, start_date ASC'
  ).all();

  // Fetch milestones for each grant
  const milestones = await env.DB.prepare(
    'SELECT * FROM milestones WHERE grant_id IS NOT NULL ORDER BY target_date ASC'
  ).all();

  // Group milestones by grant_id
  const milestonesByGrant: Record<string, unknown[]> = {};
  for (const m of milestones.results || []) {
    const gid = (m as Record<string, unknown>).grant_id as string;
    if (!milestonesByGrant[gid]) milestonesByGrant[gid] = [];
    milestonesByGrant[gid].push(m);
  }

  const data = (grants.results || []).map((g: Record<string, unknown>) => ({
    ...g,
    milestones: milestonesByGrant[g.id as string] || [],
  }));

  return json({ data });
}

// ── Notifications ───────────────────────────────────────────

async function handleNotifications(url: URL, request: Request, env: Env): Promise<Response> {
  const recipient = url.searchParams.get('recipient') || '';
  const unread = url.searchParams.get('unread');

  let query = 'SELECT * FROM notifications WHERE recipient_slug = ?';
  const params: string[] = [recipient];

  if (unread === '1') {
    query += ' AND read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT 50';

  try {
    const result = await env.DB.prepare(query).bind(...params).all();
    return json({ data: result.results || [] });
  } catch {
    return json({ data: [] });
  }
}

async function handleNotificationCount(url: URL, request: Request, env: Env): Promise<Response> {
  const recipient = url.searchParams.get('recipient') || '';
  try {
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE recipient_slug = ? AND read = 0'
    ).bind(recipient).first();
    return json({ count: (result as Record<string, unknown>)?.count ?? 0 });
  } catch {
    return json({ count: 0 });
  }
}

async function handleMarkNotificationRead(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(id).run();
  return json({ success: true });
}

async function handleMarkAllNotificationsRead(recipient: string, env: Env): Promise<Response> {
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE recipient_slug = ? AND read = 0').bind(recipient).run();
  return json({ success: true });
}

// ── Team Slugs (for @mention autocomplete) ──────────────────

async function handleTeamSlugs(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT slug, name FROM team_members WHERE slug IS NOT NULL ORDER BY name').all();
  return json({ data: result.results || [] });
}

// ── CV Data ─────────────────────────────────────────────────

async function handleCVData(slug: string, env: Env): Promise<Response> {
  const [member, pubs, grants, mentees] = await Promise.all([
    env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first(),
    env.DB.prepare("SELECT * FROM publications WHERE author_slugs LIKE ? ORDER BY year DESC")
      .bind(`%"${slug}"%`).all(),
    env.DB.prepare('SELECT * FROM grants WHERE pi = ? ORDER BY proposed ASC, mechanism ASC').bind(slug).all(),
    env.DB.prepare("SELECT * FROM team_members WHERE bio LIKE ?").bind(`%mentor%${slug}%`).all(),
  ]);

  if (!member) return error('Team member not found', 404);

  return json({
    data: {
      member,
      publications: pubs.results || [],
      grants: grants.results || [],
      mentees: mentees.results || [],
    },
  });
}

// ── @Mention parsing utility ────────────────────────────────

async function handleCreateCommitment(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  if (!body.id || !body.commitment || !body.to_whom) {
    return error('id, commitment, and to_whom required', 400);
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO commitments (id, commitment, to_whom, status, due_date, source, project, task_id, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.id as string,
    body.commitment as string,
    body.to_whom as string,
    (body.status as string) ?? 'open',
    (body.due_date as string) ?? null,
    (body.source as string) ?? null,
    (body.project as string) ?? null,
    (body.task_id as string) ?? null,
    (body.created_at as string) ?? new Date().toISOString(),
    (body.completed_at as string) ?? null,
  ).run();

  return json({ success: true }, 201);
}

function parseMentions(text: string): string[] {
  const regex = /@([a-z][a-z0-9_-]*)/g;
  return [...new Set(Array.from(text.matchAll(regex), m => m[1]))];
}

// ── Commitments ─────────────────────────────────────────────

async function handleCommitments(url: URL, env: Env): Promise<Response> {
  const toWhom = url.searchParams.get('to');
  const status = url.searchParams.get('status');
  const slug = url.searchParams.get('slug');

  let query = 'SELECT * FROM commitments WHERE 1=1';
  const params: string[] = [];

  if (toWhom) {
    // Match partial — "Emma Bromley" or just "bromley"
    query += ' AND (LOWER(to_whom) LIKE ? OR LOWER(to_whom) LIKE ?)';
    params.push(`%${toWhom.toLowerCase()}%`, `%${toWhom.toLowerCase()}%`);
  }
  if (slug) {
    // Match by team member slug — look in to_whom for the name
    // Also try matching the slug directly against known team patterns
    query += ' AND (LOWER(to_whom) LIKE ? OR LOWER(to_whom) LIKE ?)';
    params.push(`%${slug.toLowerCase()}%`, `%${slug.toLowerCase()}%`);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY status ASC, due_date ASC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [] });
}

// ── Ideas ──────────────────────────────────────────────────

// GET /api/ideas?status=&submitted_by=&research_area=
async function handleIdeas(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const submittedBy = url.searchParams.get('submitted_by');
  const researchArea = url.searchParams.get('research_area');

  let query = 'SELECT * FROM ideas WHERE 1=1';
  const params: string[] = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (submittedBy) { query += ' AND submitted_by = ?'; params.push(submittedBy); }
  if (researchArea) { query += ' AND research_area = ?'; params.push(researchArea); }

  query += ' ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'under_review\' THEN 1 WHEN \'approved\' THEN 2 WHEN \'parked\' THEN 3 ELSE 4 END, votes DESC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// POST /api/ideas — create idea
async function handleCreateIdea(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { title: string; description?: string; research_area?: string };
  if (!body.title) return error('title required', 400);

  const id = generateId();
  const submittedBy = user.email.split('@')[0].toLowerCase();

  await env.DB.prepare(
    'INSERT INTO ideas (id, title, description, submitted_by, research_area) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, body.title, body.description || null, submittedBy, body.research_area || null).run();

  await logActivity(env, 'idea', `New idea: "${body.title}"`, submittedBy, id, 'idea');

  const created = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/ideas/:id — update idea fields
async function handleUpdateIdea(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const allowedFields = ['title', 'description', 'research_area', 'status', 'project_id'];
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) return error('No valid fields to update', 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);
  await env.DB.prepare(`UPDATE ideas SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  const updated = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  if (!updated) return error('Idea not found', 404);
  return json({ data: updated });
}

// POST /api/ideas/:id/vote — upvote
async function handleVoteIdea(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('UPDATE ideas SET votes = votes + 1 WHERE id = ?').bind(id).run();
  const updated = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
  if (!updated) return error('Idea not found', 404);
  return json({ data: updated });
}

// ── Calendar Events ─────────────────────────────────────────

// GET /api/calendar/events?start=&end=
async function handleCalendarEvents(url: URL, env: Env): Promise<Response> {
  const startDate = url.searchParams.get('start') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const endDate = url.searchParams.get('end') || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

  // Aggregate from multiple sources
  const [meetings, tasks, milestones] = await Promise.all([
    env.DB.prepare('SELECT DISTINCT id, date, title, type FROM meetings WHERE date >= ? AND date <= ? ORDER BY date')
      .bind(startDate, endDate).all<{ id: string; date: string; title: string; type: string }>(),
    env.DB.prepare('SELECT id, title, description, due_date, assignee, status, priority FROM tasks WHERE due_date IS NOT NULL AND due_date >= ? AND due_date <= ? AND completed = 0 ORDER BY due_date')
      .bind(startDate, endDate).all<{ id: string; title: string; description: string; due_date: string; assignee: string; status: string; priority: string }>(),
    env.DB.prepare('SELECT m.id, m.title, m.target_date, m.status, g.mechanism, g.title as grant_title FROM milestones m LEFT JOIN grants g ON m.grant_id = g.id WHERE m.target_date >= ? AND m.target_date <= ? ORDER BY m.target_date')
      .bind(startDate, endDate).all<{ id: string; title: string; target_date: string; status: string; mechanism: string | null; grant_title: string | null }>(),
  ]);

  const events: { id: string; date: string; title: string; type: string; category: string; meta?: Record<string, unknown> }[] = [];

  // Meetings
  for (const m of meetings.results || []) {
    events.push({ id: m.id, date: m.date, title: m.title, type: 'meeting', category: m.type });
  }

  // Task deadlines
  for (const t of tasks.results || []) {
    events.push({
      id: t.id,
      date: t.due_date,
      title: t.title || t.description,
      type: 'task',
      category: t.priority,
      meta: { assignee: t.assignee, status: t.status },
    });
  }

  // Grant milestones
  for (const m of milestones.results || []) {
    events.push({
      id: m.id,
      date: m.target_date,
      title: m.mechanism ? `${m.mechanism}: ${m.title}` : m.title,
      type: 'milestone',
      category: 'grant',
      meta: { grant_title: m.grant_title },
    });
  }

  // Dedup by title+date (meetings may have duplicates from multiple syncs with different IDs)
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const key = `${e.type}::${e.date}::${e.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  return json({ data: deduped, count: deduped.length });
}

// ── Task Comments ───────────────────────────────────────────

async function handleGetTaskComments(taskId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}

async function handleAddTaskComment(taskId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string };
  if (!body.content?.trim()) return error('content required', 400);

  const id = generateId();
  const authorSlug = user.email.split('@')[0].toLowerCase();

  await env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, author_slug, content) VALUES (?, ?, ?, ?)'
  ).bind(id, taskId, authorSlug, body.content.trim()).run();

  await logActivity(env, 'comment', `Commented on task`, authorSlug, taskId, 'task');

  // Create notifications for @mentions
  try {
    const mentions = parseMentions(body.content);
    for (const slug of mentions) {
      if (slug === authorSlug) continue;
      await env.DB.prepare(
        'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), slug, 'mention', 'task_comment', id, `${user.name || user.email} mentioned you`, body.content.trim().slice(0, 200), '/tasks').run();
    }
  } catch (e) { console.error('Failed to create task comment notifications:', e); }

  const created = await env.DB.prepare('SELECT * FROM task_comments WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── Task Activity ───────────────────────────────────────────

async function handleGetTaskActivity(taskId: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM activity_log WHERE related_id = ? AND related_type = 'task' ORDER BY timestamp DESC LIMIT 20"
  ).bind(taskId).all();
  return json({ data: result.results || [] });
}
