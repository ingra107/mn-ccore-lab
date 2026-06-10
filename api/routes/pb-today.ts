import type { Env } from '../helpers';
import { json } from '../helpers';

// GET /api/pb/today — returns the raw TODAY.md content
export async function handleGetTodayMd(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT value FROM lab_settings WHERE key = 'today_md'"
  ).first<{ value: string }>();

  return json({ data: { content: row?.value || '' } });
}

// POST /api/pb/today (upsert TODAY.md) was retired 2026-05-05 (5.9): 0 callers.
// The handler was deleted 2026-06-09 (dead-code sweep). GET above is preserved
// for the frontend's read-only TODAY.md view (src/hooks/useApiData.ts).
