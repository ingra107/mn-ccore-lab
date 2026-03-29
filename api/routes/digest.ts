import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity } from '../helpers';

// GET /api/digest?date=&status=&topic=&limit=
export async function handleDigest(url: URL, env: Env): Promise<Response> {
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const topic = url.searchParams.get('topic');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 300);

  let query = 'SELECT * FROM research_digest WHERE 1=1';
  const params: (string | number)[] = [];

  if (date) {
    query += ' AND digest_date = ?';
    params.push(date);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (topic) {
    query += ' AND topics LIKE ?';
    params.push(`%"${topic}"%`);
  }

  query += ' ORDER BY relevance_score DESC, pub_date DESC LIMIT ?';
  params.push(limit);

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/digest/dates — list available digest dates with paper counts
export async function handleDigestDates(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT digest_date as date, COUNT(*) as count
     FROM research_digest
     WHERE digest_date IS NOT NULL
     GROUP BY digest_date
     ORDER BY digest_date DESC`
  ).all();
  return json({ data: result.results });
}

// POST /api/digest/:id/status — update paper status (save/dismiss)
export async function handleUpdateDigestStatus(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { status?: string };
  const validStatuses = ['new', 'saved', 'dismissed'];

  if (!body.status || !validStatuses.includes(body.status)) {
    return error('Invalid status. Must be: new, saved, or dismissed', 400);
  }

  const result = await env.DB.prepare(
    'UPDATE research_digest SET status = ?, saved_by = ? WHERE id = ?'
  ).bind(body.status, body.status === 'saved' ? user.email : null, id).run();

  if (result.meta.changes === 0) {
    return error('Paper not found', 404);
  }

  await logActivity(env, 'digest', `${body.status === 'saved' ? 'Saved' : body.status === 'dismissed' ? 'Dismissed' : 'Reset'} digest paper`, user.email, id, 'digest');

  const updated = await env.DB.prepare('SELECT * FROM research_digest WHERE id = ?').bind(id).first();
  return json({ data: updated });
}

// POST /api/digest — create or upsert a digest paper
export async function handleCreateDigestPaper(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  if (!body.id || !body.title) return error('id and title required', 400);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO research_digest (id, title, authors, journal, pub_date, abstract, pmid, doi, relevance_score, relevance_reason, topics, status, digest_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.id as string,
    body.title as string,
    (body.authors as string) ?? null,
    (body.journal as string) ?? null,
    (body.pub_date as string) ?? null,
    (body.abstract as string) ?? null,
    (body.pmid as string) ?? null,
    (body.doi as string) ?? null,
    (body.relevance_score as number) ?? 0,
    (body.relevance_reason as string) ?? null,
    (body.topics as string) ?? null,
    (body.status as string) ?? 'new',
    (body.digest_date as string) ?? null,
  ).run();

  return json({ data: { id: body.id } }, 201);
}
