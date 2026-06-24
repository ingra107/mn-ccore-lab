import type { Env } from '../helpers';
import { json, error, isPiRequest } from '../helpers';
import { safeRow } from '../lib/task-cols';

// GET /api/email-drafts — list all drafts, with optional ?status=draft filter
export async function handleGetEmailDrafts(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  let query = 'SELECT * FROM email_drafts';
  const params: string[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const result = params.length
    ? await env.DB.prepare(query).bind(...params).all()
    : await env.DB.prepare(query).all();
  const rows = result.results.map(r => safeRow('email_drafts', r as Record<string, unknown>));
  return json({ data: rows, count: rows.length });
}

// GET /api/email-drafts/pending — count and list pending drafts.
// JOINs tasks so each draft carries the human task title (#84 — the card showed
// "Untitled draft" because the table only stores task_id, no title). The private
// gmail_draft_url is re-attached for PI / API-key callers ONLY: it links to
// Nick's gmail compose view, which team members must not be able to open.
export async function handleGetPendingDrafts(request: Request, env: Env): Promise<Response> {
  const isPi = await isPiRequest(request, env);
  const result = await env.DB.prepare(
    `SELECT d.*, t.title AS task_title, t.short_title AS task_short_title
       FROM email_drafts d
       LEFT JOIN tasks t ON t.id = d.task_id
      WHERE d.status = 'draft'
      ORDER BY d.created_at DESC`
  ).all();
  const drafts = result.results.map(r => {
    const row = r as Record<string, unknown>;
    const safe = safeRow('email_drafts', row);
    if (isPi && row.gmail_draft_url != null) safe.gmail_draft_url = row.gmail_draft_url;
    return safe;
  });
  return json({ count: drafts.length, drafts });
}

// POST /api/email-drafts/sync-bulk — bulk upsert drafts.
// PI-or-API-key: this IS the PB sync ingestion path; ordinary team JWT
// callers must not be able to write email drafts on Nick's behalf.
// API-key callers (hub_ai_listener / PB sync) are granted access via
// isPiRequest's Bearer check (validateApiKey).
export async function handleSyncEmailDrafts(request: Request, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
  const body = await request.json() as {
    drafts: Array<{
      id: string;
      task_id?: string | null;
      gmail_draft_url?: string | null;
      draft_type?: string | null;
      status?: string;
      created_at?: string | null;
      sent_at?: string | null;
    }>;
  };

  if (!body.drafts?.length) return error('drafts array required', 400);

  const BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < body.drafts.length; i += BATCH_SIZE) {
    const batch = body.drafts.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(d =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO email_drafts (id, task_id, gmail_draft_url, draft_type, status, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        d.id,
        d.task_id ?? null,
        d.gmail_draft_url ?? null,
        d.draft_type ?? null,
        d.status ?? 'draft',
        d.created_at ?? null,
        d.sent_at ?? null
      )
    );
    await env.DB.batch(stmts);
    upserted += batch.length;
  }

  return json({ data: { ok: true, upserted } });
}
