// api/routes/launch-log.ts
import { json, error, generateId, isPiRequest } from '../helpers';
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

// The claim row: launch fields + the source task's context, fetched in ONE
// LEFT-JOINed query (task fields are NULL for context-free launches).
// task_pk is the join sentinel: task_id set but task_pk NULL = missing/deleted task.
type ClaimRow = {
  tag: string; seed: string; project_slug: string | null; task_id: string | null;
  task_pk: string | null; task_title: string | null; task_status: string | null;
  task_due: string | null; task_description: string | null; project_name: string | null;
};

// Compose fresh task context into a launch seed. When the launch carried a
// task_id (fired from a task compose surface), the claim query joins that task
// from D1 (the canonical arbiter — context is fresh at claim time, never a
// compose-time snapshot) and this prepends a compact context header so the
// seeded session knows what "this" refers to. task_id NULL (Today-bar
// @quickchat, legacy rows) or a missing task → the raw seed is returned
// UNCHANGED (graceful; a miss is logged). Header kept intentionally terse: it
// rides in front of Nick's seed and (on the mobile route) gets newline-collapsed
// onto one line by launch_remote_chat_v2, so inline ` · ` separators stay readable.
function composeSeedWithTaskContext(row: ClaimRow): string {
  if (!row.task_id) return row.seed;
  if (!row.task_pk) {
    // A stale/deleted task_id is not fatal — the launch still works, just context-free.
    console.warn(`[launch-log] claim: task_id ${row.task_id} not found (deleted or stale) — returning raw seed`);
    return row.seed;
  }
  const lines = [
    '[Task context — you were launched from this task card]',
    `Task: ${row.task_title ?? '(untitled)'}`,
    `Status: ${row.task_status ?? 'unknown'} · Due: ${row.task_due ?? 'none'} · Project: ${row.project_name ?? 'none'}`,
  ];
  const desc = (row.task_description ?? '').trim();
  if (desc) {
    const truncated = desc.length > SEED_DESC_MAX ? `${desc.slice(0, SEED_DESC_MAX)}…` : desc;
    lines.push(`Description: ${truncated}`);
  }
  return `${lines.join('\n')}\n\n${row.seed}`;
}

// POST /api/launch-log/:id/claim — atomic single-use opaque-token claim; UNSCOPED (no requested_by filter).
// PI/API-key gated in-handler (isPiRequest — same idiom as bug-report.ts's
// handleListBugReports). Backlog #250: a team member must not be able to
// consume a pending mobile launch + read its seed even by guessing the
// opaque lnch_ id (queue privacy, defense-in-depth). Both live claimants pass
// unchanged because they already authenticate with Bearer PB_API_KEY:
// resolve_launch.py (the computer route, scripts/utils/resolve_launch.py:138-140)
// and hub_ai_listener.py (the mobile route, scripts/scheduled/hub_ai_listener.py:244-252,1104).
// validateApiKey() matches that key against env.PB_API_KEY and isPiRequest()
// short-circuits true before ever touching CF Access. No browser caller hits
// this endpoint directly — the browser only POSTs /api/launch-log to mint a
// token; the OS protocol handler hands the opaque id to resolve_launch.py.
// Returns { verb, seed, project_slug } on success. 410 if token invalid, expired, or already consumed.
// The returned seed is the RAW stored seed enriched with the source task's context
// when the row carried a task_id (see composeSeedWithTaskContext). (#485)
export async function handleClaimLaunch(id: string, request: Request, _user: AuthUser, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
  const result = await env.DB.prepare(
    `UPDATE launch_log SET status='launched', consumed_at=datetime('now'), launched_at=datetime('now')
     WHERE id=? AND consumed_at IS NULL AND expires_at IS NOT NULL AND expires_at > datetime('now')`
  ).bind(id).run();
  if (result.meta.changes !== 1) return error('launch token invalid, expired, or already consumed', 410);
  // One round-trip: launch row + (when task_id is set) the task context. The
  // deleted_at guard lives in the JOIN condition, not WHERE — a deleted task
  // must null the task columns, never drop the launch row itself.
  const row = await env.DB.prepare(
    `SELECT ll.tag, ll.seed, ll.project_slug, ll.task_id,
            t.id AS task_pk, t.title AS task_title, t.status AS task_status,
            t.due_date AS task_due, t.description AS task_description,
            COALESCE(p.title, t.project_id) AS project_name
       FROM launch_log ll
       LEFT JOIN tasks t ON t.id = ll.task_id AND t.deleted_at IS NULL
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
      WHERE ll.id = ?`
  ).bind(id).first<ClaimRow>();
  const seed = composeSeedWithTaskContext(row!);
  return json({ data: { verb: row!.tag, seed, project_slug: row!.project_slug } });
}
