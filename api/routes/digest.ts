import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity } from '../helpers';

// GET /api/digest?date=&status=&topic=&limit=&with_relevance=true
export async function handleGetDigest(url: URL, env: Env): Promise<Response> {
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const topic = url.searchParams.get('topic');
  const withRelevance = url.searchParams.get('with_relevance') === 'true';
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
  const papers = result.results as Record<string, unknown>[];

  if (!withRelevance) {
    return json({ data: papers, count: papers.length });
  }

  // Match paper topics against expertise_tags (cap at 20 for performance).
  //
  // Previous implementation ran 20 separate D1 queries (one per paper)
  // via Promise.all. D1 serializes per-connection, so even "parallel"
  // promises paid ~20 round-trips. Fetching the whole expertise_tags
  // table once (~< a few hundred rows in practice) and filtering in
  // memory is a single round-trip and still cheap.
  const papersToEnrich = papers.slice(0, 20);
  const expertiseRowsRes = await env.DB.prepare(
    'SELECT member_slug, LOWER(tag) AS tag FROM expertise_tags',
  ).all();
  const expertiseRows = (expertiseRowsRes.results || []) as Array<{ member_slug: string; tag: string }>;
  const enriched = papersToEnrich.map((paper) => {
    const topicsRaw = paper.topics as string | null;
    if (!topicsRaw) return { ...paper, relevant_members: [] };
    try {
      const topics = JSON.parse(topicsRaw) as string[];
      if (!topics.length) return { ...paper, relevant_members: [] };
      const needles = topics.map((t) => t.toLowerCase());
      const members = new Set<string>();
      for (const row of expertiseRows) {
        if (needles.some((n) => row.tag.includes(n))) {
          members.add(row.member_slug);
        }
      }
      return { ...paper, relevant_members: [...members] };
    } catch {
      return { ...paper, relevant_members: [] };
    }
  });

  // Remaining papers beyond the first 20 get empty relevant_members
  const remaining = papers.slice(20).map((p) => ({ ...p, relevant_members: [] }));

  const allPapers = [...enriched, ...remaining];
  return json({ data: allPapers, count: allPapers.length });
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

// GET /api/digest/:id/comments — list comments for a paper
export async function handleGetDigestComments(
  paperId: string,
  env: Env,
): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM digest_comments WHERE paper_id = ? ORDER BY created_at ASC'
  ).bind(paperId).all();
  return json({ data: result.results });
}

// POST /api/digest/:id/comments — add a comment to a paper
export async function handleCreateDigestComment(
  paperId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { content?: string; author_slug?: string };
  if (!body.content?.trim()) {
    return error('content is required', 400);
  }

  const id = crypto.randomUUID();
  const authorSlug = body.author_slug?.trim() || user.email?.split('@')[0]?.replace(/\./g, '-') || 'unknown';

  await env.DB.prepare(
    'INSERT INTO digest_comments (id, paper_id, author_slug, content) VALUES (?, ?, ?, ?)'
  ).bind(id, paperId, authorSlug, body.content.trim()).run();

  await logActivity(env, 'digest', `Commented on digest paper`, user.email, paperId, 'digest');

  const comment = await env.DB.prepare('SELECT * FROM digest_comments WHERE id = ?').bind(id).first();
  return json({ data: comment }, 201);
}

// GET /api/digest/comment-counts — comment counts per paper (for badge display)
export async function handleDigestCommentCounts(url: URL, env: Env): Promise<Response> {
  const date = url.searchParams.get('date');
  let query = `SELECT paper_id, COUNT(*) as count FROM digest_comments`;
  const params: string[] = [];

  if (date) {
    query += ` WHERE paper_id IN (SELECT id FROM research_digest WHERE digest_date = ?)`;
    params.push(date);
  }

  query += ` GROUP BY paper_id`;
  const result = await env.DB.prepare(query).bind(...params).all();

  const counts: Record<string, number> = {};
  for (const row of result.results as { paper_id: string; count: number }[]) {
    counts[row.paper_id] = row.count;
  }
  return json({ data: counts });
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
