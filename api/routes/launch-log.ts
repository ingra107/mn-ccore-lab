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
    target_machine?: string; project_slug?: string; status?: string; task_id?: string;
  };
  if (!TAGS.includes(b.tag)) return error('tag must be quickchat or workon', 400);
  if (!ORIGINS.includes(b.origin)) return error('origin must be computer or mobile', 400);
  const status = b.status ?? 'pending';
  if (!STATUSES.includes(status)) return error('invalid status', 400);

  const id = 'lnch_' + generateId();
  const launchedAt = status === 'launched' ? "datetime('now')" : 'NULL';
  const expiresAt = b.origin === 'computer' ? "datetime('now','+10 minutes')" : "datetime('now','+2 hours')";
  // The STORED seed stays RAW (what Nick typed) — the launch-log recovery panel
  // shows raw seeds and refire re-fires them verbatim. task_id (nullable, from a
  // task compose surface) lets the CLAIM endpoint compose fresh task context into
  // the seed it hands the session — the stored row is never rewritten. (#485)
  await env.DB.prepare(
    `INSERT INTO launch_log (id, tag, seed, origin, target_machine, project_slug, task_id, status, requested_by, launched_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${launchedAt}, ${expiresAt})`
  ).bind(
    id, b.tag, (b.seed ?? '').trim(), b.origin,
    b.target_machine ?? null, b.project_slug ?? null, b.task_id ?? null, status, user.email,
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
    .bind(id, user.email).first<{ tag: string; seed: string; origin: string; target_machine: string | null; project_slug: string | null; task_id: string | null }>();
  if (!src) return error('launch not found', 404);
  // Carry task_id forward so a refired task-launch keeps its task context; the
  // new row's own claim re-composes fresh context (the task may have moved since). (#485)
  const fakeReq = new Request('https://x/api/launch-log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: src.tag, seed: src.seed, origin: src.origin, target_machine: src.target_machine, project_slug: src.project_slug, task_id: src.task_id }),
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

// ── Seed composition ─────────────────────────────────────────────────────────
// THE single chokepoint that turns a stored raw seed into the seed handed to a
// session. EVERY seed reader that feeds a Claude session must route through here
// (today that is the claim endpoint below — the sole session-feeding exit for
// BOTH the computer route and the mobile route, which claims via the same
// endpoint through hub_ai_listener). Non-feeding readers (list/refire panel)
// keep showing the RAW stored seed and must NOT call this. (#485)
const SEED_DESC_MAX = 500; // description chars kept in the header — bounds total length

// Compose fresh task context into a launch seed. When the launch carried a
// task_id (fired from a task compose surface), fetch that task from D1 (the
// canonical arbiter — context is fresh at claim time, never a compose-time
// snapshot) and prepend a compact context header so the seeded session knows
// what "this" refers to. task_id NULL (Today-bar @quickchat, legacy rows) or a
// missing task → the raw seed is returned UNCHANGED (graceful; a miss is logged).
async function composeSeedWithTaskContext(env: Env, taskId: string | null | undefined, rawSeed: string): Promise<string> {
  if (!taskId) return rawSeed;
  const task = await env.DB.prepare(
    `SELECT t.title, t.status, t.due_date, t.description,
            COALESCE(p.title, t.project_id) AS project_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
      WHERE t.id = ? AND t.deleted_at IS NULL`
  ).bind(taskId).first<{
    title: string | null; status: string | null; due_date: string | null;
    description: string | null; project_name: string | null;
  }>();
  if (!task) {
    // A stale/deleted task_id is not fatal — the launch still works, just context-free.
    console.warn(`[launch-log] claim: task_id ${taskId} not found (deleted or stale) — returning raw seed`);
    return rawSeed;
  }
  return `${buildTaskContextHeader(task)}\n\n${rawSeed}`;
}

// Compact, plain-text, bounded context header. Kept intentionally terse: it rides
// in front of Nick's seed and (on the mobile route) gets newline-collapsed onto
// one line by launch_remote_chat_v2, so inline ` · ` separators stay readable.
function buildTaskContextHeader(task: {
  title: string | null; status: string | null; due_date: string | null;
  description: string | null; project_name: string | null;
}): string {
  const lines = [
    '[Task context — you were launched from this task card]',
    `Task: ${task.title ?? '(untitled)'}`,
    `Status: ${task.status ?? 'unknown'} · Due: ${task.due_date ?? 'none'} · Project: ${task.project_name ?? 'none'}`,
  ];
  const desc = (task.description ?? '').trim();
  if (desc) {
    const truncated = desc.length > SEED_DESC_MAX ? `${desc.slice(0, SEED_DESC_MAX)}…` : desc;
    lines.push(`Description: ${truncated}`);
  }
  return lines.join('\n');
}

// POST /api/launch-log/:id/claim — atomic single-use opaque-token claim; UNSCOPED (no requested_by filter).
// Returns { verb, seed, project_slug } on success. 410 if token invalid, expired, or already consumed.
// The returned seed is the RAW stored seed enriched with the source task's context
// when the row carried a task_id (see composeSeedWithTaskContext). (#485)
export async function handleClaimLaunch(id: string, _request: Request, _user: AuthUser, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `UPDATE launch_log SET status='launched', consumed_at=datetime('now'), launched_at=datetime('now')
     WHERE id=? AND consumed_at IS NULL AND expires_at IS NOT NULL AND expires_at > datetime('now')`
  ).bind(id).run();
  if (result.meta.changes !== 1) return error('launch token invalid, expired, or already consumed', 410);
  const row = await env.DB.prepare('SELECT * FROM launch_log WHERE id = ?')
    .bind(id).first<{ tag: string; seed: string; project_slug: string | null; task_id: string | null }>();
  const seed = await composeSeedWithTaskContext(env, row!.task_id, row!.seed);
  return json({ data: { verb: row!.tag, seed, project_slug: row!.project_slug } });
}
