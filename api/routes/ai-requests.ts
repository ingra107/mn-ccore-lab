import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, projectRefToCanonical, resolveSlug, isPiRequest, getAuthUser } from '../helpers';
import { prepareActivityEntry } from '../lib/activity-entry';
import type { EntityType } from '../lib/activity-entry';
import { ARTIFACT_URL_RE } from '../lib/artifact-url';

// GET /api/ai-requests?status=&project_slug=&source_type=&source_id=
//
// REQUESTER-SCOPED (2026-07-22). This read returns `SELECT *` — the full prompt
// AND response — and it was gated only by `auth: 'authed'`, with no requester
// filter anywhere in the handler and none in TaskHermesReplies either. Any
// logged-in team member opening a task could therefore read every Hermes
// exchange on it, including someone else's. Unlike activity_entries, this table
// has NO visibility column, so there was no way to mark an exchange private:
// the lane structurally could not express what @me expresses. `requested_by`
// was already stored at creation and simply never consulted on read.
//
// PI / API-key callers keep seeing everything: the PB listener polls this
// endpoint for pending work, and the PI is the operator of his own system.
// `request` is REQUIRED, not optional. While it was optional, a caller that
// omitted it skipped the requester-scoping branch below and got every row back
// — full prompt and response — which is the exact leak the scoping was added to
// close. Required makes that call unrepresentable rather than merely unused.
export async function handleGetAIRequests(url: URL, env: Env, request: Request): Promise<Response> {
  const status = url.searchParams.get('status');
  const projectSlug = url.searchParams.get('project_slug');
  const sourceType = url.searchParams.get('source_type');
  const sourceId = url.searchParams.get('source_id');

  // #119: `landing_visibility` says where the answer will be posted: the
  // triggering activity entry's visibility ('author' = the asker alone, 'team'
  // = everyone who can read the thread), or NULL when source_id is not an
  // entry (the answer lives only on this requester-scoped row). The PB listener
  // attaches Nick's mail tools and repo access only to a private landing, and
  // reads a missing value as "not private". Computed, never stored: the one
  // fact lives on the entry, so it cannot drift.
  // activity-hidden-exempt: Hermes routing — a dismissed thread still receives its answer, so its visibility still governs it.
  let query = `SELECT ai_requests.*,
    (SELECT ae.visibility FROM activity_entries ae WHERE ae.id = ai_requests.source_id) AS landing_visibility
    FROM ai_requests WHERE 1=1`;
  const params: string[] = [];

  // Scope to the caller unless they're PI/service. `requested_by` holds the
  // EMAIL the request was made with, so compare on email and additionally on
  // the canonical slug — rows written through paths that stored a slug (or an
  // alias address) would otherwise become invisible to their own author, which
  // fails closed in the wrong direction: silently hiding your own history.
  if (!(await isPiRequest(request, env))) {
    const user = await getAuthUser(request, env);
    const email = user?.email ?? '';
    if (!email) {
      // Authenticated-but-unresolvable: return nothing rather than everything.
      return json({ data: [], count: 0, tokens: { input: 0, output: 0, tracked: 0 } });
    }
    query += ' AND (lower(requested_by) = lower(?) OR lower(requested_by) = lower(?))';
    params.push(email, user?.slug ?? '');
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (projectSlug) {
    query += ' AND project_slug = ?';
    params.push(projectSlug);
  }

  if (sourceType) {
    query += ' AND source_type = ?';
    params.push(sourceType);
  }

  if (sourceId) {
    query += ' AND source_id = ?';
    params.push(sourceId);
  }

  query += ' ORDER BY created_at DESC';

  // N7b — usage rollup across ALL requests (not just the filtered page).
  // One batched round-trip (/simplify: was two sequential awaits).
  const [result, tokensRes] = await env.DB.batch([
    env.DB.prepare(query).bind(...params),
    env.DB.prepare(
      'SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COUNT(input_tokens) AS tracked FROM ai_requests'
    ),
  ]);
  const tokens = (tokensRes.results as { input: number; output: number; tracked: number }[] | undefined)?.[0];
  const rows = (result.results || []) as Record<string, unknown>[];
  return json({
    data: rows.map(withoutClaimToken),
    count: rows.length,
    tokens: tokens ?? { input: 0, output: 0, tracked: 0 },
  });
}

/**
 * schema-v140: the claim token is the fence on a claimed request's answer, so
 * it leaves the Hub only in the /claim response, to the PI/service caller that
 * acquired it. Every other read of an ai_requests row goes out through this.
 */
function withoutClaimToken<T extends Record<string, unknown>>(row: T): Omit<T, 'claim_token'> {
  const { claim_token: _token, ...rest } = row;
  return rest;
}

/**
 * Derive the entity routing token (`task: <id>` / `project: <id>`) that the PB
 * listener resolves into a readable context block — title, status, description,
 * comment thread (hub_ai_listener.build_entity_context).
 *
 * dispatchHermes() sets that token for @hermes MENTIONS inside a comment. The
 * typed "@hermes …" PREFIX surfaces (hermesRouting.ts → source_type
 * 'daily_thought', source_id = <task_id>) posted here directly and never set it,
 * so those requests reached the fenced model as a bare question with zero
 * awareness of the task they were asked on. Deriving it at this INSERT — the one
 * chokepoint every poster passes through — means no surface has to remember the
 * token, now or later.
 *
 * Prefix discrimination is the contract _hermesNotifyLink already relies on
 * (#521): entity ids are always `task_<ulid>` / `proj_<ulid>` (generateId), which
 * a date-key source_id (the Today bar's `YYYY-MM-DD`) or an activity-entry id
 * (32-char hex, what dispatchHermes passes) can never collide with.
 */
function deriveEntityContext(sourceId: string): string | null {
  if (sourceId.startsWith('task_')) return `task: ${sourceId}`;
  if (sourceId.startsWith('proj_')) return `project: ${sourceId}`;
  return null;
}

// POST /api/ai-requests — create a new AI request
export async function handleCreateAIRequest(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    source_type: string;
    source_id: string;
    project_slug?: string;
    prompt: string;
    context?: string;
  };

  if (!body.source_type || !body.source_id || !body.prompt?.trim()) {
    return error('source_type, source_id, and prompt are required', 400);
  }

  // Z3.2: canonicalize project_slug before insert so stored refs are stable
  // slugs (not raw ids or stale aliases). Unresolvable refs store NULL.
  const canonicalProjectSlug = body.project_slug
    ? await projectRefToCanonical(env, body.project_slug)
    : null;

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.source_type,
    body.source_id,
    canonicalProjectSlug,
    body.prompt.trim(),
    body.context || deriveEntityContext(body.source_id),
    user.email,
  ).run();

  const created = await env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return json({ data: created ? withoutClaimToken(created) : null }, 201);
}

// ── schema-v140: one answer per ask ────────────────────────────────────────────
//
// Nick, 2026-10-14: "Hermes can't answer the same @claude ask twice ... Build
// it?" -> "Build it (Recommended)". The failover build lets two listeners run
// for hours during a hand-back, and this route used to accept every answer
// unconditionally. The claim protocol (PB plan
// Scratch/plans/2026-10-14-hermes-claim-reconciled.md):
//
//   POST /api/ai-requests/queue        sweep exhausted claims, list claimable rows
//   POST /api/ai-requests/:id/claim    acquire: a fresh token, a 20-minute lease
//   POST /api/ai-requests/:id/release  give a lease back after a known transient
//   POST /api/ai-requests/:id/response the terminal answer, fenced by the token
//
// A claimed row stays status='pending'; ownership lives in the claim columns.
// claimed_by is diagnostic only: the TOKEN is the authority, and a takeover
// mints a new one, so a late answer from a superseded holder is refused even
// when both holders report the same machine name. All four routes are
// PI/service only (/response was `auth: 'authed'`: any signed-in member could
// post an answer to anyone's ask).

/** One lease. More than 3x the longest one-row path (300s CLI + 30s HTTP calls), reconciled plan decision 4. */
export const AI_CLAIM_TTL_SECONDS = 20 * 60;
/** Acquisitions per request; the CHECK in schema-v140 holds the same bound. */
export const AI_CLAIM_MAX_ATTEMPTS = 3;

// D1's clock, unix seconds. claim_expires_at is compared only against this.
const NOW_S = "CAST(strftime('%s', 'now') AS INTEGER)";
// A lease is live while claim_expires_at > now. Released and revoked rows carry
// no token, so they are free whatever their expiry says.
const FREE_LEASE = `(claim_token IS NULL OR claim_expires_at <= ${NOW_S})`;
const CLAIMABLE = `status = 'pending' AND claim_attempts < ${AI_CLAIM_MAX_ATTEMPTS} AND ${FREE_LEASE}`;
const EXHAUSTED = `status = 'pending' AND claim_attempts >= ${AI_CLAIM_MAX_ATTEMPTS} AND ${FREE_LEASE}`;
/** The terminal reason the sweep writes. Never published: failed rows reach no feed and notify no one. */
export const AI_CLAIM_SWEEP_REASON =
  `Hermes took this request ${AI_CLAIM_MAX_ATTEMPTS} times and never finished it, so it was marked failed. Ask again to retry.`;

// The queue's projection. Never claim_token.
const QUEUE_COLS = 'id, source_type, source_id, project_slug, prompt, context, status, requested_by, created_at, claim_attempts, claimed_by, claim_expires_at';

const PI_ONLY = 'Forbidden — PI or service access only';

interface AIRequestRow {
  id: string;
  source_type: string;
  source_id: string;
  project_slug: string | null;
  requested_by: string | null;
  prompt: string;
  status: string | null;
  response: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  claim_token: string | null;
  claim_attempts: number;
  [k: string]: unknown;
}

async function readRequest(env: Env, id: string): Promise<AIRequestRow | null> {
  return env.DB.prepare('SELECT * FROM ai_requests WHERE id = ?').bind(id).first<AIRequestRow>();
}

// POST /api/ai-requests/queue — the listener's poll. Two things in one batch:
// a request whose third lease is gone is marked failed (no public diagnostic:
// failed rows reach no feed and notify no one), and the rows a runner may claim
// now are listed oldest first. Listing grants nothing; only /claim does.
// `swept` names the rows THIS call failed. The sweep stamps its own commit id,
// so two concurrent polls cannot both report the same row, and the listener
// alerts Nick once per row.
export async function handleAIRequestQueue(request: Request, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) return error(PI_ONLY, 403);
  const sweepId = generateId();
  const [, swept, claimable] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ai_requests SET status = 'failed', response = ?, responded_at = datetime('now'), response_commit_id = ?
        WHERE ${EXHAUSTED}`
    ).bind(AI_CLAIM_SWEEP_REASON, sweepId),
    env.DB.prepare(
      'SELECT id, source_type, source_id, requested_by, claimed_by, claim_attempts FROM ai_requests WHERE response_commit_id = ?'
    ).bind(sweepId),
    env.DB.prepare(`SELECT ${QUEUE_COLS} FROM ai_requests WHERE ${CLAIMABLE} ORDER BY created_at ASC, id ASC`),
  ]);
  return json({ data: claimable.results ?? [], swept: swept.results ?? [] });
}

// POST /api/ai-requests/:id/claim  body {machine?}
// One conditional UPDATE is the arbiter: only `changes === 1` grants the run,
// and D1 applies one writer at a time, so two simultaneous claims cannot both
// win. The same compare-and-set as handleClaimLaunch (launch-log.ts), with a
// reclaim generation that launches do not need. Returns the row the runner
// works on (with landing_visibility, as the GET computes it), never a
// minutes-old feed snapshot, plus the token its answer must carry.
export async function handleClaimAIRequest(id: string, request: Request, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) return error(PI_ONLY, 403);
  let machine: string | null = null;
  try {
    const body = await request.json() as { machine?: unknown };
    if (typeof body?.machine === 'string') machine = body.machine.trim().slice(0, 120) || null;
  } catch {
    // Total fallback on the next line: a bodyless claim is legal, and
    // claimed_by is diagnostic only.
    machine = null;
  }
  const token = crypto.randomUUID();
  const won = await env.DB.prepare(
    `UPDATE ai_requests
        SET claimed_by = ?, claim_token = ?, claim_expires_at = ${NOW_S} + ${AI_CLAIM_TTL_SECONDS},
            claim_attempts = claim_attempts + 1
      WHERE id = ? AND ${CLAIMABLE}`
  ).bind(machine, token, id).run();
  if (won.meta.changes !== 1) return claimRefusal(env, id);

  // activity-hidden-exempt: Hermes routing — a dismissed thread still receives its answer, so its visibility still governs it.
  const row = await env.DB.prepare(
    `SELECT ai_requests.*,
       (SELECT ae.visibility FROM activity_entries ae WHERE ae.id = ai_requests.source_id) AS landing_visibility
       FROM ai_requests WHERE id = ?`
  ).bind(id).first<AIRequestRow & { claim_expires_at: number }>();
  return json({
    data: withoutClaimToken(row!),
    claim: { token, expires_at: row!.claim_expires_at, attempt: row!.claim_attempts },
  });
}

async function claimRefusal(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT status, claim_attempts, (claim_token IS NOT NULL AND claim_expires_at > ${NOW_S}) AS held
       FROM ai_requests WHERE id = ?`
  ).bind(id).first<{ status: string | null; claim_attempts: number; held: number }>();
  if (!row) return error('AI request not found', 404);
  if (row.status !== 'pending') return json({ error: 'AI request already has its answer', reason: 'terminal' }, 409);
  if (row.held) return json({ error: 'AI request is claimed by another runner', reason: 'held' }, 409);
  return json({ error: `AI request has used all ${AI_CLAIM_MAX_ATTEMPTS} claims`, reason: 'exhausted' }, 409);
}

// POST /api/ai-requests/:id/release  body {claim_token}
// A runner that hit a KNOWN transient failure (backlog lock busy, a failed
// artifact /revise) gives the lease back so the next poll can retry at once
// instead of after the TTL. The attempt count is kept: three transients in a
// row exhaust the request like three crashes would.
export async function handleReleaseAIRequest(id: string, request: Request, env: Env): Promise<Response> {
  if (!(await isPiRequest(request, env))) return error(PI_ONLY, 403);
  const body = await request.json() as { claim_token?: unknown };
  const token = typeof body?.claim_token === 'string' ? body.claim_token : '';
  if (!token) return error('claim_token is required', 400);
  const res = await env.DB.prepare(
    `UPDATE ai_requests SET claim_token = NULL, claimed_by = NULL, claim_expires_at = ${NOW_S}
      WHERE id = ? AND status = 'pending' AND claim_token = ?`
  ).bind(id, token).run();
  if (res.meta.changes === 1) return json({ data: { id, released: true } });
  const exists = await env.DB.prepare('SELECT 1 AS one FROM ai_requests WHERE id = ?').bind(id).first();
  if (!exists) return error('AI request not found', 404);
  return json({ error: 'This token does not hold the claim', reason: 'not_held' }, 409);
}

// POST /api/ai-requests/:id/response — the terminal answer (for the PB listener).
//
// FENCED (schema-v140). A request that has ever been claimed takes its answer
// only from the CURRENT, unexpired claim token. A tokenless (legacy) answer
// wins only while the row has never been claimed (claim_attempts = 0, no
// token); once claimed, every tokenless answer loses. So an old listener can
// still answer a row nobody claimed, and cannot answer one a new listener holds.
//
// ONE TRANSACTION. Acceptance, the timeline write and the notification are one
// D1 batch. Every statement after the acceptance UPDATE is guarded on the fresh
// response_commit_id that UPDATE stamps, so a losing submission (its UPDATE
// matched nothing) publishes nothing, and a failure anywhere rolls the
// acceptance back with it: a row can no longer be completed while its
// placeholder still says "Thinking". The old shape ran three separate awaited
// writes after an unconditional UPDATE.
//
// A TERMINAL row answers a replay, never a rewrite: the identical submission
// (same status, text, usage and token) returns 200 with zero writes, which is
// what a listener that lost the HTTP acknowledgement needs; anything else is a
// 409. The schema-v140 triggers refuse a rewrite underneath this too.
//
// Publication (T4, Hermes wave Phase 3, #98, #119): the answer goes into the
// 'Thinking...' placeholder bound to THIS request (source_table='ai_requests',
// source_id=<id>), or, for a request already in flight when #119 deployed, a
// keyless placeholder in the same thread at the trigger's own visibility, or,
// when there is none, a fresh comment in the asking thread (now stamped with
// the same request key). Routing is by the triggering entry's OWN entity_type,
// and a source_id that is not an activity entry (a legacy daily_thought
// task/date key, 'direct') publishes nothing. A failed answer publishes
// nothing and notifies no one.
export async function handleUpdateAIResponse(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) return error(PI_ONLY, 403);
  const body = await request.json() as {
    response: string;
    status?: string;
    // N7b (schema v82): per-generation usage from the listener's
    // `claude --print --output-format json` call. Optional — older listeners
    // omit them and the columns stay NULL.
    input_tokens?: number;
    output_tokens?: number;
    // schema-v140: the token /claim returned. Absent from a legacy listener.
    claim_token?: string;
  };

  if (!body.response?.trim()) {
    return error('response is required', 400);
  }

  const status = body.status || 'completed';
  if (!['completed', 'failed'].includes(status)) {
    return error('status must be completed or failed', 400);
  }

  const responseText = body.response.trim();
  const inTok = Number.isFinite(body.input_tokens) ? Math.max(0, Math.round(body.input_tokens as number)) : null;
  const outTok = Number.isFinite(body.output_tokens) ? Math.max(0, Math.round(body.output_tokens as number)) : null;
  const token = typeof body.claim_token === 'string' && body.claim_token !== '' ? body.claim_token : null;
  const submitted: Submission = { status, response: responseText, inTok, outTok, token };

  const current = await readRequest(env, id);
  if (!current) return error('AI request not found', 404);
  if (current.status !== 'pending') return replayOrConflict(current, submitted);

  const commitId = generateId();
  const guard: Guard = { sql: 'EXISTS (SELECT 1 FROM ai_requests WHERE id = ? AND response_commit_id = ?)', binds: [id, commitId] };
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE ai_requests
          SET response = ?, status = ?, responded_at = datetime('now'),
              input_tokens = ?, output_tokens = ?, response_commit_id = ?
        WHERE id = ? AND status = 'pending' AND (
              (? IS NOT NULL AND claim_token = ? AND claim_expires_at > ${NOW_S})
           OR (? IS NULL AND claim_token IS NULL AND claim_attempts = 0))`
    ).bind(responseText, status, inTok, outTok, commitId, id, token, token, token),
  ];
  if (status === 'completed') {
    stmts.push(...await _hermesPublication(env, current, responseText, guard));
    stmts.push(...await _submitterNotification(env, current, responseText, guard));
  }

  const results = await env.DB.batch(stmts);
  if (results[0]?.meta?.changes === 1) {
    const updated = await readRequest(env, id);
    return json({ data: withoutClaimToken(updated!) });
  }

  // Lost: the row moved under us (another answer landed) or the submission
  // does not hold the claim. Nothing in the batch wrote.
  const now = await readRequest(env, id);
  if (!now) return error('AI request not found', 404);
  if (now.status !== 'pending') return replayOrConflict(now, submitted);
  return json({
    error: 'This request is claimed, and the submission does not carry its current, unexpired claim token',
    reason: 'claim_not_held',
  }, 409);
}

interface Submission {
  status: string;
  response: string;
  inTok: number | null;
  outTok: number | null;
  token: string | null;
}

/** A terminal row: the identical submission is a replay (200, no writes); anything else is a 409. */
function replayOrConflict(row: AIRequestRow, s: Submission): Response {
  const same =
    row.status === s.status &&
    row.response === s.response &&
    (row.input_tokens ?? null) === s.inTok &&
    (row.output_tokens ?? null) === s.outTok &&
    (row.claim_token ?? null) === s.token;
  if (same) return json({ data: withoutClaimToken(row), replay: true });
  return json({ error: 'AI request already has its answer', reason: 'terminal' }, 409);
}

type Guard = { sql: string; binds: unknown[] };

/**
 * The timeline write for a completed answer, as statements for the acceptance
 * batch, every one guarded on the batch's commit id. Reads only; writes nothing.
 * Returns no statement when the answer has nowhere to land.
 */
async function _hermesPublication(
  env: Env,
  req: AIRequestRow,
  responseText: string,
  guard: Guard,
): Promise<D1PreparedStatement[]> {
  // Resolve the triggering entry FIRST — it is the source of truth for where the
  // answer lands. Routing by the entry's OWN entity_type (not by source_type) is
  // what lets a 'day' ask (source_type='daily_thought') thread its answer back
  // correctly; source_type only ever mattered as a proxy for this (Hermes wave P3).
  // activity-hidden-exempt: Hermes response routing — the answer must land in
  // the asking thread even if the user dismissed it while Hermes was thinking.
  const trigEntry = await env.DB.prepare(
    'SELECT entity_id, entity_type, visibility, parent_id, id FROM activity_entries WHERE id = ? LIMIT 1'
  ).bind(req.source_id).first<{ entity_id: string; entity_type: string; visibility: string; parent_id: string | null; id: string }>();

  if (!trigEntry) {
    // source_id isn't an activity_entries id (a legacy daily_thought task/date
    // key, or a deleted entry) — nothing to anchor the response to; skip silently.
    console.warn('[handleUpdateAIResponse] triggering activity entry not found for source_id=%s', req.source_id);
    return [];
  }

  const entityType = trigEntry.entity_type as EntityType;
  const entityId = trigEntry.entity_id;
  const visibility = (trigEntry.visibility === 'author' ? 'author' : 'team') as 'author' | 'team';
  // #98: the thread this answer belongs to — a reply's root, or the entry
  // itself when the ask was top-level.
  const threadRootId = trigEntry.parent_id ?? trigEntry.id;

  // Find THIS request's 'Thinking...' placeholder (#119).
  //
  // dispatchHermes stamps the placeholder (source_table='ai_requests',
  // source_id=<this request's id>), so the answer has exactly one row it may
  // write. The lookup used to take the NEWEST claude-ai placeholder in the
  // thread, which let two asks in one thread swap answers, and let a private
  // (@me) answer overwrite a TEAM placeholder -- publishing it to everyone who
  // can read the thread. The row is written once: a second answer to this
  // request is refused before it gets here (the fence above).
  // activity-hidden-exempt: placeholder resolution — the 'Thinking…' row must be
  // found and updated even if the thread was dismissed, or it dangles forever.
  let placeholder = await env.DB.prepare(
    `SELECT id FROM activity_entries
     WHERE source_table = 'ai_requests' AND source_id = ?
     LIMIT 1`
  ).bind(req.id).first<{ id: string }>();

  // Keyless placeholders: requests already in flight when #119 deployed. Same
  // thread (or the pre-#98 NULL-parent shape), and -- the #119 half -- only at
  // the TRIGGER's own visibility, so the fallback can never move a private
  // answer into a team row. On a miss the answer is inserted fresh below, at
  // the trigger's visibility.
  if (!placeholder) {
    // activity-hidden-exempt: legacy placeholder fallback — same reason as above.
    placeholder = await env.DB.prepare(
      `SELECT id FROM activity_entries
       WHERE entity_type = ? AND entity_id = ? AND actor_slug = 'claude-ai'
         AND kind = 'comment' AND body LIKE 'Thinking about this%'
         AND source_table IS NULL AND visibility = ?
         AND (parent_id = ? OR parent_id IS NULL)
       ORDER BY (parent_id IS NULL), created_at DESC LIMIT 1`
    ).bind(entityType, entityId, visibility, threadRootId).first<{ id: string }>();
  }

  if (placeholder) {
    // UPDATE the placeholder body in place — no duplicate row. schema-v103:
    // also stamp answered_at. created_at stays fixed at ASK time (the
    // placeholder's own insert moment) forever, so answered_at must be set
    // HERE or it never gets set at all. The private-Hermes-answer arm in
    // api/routes/seen.ts reads it via COALESCE(answered_at, created_at).
    return [
      env.DB.prepare(
        `UPDATE activity_entries SET body = ?, answered_at = datetime('now') WHERE id = ? AND ${guard.sql}`
      ).bind(responseText, placeholder.id, ...guard.binds),
    ];
  }

  // No placeholder: a fresh comment as the AI actor, in the asking thread, at
  // the trigger's visibility. prepareActivityEntry is postActivityEntry's own
  // decision half (validation, parent inheritance, project derivation), so the
  // row is the one postActivityEntry would write; it carries the request key
  // too, which makes a second fresh answer for this request unrepresentable
  // under the partial UNIQUE(source_table, source_id) index. The row gets no
  // side effects (fireSideEffects=false was the old call), and no artifact
  // key_link hook: the placeholder path never had one either.
  let taskProjectId: string | null | undefined;
  if (entityType === 'task') {
    const taskRow = await env.DB.prepare('SELECT project_id FROM tasks WHERE id = ? LIMIT 1')
      .bind(entityId).first<{ project_id: string | null }>();
    taskProjectId = taskRow?.project_id ?? null;
  }
  const prep = await prepareActivityEntry({
    env,
    user: { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' },
    entityType,
    entityId,
    kind: 'comment',
    body: responseText,
    actorSlug: 'claude-ai',
    visibility,
    taskProjectId,
    fireSideEffects: false,
    // #98: land in the asking thread, same as the placeholder would have.
    parentId: threadRootId,
    sourceTable: 'ai_requests',
    sourceId: req.id,
  });
  if (!prep.ok) {
    // The entity is gone or the thread refuses a reply. The answer still
    // completes the request (it is on the requester-scoped row), exactly as a
    // failed postActivityEntry left it before.
    console.warn('[handleUpdateAIResponse] answer for %s not published: %s', req.id, prep.error);
    return [];
  }
  const placeholders = prep.binds.map(() => '?').join(', ');
  return [
    env.DB.prepare(
      `INSERT INTO activity_entries ${prep.cols} SELECT ${placeholders}, datetime('now') WHERE ${guard.sql}`
    ).bind(...prep.binds, ...guard.binds),
    // schema-v103: this row's created_at IS its answer time, but seen.ts reads
    // one COALESCE(answered_at, created_at) with no branch for which write
    // produced the row, so answered_at is set by construction, not by accident.
    env.DB.prepare(
      `UPDATE activity_entries SET answered_at = datetime('now') WHERE id = ? AND ${guard.sql}`
    ).bind(prep.id, ...guard.binds),
  ];
}

/**
 * Notify the ai_request's submitter that Hermes has replied, as a statement for
 * the acceptance batch.
 *
 * Fires for ALL source_types (daily_thought, task_comment, project_comment,
 * artifact_comment, and any future types). Skips when requested_by is absent.
 * At most one notification per (recipient_slug, 'ai_request', req.id): the
 * NOT EXISTS sits in the same statement as the INSERT, and the statement is
 * guarded on the commit id, so a losing submission never notifies.
 */
async function _submitterNotification(
  env: Env,
  req: AIRequestRow,
  responseText: string,
  guard: Guard,
): Promise<D1PreparedStatement[]> {
  if (!req.requested_by) return [];
  const recipientSlug = await resolveSlug(env, req.requested_by);
  if (!recipientSlug) return [];
  const link = await _hermesNotifyLink(env, req, responseText);
  const title = `Hermes replied to: ${req.prompt.slice(0, 60)}`;
  return [
    env.DB.prepare(
      `INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link)
       SELECT ?, ?, 'update', 'ai_request', ?, ?, NULL, ?
        WHERE ${guard.sql}
          AND NOT EXISTS (SELECT 1 FROM notifications WHERE recipient_slug = ? AND source_type = 'ai_request' AND source_id = ?)`
    ).bind(generateId(), recipientSlug, req.id, title, link, ...guard.binds, recipientSlug, req.id),
  ];
}

/**
 * Resolve the deep-link for a Hermes reply notification.
 *
 * Priority order:
 *   1. Artifact URL embedded in the response text (Hermes produced an artifact).
 *   2. Source-surface fallback keyed on source_type:
 *      - daily_thought, source_id = task_<ulid> → /portal/my-tasks?openTask=<task_id>
 *        (#521: a typed @hermes prefix on a task compose surface — TaskDetailPanel,
 *        SmartCompose task mode — posts source_type='daily_thought' with the TASK id
 *        as source_id, per hermesRouting.ts's contract; task ids are always
 *        `task_<ulid>` (generateId('task')), which a date-key source_id (the
 *        Today-bar's `YYYY-MM-DD`) can never collide with)
 *      - daily_thought, source_id = date-key → /today (the Today-bar's own
 *        MorningThoughtCompose)
 *      - task_comment  → /portal/my-tasks?open=<task_id>
 *      - project_comment → /portal/projects/<slug>
 *      - artifact_comment → /portal/artifacts/<artifact_id>
 *      - other → /portal/dashboard
 */
async function _hermesNotifyLink(
  env: Env,
  req: { source_type: string; source_id: string; project_slug: string | null },
  responseText: string,
): Promise<string | null> {
  // An artifact URL in the response takes priority over the source surface.
  const artMatch = responseText.match(ARTIFACT_URL_RE);
  if (artMatch) {
    const relPath = artMatch[0].match(/\/portal\/artifacts\/art_[0-9a-f]+/i);
    if (relPath) return relPath[0];
  }

  switch (req.source_type) {
    case 'daily_thought':
      return req.source_id.startsWith('task_')
        ? `/portal/my-tasks?openTask=${encodeURIComponent(req.source_id)}`
        : '/today';
    case 'task_comment': {
      // activity-hidden-exempt: redirect-link routing — resolve the entity a
      // notification points at regardless of the thread's dismiss state.
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/my-tasks?open=${entry.entity_id}` : '/portal/my-tasks';
    }
    case 'project_comment':
      return req.project_slug ? `/portal/projects/${req.project_slug}` : '/portal/overview';
    case 'artifact_comment': {
      // activity-hidden-exempt: redirect-link routing — same as task_comment above.
      const entry = await env.DB.prepare(
        'SELECT entity_id FROM activity_entries WHERE id = ? LIMIT 1'
      ).bind(req.source_id).first<{ entity_id: string }>();
      return entry ? `/portal/artifacts/${entry.entity_id}` : '/portal/artifacts';
    }
    default:
      return '/portal/dashboard';
  }
}
