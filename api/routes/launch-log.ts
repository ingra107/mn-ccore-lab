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
  const status = b.status ?? (b.origin === 'mobile' ? 'pending' : 'launched');
  if (!STATUSES.includes(status)) return error('invalid status', 400);

  const id = generateId();
  const launchedAt = status === 'launched' ? "datetime('now')" : 'NULL';
  await env.DB.prepare(
    `INSERT INTO launch_log (id, tag, seed, origin, target_machine, project_slug, status, requested_by, launched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${launchedAt})`
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
export async function handleSetLaunchStatus(id: string, request: Request, env: Env): Promise<Response> {
  const b = await request.json() as { status: string };
  if (!STATUSES.includes(b.status)) return error('invalid status', 400);
  const setLaunched = b.status === 'launched' ? ", launched_at = datetime('now')" : '';
  await env.DB.prepare(`UPDATE launch_log SET status = ?${setLaunched} WHERE id = ?`).bind(b.status, id).run();
  const row = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ?').bind(id).first();
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
