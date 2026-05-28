import type { Env } from '../helpers';
import { json, error, generateId, actorSlugFromRequest, isPiRequest } from '../helpers';
import { nowInstant } from '../lib/time';

// GET /api/notifications?unread=
// Recipient is always derived from the authenticated caller — the ?recipient=
// query param is IGNORED to prevent one team member reading another's feed.
export async function handleNotifications(url: URL, request: Request, env: Env): Promise<Response> {
  const callerSlug = await actorSlugFromRequest(request, env);
  if (!callerSlug) return error('Authentication required', 401);

  const unread = url.searchParams.get('unread');

  let query = 'SELECT id, recipient_slug, type, title, message, read, read_at, related_id, related_type, created_at FROM notifications WHERE recipient_slug = ?';
  const params: string[] = [callerSlug];

  if (unread === '1') {
    query += ' AND read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT 50';

  try {
    const result = await env.DB.prepare(query).bind(...params).all();
    return json({ data: result.results || [] });
  } catch {
    return json({ data: [] });
  }
}

// GET /api/notifications/count
// Count is always for the authenticated caller — ?recipient= param IGNORED.
export async function handleNotificationCount(url: URL, request: Request, env: Env): Promise<Response> {
  const callerSlug = await actorSlugFromRequest(request, env);
  if (!callerSlug) return error('Authentication required', 401);

  try {
    const result = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE recipient_slug = ? AND read = 0'
    ).bind(callerSlug).first();
    return json({ count: (result as Record<string, unknown>)?.count ?? 0 });
  } catch {
    return json({ count: 0 });
  }
}

// POST /api/notifications/:id/read
// Owner-or-PI gate: only the recipient or a PI may mark a notification read.
export async function handleMarkNotificationRead(id: string, request: Request, env: Env): Promise<Response> {
  const callerSlug = await actorSlugFromRequest(request, env);
  if (!callerSlug) return error('Authentication required', 401);

  // Look up the notification's owner before updating.
  const notif = await env.DB.prepare(
    'SELECT recipient_slug FROM notifications WHERE id = ?'
  ).bind(id).first<{ recipient_slug: string }>();
  if (!notif) return error('Notification not found', 404);

  if (notif.recipient_slug !== callerSlug && !(await isPiRequest(request, env))) {
    return error('Forbidden', 403);
  }

  // read_at timestamp lets the UI show "read 5m ago" and lets sync diff
  // legit "already seen" from "marked read but unseen".
  await env.DB.prepare(
    "UPDATE notifications SET read = 1, read_at = datetime('now') WHERE id = ?"
  ).bind(id).run();
  return json({ success: true });
}

// POST /api/notifications/read-all
// Caller-identity is supplied by index.ts (derived from auth); recipient param
// is the canonical slug resolved by the route registration, not from a raw
// user-supplied query string. Kept as-is because read-all always targets the
// authed user's own slug (resolved in index.ts before this call).
export async function handleMarkAllNotificationsRead(recipient: string, env: Env): Promise<Response> {
  await env.DB.prepare(
    "UPDATE notifications SET read = 1, read_at = datetime('now') WHERE recipient_slug = ? AND read = 0"
  ).bind(recipient).run();
  return json({ success: true });
}

// GET /api/commitments?to=&status=&slug=
export async function handleCommitments(url: URL, env: Env): Promise<Response> {
  const toWhom = url.searchParams.get('to');
  const status = url.searchParams.get('status');
  const slug = url.searchParams.get('slug');

  let query = 'SELECT * FROM commitments WHERE 1=1';
  const params: string[] = [];

  if (toWhom) {
    // Match partial — "Emma Bromley" or just "emma-bromley"
    query += ' AND (LOWER(to_whom) LIKE ? OR LOWER(to_whom) LIKE ?)';
    params.push(`%${toWhom.toLowerCase()}%`, `%${toWhom.toLowerCase()}%`);
  }
  if (slug) {
    // Prefer exact to_slug match (populated since schema-v69); also keep
    // fuzzy to_whom fallback for rows written before the column existed.
    query += ' AND (LOWER(to_slug) = ? OR LOWER(to_whom) LIKE ?)';
    params.push(slug.toLowerCase(), `%${slug.toLowerCase()}%`);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY status ASC, due_date ASC, created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results || [] });
}

// POST /api/commitments — create/upsert commitment
export async function handleCreateCommitment(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  if (!body.id || !body.commitment || !body.to_whom) {
    return error('id, commitment, and to_whom required', 400);
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO commitments (id, commitment, to_whom, to_slug, status, due_date, source, project, task_id, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.id as string,
    body.commitment as string,
    body.to_whom as string,
    (body.to_slug as string) ?? null,
    (body.status as string) ?? 'open',
    (body.due_date as string) ?? null,
    (body.source as string) ?? null,
    (body.project as string) ?? null,
    (body.task_id as string) ?? null,
    (body.created_at as string) ?? nowInstant(),
    (body.completed_at as string) ?? null,
  ).run();

  return json({ success: true }, 201);
}
