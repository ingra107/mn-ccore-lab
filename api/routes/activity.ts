import type { Env } from '../helpers';
import { json } from '../helpers';
import { isTestFixture } from '../lib/fixtures';
import { ctToday } from '../lib/ct-date';

// GET /api/activity?limit=20&actor=slug
// AM-3 (SEC-T0-1): `canSeePb` true for PI/Nick/service. This endpoint stays
// public (the /pulse kiosk consumes it unauthenticated), but for non-PI
// callers we exclude activity_log rows tied to a 'Peripheral Brain'-category
// project so PB project titles/state don't leak via free-text descriptions.
// Rows that aren't project-related (related_type != 'project') are unaffected.
export async function handleGetActivity(url: URL, env: Env, canSeePb = false): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 500);
  const actor = url.searchParams.get('actor');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';
  let query = 'SELECT * FROM activity_log';
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (actor) {
    where.push('actor = ?');
    params.push(actor);
  }
  if (!canSeePb) {
    // Exclude rows whose related project is PB-category. related_id stores the
    // project id OR slug, so match on either. Non-project rows (related_type
    // != 'project') and rows with no matching PB project pass through.
    where.push(`NOT (related_type = 'project' AND related_id IN (
      SELECT id FROM projects WHERE category = 'Peripheral Brain'
      UNION SELECT slug FROM projects WHERE category = 'Peripheral Brain'
    ))`);
  }
  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }
  // Over-fetch when filtering so the final count still honours the caller's limit.
  const fetchLimit = includeFixtures ? limit : Math.min(limit * 3, 500);
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(fetchLimit);
  const result = await env.DB.prepare(query).bind(...params).all();
  let rows = result.results as Array<{ description: string | null }>;
  if (!includeFixtures) {
    rows = rows.filter((r) => !isTestFixture(r.description));
  }
  rows = rows.slice(0, limit);
  return json({ data: rows, count: rows.length });
}

// GET /api/activity/heatmap?slug=&days=
export async function handleActivityHeatmap(url: URL, env: Env): Promise<Response> {
  const slug = url.searchParams.get('slug');
  const days = parseInt(url.searchParams.get('days') || '90');
  const since = ctToday(-days);

  let query = "SELECT DATE(timestamp) as date, COUNT(*) as count FROM activity_log WHERE timestamp >= ? ";
  const params: string[] = [since];

  if (slug) {
    query += "AND actor = ? ";
    params.push(slug);
  }

  query += "GROUP BY DATE(timestamp) ORDER BY date";

  const result = await env.DB.prepare(query).bind(...params).all();
  const data: Record<string, number> = {};
  for (const row of (result.results || []) as { date: string; count: number }[]) {
    data[row.date] = row.count;
  }

  // Also count task completions
  let taskQuery = "SELECT DATE(completed_at) as date, COUNT(*) as count FROM tasks WHERE completed_at IS NOT NULL AND completed_at >= ? ";
  const taskParams: string[] = [since];
  if (slug) {
    taskQuery += "AND (assignee = ? OR completed_by LIKE ?) ";
    taskParams.push(slug, `%${slug}%`);
  }
  taskQuery += "GROUP BY DATE(completed_at)";

  const taskResult = await env.DB.prepare(taskQuery).bind(...taskParams).all();
  for (const row of (taskResult.results || []) as { date: string; count: number }[]) {
    data[row.date] = (data[row.date] || 0) + row.count;
  }

  return json({ data, days, slug: slug || 'all' });
}
