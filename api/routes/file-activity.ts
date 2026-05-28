import type { Env } from '../helpers';
import { json, error, generateId, isPiRequest } from '../helpers';
import { ctToday } from '../lib/ct-date';

// GET /api/file-activity/heatmap?days=90 — daily aggregates from file_activity_daily
export async function handleGetFileActivity(url: URL, env: Env): Promise<Response> {
  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const since = ctToday(-days);

  const result = await env.DB.prepare(
    `SELECT date, SUM(file_count) as file_count, SUM(total_events) as total_events
     FROM file_activity_daily
     WHERE date >= ?
     GROUP BY date
     ORDER BY date`
  ).bind(since).all();

  // Also return per-project breakdown
  const byProject = await env.DB.prepare(
    `SELECT project_id, project_name, SUM(file_count) as file_count, SUM(total_events) as total_events
     FROM file_activity_daily
     WHERE date >= ?
     GROUP BY project_id
     ORDER BY total_events DESC`
  ).bind(since).all();

  return json({
    data: {
      daily: result.results || [],
      by_project: byProject.results || [],
      days,
    },
  });
}

// POST /api/file-activity/sync — bulk upsert file activity entries.
// PI-or-API-key: this IS the PB sync ingestion path; ordinary team JWT
// callers must not be able to write file activity data.
// API-key callers (PB sync service) are granted access via isPiRequest Bearer check.
export async function handleSyncFileActivity(request: Request, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
  const body = await request.json() as {
    entries: Array<{
      date: string;
      project_id?: string | null;
      project_name?: string | null;
      file_count?: number;
      total_events?: number;
    }>;
  };

  if (!body.entries?.length) return error('entries array required', 400);

  const BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < body.entries.length; i += BATCH_SIZE) {
    const batch = body.entries.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(e =>
      env.DB.prepare(
        `INSERT INTO file_activity_daily (id, date, project_id, project_name, file_count, total_events)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date, project_id) DO UPDATE SET
           project_name = COALESCE(excluded.project_name, file_activity_daily.project_name),
           file_count = excluded.file_count,
           total_events = excluded.total_events`
      ).bind(
        generateId(),
        e.date,
        e.project_id ?? null,
        e.project_name ?? null,
        e.file_count ?? 0,
        e.total_events ?? 0
      )
    );
    await env.DB.batch(stmts);
    upserted += batch.length;
  }

  return json({ data: { ok: true, upserted } });
}
