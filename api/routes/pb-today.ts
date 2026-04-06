import type { Env } from '../helpers';
import { json, error } from '../helpers';

// GET /api/pb/today — returns the raw TODAY.md content
export async function handleGetTodayMd(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT value FROM lab_settings WHERE key = 'today_md'"
  ).first<{ value: string }>();

  return json({ data: { content: row?.value || '' } });
}

// POST /api/pb/today — upsert the TODAY.md content
export async function handleUpsertTodayMd(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { content: string };
  if (typeof body.content !== 'string') return error('content (string) required', 400);

  await env.DB.prepare(
    "INSERT OR REPLACE INTO lab_settings (key, value, updated_at) VALUES ('today_md', ?, datetime('now'))"
  ).bind(body.content).run();

  return json({ data: { content: body.content } });
}
