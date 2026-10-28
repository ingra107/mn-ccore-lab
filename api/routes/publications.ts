import type { Env } from '../helpers';
import { json } from '../helpers';
import { grantCounts } from './grants';
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
    // topics is stored as JSON array, use instr() for simple matching
    query += ' AND instr(lower(topics), lower(?)) > 0';
    params.push(`"${topic}"`);
  }

  query += ' ORDER BY year DESC, title ASC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/stats
export async function handleGetStats(env: Env): Promise<Response> {
  const [pubCount, teamCount, grantCount, projectCount, activeCount, featuredCount] =
    await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM publications').first<{ c: number }>(),
      env.DB.prepare('SELECT COUNT(*) as c FROM team_members').first<{ c: number }>(),
      grantCounts(env).then((g) => ({ c: g.total })),
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
