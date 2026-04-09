import type { Env } from '../helpers';
import { json, error, generateId } from '../helpers';

// GET /api/email-drafts — list all drafts, with optional ?status=draft filter
export async function handleGetEmailDrafts(request: Request, env: Env, url: URL): Promise<Response> {
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
  return json({ data: result.results, count: result.results.length });
}

// GET /api/email-drafts/pending — count and list pending drafts
export async function handleGetPendingDrafts(request: Request, env: Env, url: URL): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM email_drafts WHERE status = 'draft' ORDER BY created_at DESC"
  ).all();
  return json({ count: result.results.length, drafts: result.results });
}

// POST /api/email-drafts/sync-bulk — bulk upsert drafts
export async function handleSyncEmailDrafts(request: Request, env: Env): Promise<Response> {
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
