// api/routes/launch-log.ts
import { json, error, generateId } from '../helpers';
import type { Env, AuthUser } from '../helpers';

const TAGS = ['quickchat', 'workon'];
const ORIGINS = ['computer', 'mobile'];
const STATUSES = ['pending', 'launched', 'failed', 'completed', 'expired'];

// POST /api/launch-log — create a new launch log entry
export async function handleCreateLaunch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const b = await request.json() as {
    tag: string; seed?: string; origin: string;
    target_machine?: string; project_slug?: string; status?: string;
  };
  if (!TAGS.includes(b.tag)) return error('tag must be quickchat or workon', 400);
  if (!ORIGINS.includes(b.origin)) return error('origin must be computer or mobile', 400);
  const status = b.status ?? 'pending';
  if (!STATUSES.includes(status)) return error('invalid status', 400);

  const id = 'lnch_' + generateId();
  const launchedAt = status === 'launched' ? "datetime('now')" : 'NULL';
  const expiresAt = b.origin === 'computer' ? "datetime('now','+10 minutes')" : "datetime('now','+2 hours')";
  await env.DB.prepare(
    `INSERT INTO launch_log (id, tag, seed, origin, target_machine, project_slug, status, requested_by, launched_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${launchedAt}, ${expiresAt})`
  ).bind(
    id, b.tag, (b.seed ?? '').trim(), b.origin,
    b.target_machine ?? null, b.project_slug ?? null, status, user.email,
  ).run();

  const row = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ?').bind(id).first();
  return json({ data: row }, 201);
}

// GET /api/launch-log?status=&origin= — Nick-private: only the requester's own launches
export async function handleListLaunches(url: URL, user: AuthUser, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const origin = url.searchParams.get('origin');
  let q = 'SELECT * FROM launch_log WHERE requested_by = ?';
  const p: string[] = [user.email];
  if (status) { q += ' AND status = ?'; p.push(status); }
  if (origin) { q += ' AND origin = ?'; p.push(origin); }
  q += ' ORDER BY created_at DESC LIMIT 200';
  const r = await env.DB.prepare(q).bind(...p).all();
  return json({ data: r.results ?? [] });
}

// POST /api/launch-log/:id/status — update status (and launched_at if transitioning to launched)
export async function handleSetLaunchStatus(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const b = await request.json() as { status: string };
  if (!STATUSES.includes(b.status)) return error('invalid status', 400);
  const setLaunched = b.status === 'launched' ? ", launched_at = datetime('now')" : '';
  await env.DB.prepare(`UPDATE launch_log SET status = ?${setLaunched} WHERE id = ? AND requested_by = ?`).bind(b.status, id, user.email).run();
  const row = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ? AND requested_by = ?').bind(id, user.email).first();
  if (!row) return error('launch not found', 404);
  return json({ data: row });
}

// POST /api/launch-log/:id/refire — clone a prior launch into a new row (never mutates history)
export async function handleRefireLaunch(id: string, user: AuthUser, env: Env): Promise<Response> {
  const src = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ? AND requested_by = ?')
    .bind(id, user.email).first<{ tag: string; seed: string; origin: string; target_machine: string | null; project_slug: string | null }>();
  if (!src) return error('launch not found', 404);
  const fakeReq = new Request('https://x/api/launch-log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: src.tag, seed: src.seed, origin: src.origin, target_machine: src.target_machine, project_slug: src.project_slug }),
  });
  return handleCreateLaunch(fakeReq, user, env);
}

// GET /api/pb/launch-log/pending — UNSCOPED (no requested_by filter); PI-gated by app-level middleware.
// Returns only id + created_at; seed intentionally omitted (defense-in-depth: leaking the list never leaks a seed).
export async function handleListPendingLaunches(env: Env): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT id, created_at FROM launch_log
     WHERE status='pending' AND origin='mobile' AND consumed_at IS NULL
       AND expires_at > datetime('now')
     ORDER BY created_at ASC LIMIT 50`
  ).all();
  return json({ data: r.results ?? [] });
}

// POST /api/launch-log/:id/claim — atomic single-use opaque-token claim; UNSCOPED (no requested_by filter).
// Returns { verb, seed, project_slug } on success. 410 if token invalid, expired, or already consumed.
export async function handleClaimLaunch(id: string, _request: Request, _user: AuthUser, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `UPDATE launch_log SET status='launched', consumed_at=datetime('now'), launched_at=datetime('now')
     WHERE id=? AND consumed_at IS NULL AND expires_at IS NOT NULL AND expires_at > datetime('now')`
  ).bind(id).run();
  if (result.meta.changes !== 1) return error('launch token invalid, expired, or already consumed', 410);
  const row = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ?')
    .bind(id).first<{ tag: string; seed: string; project_slug: string | null }>();
  return json({ data: { verb: row!.tag, seed: row!.seed, project_slug: row!.project_slug } });
}
