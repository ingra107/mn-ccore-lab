import type { Env } from '../helpers';
import { json } from '../helpers';
import { isTestFixture } from '../lib/fixtures';

// GET /api/activity?limit=20&actor=slug
export async function handleActivity(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 500);
  const actor = url.searchParams.get('actor');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';
  let query = 'SELECT * FROM activity_log';
  const params: (string | number)[] = [];
  if (actor) {
    query += ' WHERE actor = ?';
    params.push(actor);
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
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

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
