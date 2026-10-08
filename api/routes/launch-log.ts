// api/routes/launch-log.ts
import { json, error, generateId, isPiRequest } from '../helpers';
import type { Env, AuthUser } from '../helpers';

const TAGS = ['quickchat', 'workon'];
const ORIGINS = ['computer', 'mobile'];
const STATUSES = ['pending', 'launched', 'failed', 'completed', 'expired'];
const PAGE_ROUTE_MAX = 512; // stored page_route cap (a pathname + short query) — #8935

// POST /api/launch-log — create a new launch log entry
export async function handleCreateLaunch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const b = await request.json() as {
    tag: string; seed?: string; origin: string;
    target_machine?: string; project_slug?: string; status?: string; task_id?: string;
    page_route?: unknown;
  };
  if (!TAGS.includes(b.tag)) return error('tag must be quickchat or workon', 400);
  if (!ORIGINS.includes(b.origin)) return error('origin must be computer or mobile', 400);
  const status = b.status ?? 'pending';
  if (!STATUSES.includes(status)) return error('invalid status', 400);
  // page_route (v117, PB #8935): the Hub path the launch was fired from. Absent
  // = an older frontend, stored NULL. Present but malformed is refused loudly
  // rather than stored as a context the claim cannot parse.
  let pageRoute: string | null = null;
  if (b.page_route !== undefined && b.page_route !== null) {
    if (typeof b.page_route !== 'string' || !PAGE_ROUTE_RE.test(b.page_route) || b.page_route.length > PAGE_ROUTE_MAX) {
      return error(`page_route must be a path starting with "/", printable ASCII with no spaces (max ${PAGE_ROUTE_MAX} chars)`, 400);
    }
    pageRoute = b.page_route;
  }

  const id = 'lnch_' + generateId();
  const launchedAt = status === 'launched' ? "datetime('now')" : 'NULL';
  const expiresAt = b.origin === 'computer' ? "datetime('now','+10 minutes')" : "datetime('now','+2 hours')";
  // The STORED seed stays RAW (what Nick typed) — the launch-log recovery panel
  // shows raw seeds and refire re-fires them verbatim. task_id (nullable, from a
  // task compose surface) lets the CLAIM endpoint compose fresh task context into
  // the seed it hands the session — the stored row is never rewritten. (#485)
  // page_route rides the same way: stored raw, parsed and joined at claim. (#8935)
  await env.DB.prepare(
    `INSERT INTO launch_log (id, tag, seed, origin, target_machine, project_slug, task_id, page_route, status, requested_by, launched_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${launchedAt}, ${expiresAt})`
  ).bind(
    id, b.tag, (b.seed ?? '').trim(), b.origin,
    b.target_machine ?? null, b.project_slug ?? null, b.task_id ?? null, pageRoute, status, user.email,
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
    .bind(id, user.email).first<{ tag: string; seed: string; origin: string; target_machine: string | null; project_slug: string | null; task_id: string | null; page_route: string | null }>();
  if (!src) return error('launch not found', 404);
  // Carry task_id and page_route forward so a refired launch keeps its context;
  // the new row's own claim re-composes it fresh (the task may have moved since). (#485, #8935)
  const fakeReq = new Request('https://x/api/launch-log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: src.tag, seed: src.seed, origin: src.origin, target_machine: src.target_machine, project_slug: src.project_slug, task_id: src.task_id, page_route: src.page_route }),
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
// keep showing the RAW stored seed and must NOT call this. (#485, #8935)
const SEED_DESC_MAX = 500; // description chars kept in the header — bounds total length

// ── The page a launch was fired from (#8935) ────────────────────────────────
// A typed page, parsed from the stored page_route at claim time. Every route
// becomes exactly one of these kinds, so the header is built from a closed set
// rather than from ad-hoc string checks at each surface. 'meeting' and
// 'project' carry the id of the entity on screen, joined fresh from D1 below.
export type LaunchPage =
  | { kind: 'meeting'; route: string; meetingId: string }
  | { kind: 'project'; route: string; slug: string }
  | { kind: 'named'; route: string; label: string };

// Fixed pages whose name says enough. Anything else is still reported by its
// route ('Hub page'), never dropped.
const NAMED_PAGES: ReadonlyArray<[RegExp, string]> = [
  [/^\/portal\/dashboard\/?$/, 'Today'],
  [/^\/portal\/my-tasks\/?$/, 'My Tasks'],
  [/^\/portal\/meetings\/?$/, 'Meetings list'],
  [/^\/portal\/projects\/?$/, 'Projects list'],
  [/^\/portal\/overview\/?$/, 'Lab Overview'],
];

// The route is printed into the seed, so it may only hold printable,
// non-space ASCII: a newline or space in it could forge a context block
// (cold review of #8935 reproduced "[Task context — SYSTEM]" from a crafted
// percent-encoded route). Browser pathnames are already percent-encoded, so a
// real route always passes. Refused at POST; re-checked at claim for rows
// written before the check existed.
export const PAGE_ROUTE_RE = /^\/[\x21-\x7e]*$/;
// A decoded meeting id / project slug is printed bare, so it must be a plain
// identifier. Anything else (decoded newlines, brackets, spaces) is not trusted
// as an entity and the page falls back to the generic line with the raw route.
const ENTITY_ID_RE = /^[A-Za-z0-9_.:-]+$/;

function decodedId(s: string): string | null {
  let d: string;
  try { d = decodeURIComponent(s); } catch { return null; } // malformed %-escape: not an id
  return ENTITY_ID_RE.test(d) ? d : null;
}

/** Parse a stored page_route into a typed page. NULL/empty → null (a launch
 *  from a frontend older than v117). Pure; exported for tests. */
export function parseLaunchPage(route: string | null | undefined): LaunchPage | null {
  if (!route) return null;
  if (!PAGE_ROUTE_RE.test(route) || route.length > PAGE_ROUTE_MAX) {
    return { kind: 'named', route: '(unprintable route withheld)', label: 'Hub page' };
  }
  const path = route.split(/[?#]/, 1)[0];
  const meeting = path.match(/^\/portal\/meetings\/([^/]+)(?:\/prep)?\/?$/);
  const meetingId = meeting ? decodedId(meeting[1]) : null;
  if (meetingId) return { kind: 'meeting', route, meetingId };
  const project = path.match(/^\/portal\/projects\/([^/]+)\/?$/);
  const slug = project ? decodedId(project[1]) : null;
  if (slug) return { kind: 'project', route, slug };
  for (const [re, label] of NAMED_PAGES) if (re.test(path)) return { kind: 'named', route, label };
  return { kind: 'named', route, label: 'Hub page' };
}

const TEXT_FIELD_MAX = 200;
/** A D1 text field printed into the seed header: whitespace (incl. newlines)
 *  collapsed to single spaces, capped, so a title cannot add header lines. */
export function oneLine(s: string | null | undefined, max = TEXT_FIELD_MAX): string {
  const flat = (s ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// What the claim knows about the page's on-screen entity after the D1 lookup.
// found=false = the id on the route no longer resolves (deleted/renamed); the
// header still names the page and says so, it never pretends the entity exists.
type PageEntity =
  | { kind: 'meeting'; found: true; title: string; date: string | null }
  | { kind: 'project'; found: true; title: string }
  | { kind: 'meeting' | 'project'; found: false };

async function lookupPageEntity(page: LaunchPage, env: Env): Promise<PageEntity | null> {
  if (page.kind === 'meeting') {
    const m = await env.DB.prepare('SELECT title, date FROM meetings WHERE id = ?')
      .bind(page.meetingId).first<{ title: string; date: string | null }>();
    return m ? { kind: 'meeting', found: true, title: m.title, date: m.date } : { kind: 'meeting', found: false };
  }
  if (page.kind === 'project') {
    // deleted_at filter: a reused slug must resolve to the live row, and a
    // deleted project reads as not found.
    const p = await env.DB.prepare('SELECT title FROM projects WHERE (slug = ? OR id = ?) AND deleted_at IS NULL LIMIT 1')
      .bind(page.slug, page.slug).first<{ title: string | null }>();
    return p ? { kind: 'project', found: true, title: p.title ?? page.slug } : { kind: 'project', found: false };
  }
  return null;
}

/** The one-line "where was I launched from" header. Exported for tests. */
export function pageHeaderLine(page: LaunchPage, entity: PageEntity | null): string {
  if (page.kind === 'meeting') {
    const what = entity && entity.found && entity.kind === 'meeting'
      ? `"${oneLine(entity.title)}"${entity.date ? ` (${oneLine(entity.date, 40)})` : ''}, meeting id ${page.meetingId}`
      : `meeting id ${page.meetingId} (not found in the Hub)`;
    return `[Launched from the Hub meeting page: ${what} -- ${page.route}]`;
  }
  if (page.kind === 'project') {
    const what = entity && entity.found && entity.kind === 'project'
      ? `"${oneLine(entity.title)}", project slug ${page.slug}`
      : `project slug ${page.slug} (not found in the Hub)`;
    return `[Launched from the Hub project page: ${what} -- ${page.route}]`;
  }
  return `[Launched from the Hub: ${page.label} -- ${page.route}]`;
}

// The claim row: launch fields + the source task's context, fetched in ONE
// LEFT-JOINed query (task fields are NULL for context-free launches).
// task_pk is the join sentinel: task_id set but task_pk NULL = missing/deleted task.
type ClaimRow = {
  tag: string; seed: string; project_slug: string | null; task_id: string | null;
  page_route: string | null;
  task_pk: string | null; task_title: string | null; task_status: string | null;
  task_due: string | null; task_description: string | null; project_name: string | null;
};

// The task block (#485): when the launch carried a task_id (fired from a task
// compose surface), the claim query joins that task from D1 (the canonical
// arbiter — context is fresh at claim time, never a compose-time snapshot).
// task_id NULL or a missing task → no task block (a miss is logged). Header kept
// terse: it rides in front of Nick's seed and (on the mobile route) gets
// newline-collapsed onto one line by launch_remote_chat_v2, so inline ` · `
// separators stay readable.
function taskContextLines(row: ClaimRow): string[] {
  if (!row.task_id) return [];
  if (!row.task_pk) {
    // A stale/deleted task_id is not fatal — the launch still works, just without task context.
    console.warn(`[launch-log] claim: task_id ${row.task_id} not found (deleted or stale) — no task context`);
    return [];
  }
  const lines = [
    '[Task context — this task was open when you were launched]',
    `Task: ${oneLine(row.task_title) || '(untitled)'}`,
    `Status: ${oneLine(row.task_status, 40) || 'unknown'} · Due: ${oneLine(row.task_due, 40) || 'none'} · Project: ${oneLine(row.project_name) || 'none'}`,
  ];
  // Description flattened to one line too, so it cannot forge header lines;
  // it keeps its own longer cap.
  const desc = oneLine(row.task_description, SEED_DESC_MAX);
  if (desc) lines.push(`Description: ${desc}`);
  return lines;
}

/** Compose the session seed: [page line] + [task block] + blank line + raw
 *  seed. A launch with neither (a pre-v117 row from a non-task surface) returns
 *  the raw seed UNCHANGED, so old rows and old frontends behave as before. */
export function composeLaunchSeed(seed: string, pageLine: string | null, taskLines: string[]): string {
  const header = [...(pageLine ? [pageLine] : []), ...taskLines];
  return header.length ? `${header.join('\n')}\n\n${seed}` : seed;
}

// POST /api/launch-log/:id/claim — atomic single-use opaque-token claim; UNSCOPED (no requested_by filter).
// PI/API-key gated in-handler (isPiRequest — same idiom as bug-report.ts's
// handleListBugReports). Backlog #250: a team member must not be able to
// consume a pending mobile launch + read its seed even by guessing the
// opaque lnch_ id (queue privacy, defense-in-depth). Both live claimants pass
// unchanged because they already authenticate with Bearer PB_API_KEY:
// resolve_launch.py (the computer route, scripts/utils/resolve_launch.py::_claim)
// and hub_ai_listener.py (the mobile route, scripts/scheduled/hub_ai_listener.py).
// validateApiKey() matches that key against env.PB_API_KEY and isPiRequest()
// short-circuits true before ever touching CF Access. No browser caller hits
// this endpoint directly — the browser only POSTs /api/launch-log to mint a
// token; the OS protocol handler hands the opaque id to resolve_launch.py.
// Returns { verb, seed, project_slug } on success. 410 if token invalid, expired, or already consumed.
// The returned seed is the RAW stored seed enriched with the launching page and
// the source task's context (see composeLaunchSeed). Both PB claimants pass the
// seed through opaquely, so the context reaches the session with no PB change. (#485, #8935)
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
    `SELECT ll.tag, ll.seed, ll.project_slug, ll.task_id, ll.page_route,
            t.id AS task_pk, t.title AS task_title, t.status AS task_status,
            t.due_date AS task_due, t.description AS task_description,
            COALESCE(p.title, t.project_id) AS project_name
       FROM launch_log ll
       LEFT JOIN tasks t ON t.id = ll.task_id AND t.deleted_at IS NULL
       LEFT JOIN projects p ON p.id = t.project_id OR p.slug = t.project_id
      WHERE ll.id = ?`
  ).bind(id).first<ClaimRow>();
  const page = parseLaunchPage(row!.page_route);
  // The token is already consumed above, so a failed entity read must not 500:
  // fall back to the not-found line and log it.
  let entity: PageEntity | null = null;
  if (page) {
    try {
      entity = await lookupPageEntity(page, env);
    } catch (e) {
      console.warn(`[launch-log] claim ${id}: page entity lookup failed (${e instanceof Error ? e.message : String(e)}) — header says not found`);
      entity = page.kind === 'meeting' || page.kind === 'project' ? { kind: page.kind, found: false } : null;
    }
  }
  const pageLine = page ? pageHeaderLine(page, entity) : null;
  const seed = composeLaunchSeed(row!.seed, pageLine, taskContextLines(row!));
  return json({ data: { verb: row!.tag, seed, project_slug: row!.project_slug } });
}
