import type { AuthUser, Env } from '../helpers';
import { json, error, generateId } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';

interface ExpertiseRow {
  id: string
  member_slug: string
  tag: string
  source: string
  confidence: number
  created_at: string
}

// GET /api/expertise?slug=...&tag=...
export async function handleGetExpertise(url: URL, env: Env): Promise<Response> {
  const slug = url.searchParams.get('slug');
  const tag = url.searchParams.get('tag');

  let query = 'SELECT * FROM expertise_tags';
  const conditions: string[] = [];
  const bindings: string[] = [];

  if (slug) {
    conditions.push('member_slug = ?');
    bindings.push(slug);
  }
  if (tag) {
    conditions.push('LOWER(tag) LIKE ?');
    bindings.push(`%${tag.toLowerCase()}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY confidence DESC, tag ASC';

  const stmt = env.DB.prepare(query);
  const result = bindings.length > 0
    ? await stmt.bind(...bindings).all<ExpertiseRow>()
    : await stmt.all<ExpertiseRow>();

  return json({ data: result.results });
}

// POST /api/expertise — { member_slug, tag, source? }
export async function handleAddExpertise(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    member_slug: string
    tag: string
    source?: string
    confidence?: number
  };

  if (!body.member_slug || !body.tag) {
    return error('member_slug and tag required', 400);
  }

  const id = generateId();
  const source = body.source || 'manual';
  const confidence = body.confidence ?? 1.0;

  try {
    await env.DB.prepare(
      'INSERT INTO expertise_tags (id, member_slug, tag, source, confidence) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, body.member_slug, body.tag.trim(), source, confidence).run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE constraint')) {
      return error('Tag already exists for this member', 409);
    }
    throw e;
  }

  const created = await env.DB.prepare('SELECT * FROM expertise_tags WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// POST /api/expertise/:id/delete
export async function handleRemoveExpertise(id: string, request: Request, env: Env): Promise<Response> {
  return idempotentDelete({ table: 'expertise_tags', id, mode: 'hard', request, env });
}
