import type { Env } from '../helpers';
import { json } from '../helpers';
import type { PublicationRow, TeamMemberRow, CollaborationGraph, GraphNode, GraphEdge, Stats } from '../types';

// GET /api/publications?year=&status=&topic=
export async function handlePublications(url: URL, env: Env): Promise<Response> {
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

// GET /api/grants
export async function handleGrants(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM grants ORDER BY mechanism, title'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/graph/collaboration
// Builds a co-authorship network from publications.
// Nodes = team members who appear in author_slugs.
// Edges = co-authorship pairs weighted by number of shared publications.
export async function handleCollaborationGraph(env: Env): Promise<Response> {
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
export async function handleStats(env: Env): Promise<Response> {
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

// GET /api/grants/timeline
export async function handleGrantsTimeline(env: Env): Promise<Response> {
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
