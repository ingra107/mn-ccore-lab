import type { Env } from '../helpers';
import { json } from '../helpers';
import { GRANT_BUCKET_SQL } from './grant-bucket';
import type { Stats } from '../types';

// GET /api/publications?year=&status=&topic=
export async function handleGetPublications(url: URL, env: Env): Promise<Response> {
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
export async function handleGetGrants(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT *, ${GRANT_BUCKET_SQL} AS bucket FROM grants ORDER BY mechanism, title`
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/stats
export async function handleGetStats(env: Env): Promise<Response> {
  const [pubCount, teamCount, grantCount, projectCount, activeCount, featuredCount] =
    await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM publications').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM team_members').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM grants').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM projects').first<{ c: number }>(),
      env.DB.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'active'").first<{ c: number }>(),
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
    `SELECT *, ${GRANT_BUCKET_SQL} AS bucket FROM grants ORDER BY CASE ${GRANT_BUCKET_SQL} WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END, start_date ASC`
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

// PATCH /api/grants/:id — partial update (R10: status taxonomy + inline editing)
const ALLOWED_GRANT_STATUS = new Set([
  'planning', 'in_preparation', 'submitted', 'funded', 'resubmission', 'declined', 'closed',
])
const ALLOWED_GRANT_FIELDS: Record<string, true> = {
  title: true, mechanism: true, agency: true, pi: true,
  start_date: true, end_date: true, status: true, total_funding: true,
}

export async function handleUpdateGrant(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>
  const sets: string[] = []
  const binds: unknown[] = []

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_GRANT_FIELDS[key]) continue
    if (key === 'status' && value != null && !ALLOWED_GRANT_STATUS.has(String(value))) {
      return json({ error: `Invalid status: ${value}` }, 400)
    }
    sets.push(`${key} = ?`)
    binds.push(value === '' ? null : value)
  }

  // `proposed` is kept in step with status on write for legacy readers only. Every
  // reader takes the `bucket` field that GET /api/grants and /api/grants/timeline
  // derive from status (GRANT_BUCKET_SQL).
  if (typeof body.status === 'string' && body.status) {
    sets.push('proposed = ?')
    binds.push(['planning', 'in_preparation', 'submitted', 'resubmission'].includes(body.status) ? 1 : 0)
  }

  if (sets.length === 0) return json({ error: 'No valid fields to update' }, 400)

  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE grants SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...binds).run()

  if (!result.meta.changes) return json({ error: 'Grant not found' }, 404)

  const updated = await env.DB.prepare('SELECT * FROM grants WHERE id = ?').bind(id).first()
  return json({ data: updated })
}
