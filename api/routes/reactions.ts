import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, actorSlug } from '../helpers';

interface ReactionRow {
  id: string
  target_type: string
  target_id: string
  user_slug: string
  emoji: string
  created_at: string
}

// GET /api/reactions?target_type=project_update&target_id=...
export async function handleGetReactions(url: URL, env: Env): Promise<Response> {
  const targetType = url.searchParams.get('target_type');
  const targetId = url.searchParams.get('target_id');

  if (!targetType || !targetId) {
    return error('target_type and target_id required', 400);
  }

  const result = await env.DB.prepare(
    'SELECT * FROM reactions WHERE target_type = ? AND target_id = ?'
  ).bind(targetType, targetId).all<ReactionRow>();

  return json({ data: result.results });
}

// POST /api/reactions — toggle: add if not present, remove if already exists
export async function handleToggleReaction(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    target_type: string
    target_id: string
    emoji?: string
  };

  if (!body.target_type || !body.target_id) {
    return error('target_type and target_id required', 400);
  }

  const emoji = body.emoji || '\u{1F44D}';
  const userSlug = actorSlug(user.email);

  // Check if reaction already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND user_slug = ? AND emoji = ?'
  ).bind(body.target_type, body.target_id, userSlug, emoji).first<{ id: string }>();

  if (existing) {
    // Remove reaction
    await env.DB.prepare('DELETE FROM reactions WHERE id = ?').bind(existing.id).run();
    return json({ data: null, action: 'removed' });
  } else {
    // Add reaction
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO reactions (id, target_type, target_id, user_slug, emoji) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, body.target_type, body.target_id, userSlug, emoji).run();

    const created = await env.DB.prepare('SELECT * FROM reactions WHERE id = ?').bind(id).first();
    return json({ data: created, action: 'added' }, 201);
  }
}
