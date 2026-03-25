import type { Env, PublicationRow, TeamMemberRow, CollaborationGraph, GraphNode, GraphEdge, Stats } from './types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return error('Method not allowed', 405);
    }

    try {
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
        default:
          // Fall through to static site serving
          return error('Not found', 404);
      }
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
