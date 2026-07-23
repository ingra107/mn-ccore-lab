// api/routes/artifacts.ts — Hermes Artifacts v1.
//
// Design ref: docs/superpowers/plans/2026-06-11-hermes-artifacts-design.md.
//
// Artifacts are link-shareable, interactive long-form deliverables. Markdown is
// the source; /portal/artifacts/:id renders it. The interactive loop rides the
// existing unified activity timeline — artifact comments write activity_entries
// (entity_type='artifact'), @hermes mentions create ai_requests
// (source_type='artifact_comment'), and the listener regenerates → POST
// /:id/revise → version++, old body archived to artifact_versions.
//
// These are HUB-ONLY tables (schema-v79) — NO Peripheral Brain lockstep. Raw
// INSERT/UPDATE here is fine: the route_no_raw_writes invariant guards only
// tasks/projects (the conflict-semantics tables), not artifacts.

import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, resolveActor, isPiRequest } from '../helpers';

// ── id mint ───────────────────────────────────────────────────────────────────
// 'art_'-prefixed random hex (mirrors the conceptual 'ae_' scheme in
// activity-entry.ts — generateId() yields the underlying 32-char hex).
function mintArtifactId(): string {
  return `art_${generateId()}`;
}

interface ArtifactRow {
  id: string;
  title: string;
  body_md: string;
  version: number;
  task_id: string | null;
  project_id: string | null;
  created_by: string;
  // schema-v94: content_type/visibility — see api/routes/public-artifact.ts for
  // the public GET /a/:id consumer of these two columns.
  content_type: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

// schema-v94 allow-lists. Any value outside these is rejected 400 in
// handleCreateArtifact; the DB CHECK constraints (schema-v94-artifact-visibility.sql)
// are the backstop for writers that bypass this route.
const ALLOWED_CONTENT_TYPES = new Set(['markdown', 'html']);
const ALLOWED_VISIBILITIES = new Set(['team', 'public']);

// Abuse cap on stored body size. ~2M chars comfortably fits rich self-contained
// HTML artifacts (inline CSS/JS + reasonably-sized data: URI images) while
// bounding the blast radius of a single D1 row / worker-memory allocation from
// a malicious or buggy caller — a clear 400 here beats an opaque D1/worker
// failure further downstream for an oversized payload.
const MAX_BODY_MD_LENGTH = 2_000_000;

// ── GET /api/artifacts?since=&limit= ────────────────────────────────────────────
// List artifacts newest-first. `?since=` (ISO/SQL UTC) filters updated_at > since
// for the PB vault-collection poller (design §5). `?limit=` caps the page (default
// 50, max 200).
export async function handleGetArtifacts(url: URL, env: Env): Promise<Response> {
  const since = url.searchParams.get('since');
  const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

  let query = 'SELECT * FROM artifacts';
  const binds: (string | number)[] = [];
  if (since) {
    query += ' WHERE updated_at > ?';
    binds.push(since);
  }
  query += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
  binds.push(limit);

  const result = await env.DB.prepare(query).bind(...binds).all();
  return json({ data: result.results || [], count: result.results?.length || 0 });
}

// ── GET /api/artifacts/:id ──────────────────────────────────────────────────────
// Single artifact + its version history (newest-first). The page renders body_md
// and offers the history dropdown from `versions`.
export async function handleGetArtifact(id: string, env: Env): Promise<Response> {
  // One D1 round-trip for both reads — the page always wants artifact + history.
  const [artifactRes, versionsRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM artifacts WHERE id = ? LIMIT 1').bind(id),
    env.DB.prepare(
      'SELECT artifact_id, version, revised_by, revision_note, created_at FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC'
    ).bind(id),
  ]);
  const artifact = (artifactRes.results as ArtifactRow[] | undefined)?.[0];
  if (!artifact) return error('Artifact not found', 404);

  return json({ data: { ...artifact, versions: versionsRes.results || [] } });
}

// ── key_link slot helpers ────────────────────────────────────────────────────
// Slot model (resolver + desc cap + row shape) is shared with the at-source
// comment-path hook in lib/activity-entry.ts — SSOT in lib/key-link.ts so the
// two backfill paths can't drift.
import { resolveKeyLinkSlot, hermesKeyLinkDesc, type TaskKeyLinkRow } from '../lib/key-link';
// #196: also mirror the artifact into the synced `links` table (the P5 readers
// were cut over to it; a slot-only link is invisible on TODAY.md).
import { mirrorArtifactLink } from '../lib/artifact-link-mirror';

// ── POST /api/artifacts ─────────────────────────────────────────────────────────
// Create an artifact. Callable by Hermes (API key → created_by='claude-ai' when
// the body says so) and by authed team members. Body:
//   { title, body_md, task_id?, project_id?, created_by?, content_type?, visibility? }
// project_id is stored as-given (typed proj_* per Slice-C convention — the caller
// passes the canonical id; we do not slug-resolve here).
//
// schema-v94: content_type ('markdown' default | 'html') + visibility ('team'
// default | 'public') — omitting either preserves pre-v94 behavior exactly.
// 'public' + 'html' is the only combination the new public GET /a/:id route
// (api/routes/public-artifact.ts) will ever serve; every other combination
// 404s there. An out-of-allow-list value is rejected 400, never coerced.
//
// Level-1 invariant: when task_id is supplied, the artifact CANNOT be created
// without attempting to link it — the INSERT(artifact) and UPDATE(task key_link)
// are executed in a single DB.batch([...]) call. If the task row is missing or all
// 3 slots are full, the artifact is still created but no link is written (both
// cases are logged via the returned linkSkipped flag in the response — not a
// failure, just transparent).
export async function handleCreateArtifact(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    title?: string;
    body_md?: string;
    task_id?: string | null;
    project_id?: string | null;
    created_by?: string;
    content_type?: string;
    visibility?: string;
  };

  if (!body.title?.trim()) return error('title required', 400);
  if (!body.body_md?.trim()) return error('body_md required', 400);
  if (body.body_md.length > MAX_BODY_MD_LENGTH) {
    return error(`body_md exceeds maximum size (${MAX_BODY_MD_LENGTH.toLocaleString()} chars)`, 400);
  }

  // schema-v94: content_type/visibility are optional — omitting either preserves
  // today's behavior exactly (markdown, team). A caller that supplies a value
  // outside the allow-list is rejected, not silently coerced to the default.
  if (body.content_type !== undefined && !ALLOWED_CONTENT_TYPES.has(body.content_type)) {
    return error(`content_type must be one of: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`, 400);
  }
  if (body.visibility !== undefined && !ALLOWED_VISIBILITIES.has(body.visibility)) {
    return error(`visibility must be one of: ${[...ALLOWED_VISIBILITIES].join(', ')}`, 400);
  }
  const contentType = body.content_type ?? 'markdown';
  const visibility = body.visibility ?? 'team';

  // Resolve the author. claude-ai (Hermes) is always allowed; impersonating a
  // specific team slug requires PI/service authority (resolveActor enforces).
  const actor = await resolveActor(env, user, body.created_by, {
    allowImpersonation: await isPiRequest(request, env),
  });
  if ('error' in actor) return error(actor.error, 400);

  const id = mintArtifactId();
  const taskId = body.task_id || null;

  // Build the artifact INSERT statement (always executed).
  const insertArtifact = env.DB.prepare(
    `INSERT INTO artifacts (id, title, body_md, version, task_id, project_id, created_by, content_type, visibility, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    id,
    body.title.trim(),
    body.body_md,
    taskId,
    body.project_id || null,
    actor.slug,
    contentType,
    visibility,
  );

  // When task_id is provided, attempt to backfill the first empty key_link slot
  // atomically. We must SELECT the task first to know which slot to target — then
  // include both the INSERT and the UPDATE in one batch so they land together.
  let linkSkipped: string | null = null;

  if (taskId) {
    const task = await env.DB
      .prepare('SELECT key_link_1, key_link_2, key_link_3 FROM tasks WHERE id = ? LIMIT 1')
      .bind(taskId)
      .first<TaskKeyLinkRow>();

    if (!task) {
      // Task not found — create artifact anyway, note the skip.
      linkSkipped = 'task_not_found';
      await insertArtifact.run();
    } else {
      // Derive the absolute portal URL for the new artifact (origin from the
      // inbound request, not hardcoded — works on staging + prod).
      const origin = new URL(request.url).origin;
      const artifactUrl = `${origin}/portal/artifacts/${id}`;
      const { slot, alreadyPresent } = resolveKeyLinkSlot(task, artifactUrl);

      if (alreadyPresent) {
        // Idempotent — URL already in a slot; just create the artifact.
        linkSkipped = 'already_linked';
        await insertArtifact.run();
      } else if (slot === null) {
        // All 3 slots occupied — still create the artifact, skip the link.
        linkSkipped = 'slots_full';
        await insertArtifact.run();
      } else {
        // Atomically insert artifact + write the link in one batch round-trip.
        // anti-pattern-allowed: compound batch (insertArtifact + key_link update) requires
        // atomicity that routing through /api/mutations would break; key_link_N slots are
        // a write-once link cache, not A3-conflict-resolution targets (no base_seq/hash).
        const desc = hermesKeyLinkDesc(body.title);
        const updateTask = env.DB.prepare(
          `UPDATE tasks SET key_link_${slot} = ?, key_link_${slot}_desc = ? WHERE id = ?`
        ).bind(artifactUrl, desc, taskId);
        await env.DB.batch([insertArtifact, updateTask]);
      }

      // #196: mirror into the synced links table so the P5 readers render the
      // artifact link — regardless of slot outcome (already_linked / slots_full
      // / freshly slotted), since the links table is uncapped. Idempotent +
      // never throws; the slot is the recoverable fallback.
      await mirrorArtifactLink(env, 'tasks', taskId, artifactUrl, hermesKeyLinkDesc(body.title), user);
    }
  } else {
    // No task_id — plain artifact create, no link attempt.
    await insertArtifact.run();
  }

  const created = await env.DB.prepare('SELECT * FROM artifacts WHERE id = ?').bind(id).first<ArtifactRow>();
  return json({ data: created, ...(linkSkipped ? { linkSkipped } : {}) }, 201);
}

// ── POST /api/artifacts/:id/revise ──────────────────────────────────────────────
// Revise an artifact: archive the CURRENT body to artifact_versions, then replace
// body_md (and optionally title) and bump version. Body:
//   { body_md, revision_note?, title?, revised_by? }
//
// Idempotency / provenance: the archived row is (artifact_id, CURRENT version) —
// the PK makes a re-applied archive a no-op (INSERT OR IGNORE). version is bumped
// from the row's own current value (read-modify-write in one logical step), so
// concurrent revises can't both land version N (the second sees N+1).
export async function handleReviseArtifact(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    body_md?: string;
    revision_note?: string | null;
    title?: string | null;
    revised_by?: string;
  };

  if (!body.body_md?.trim()) return error('body_md required', 400);

  const current = await env.DB.prepare(
    'SELECT * FROM artifacts WHERE id = ? LIMIT 1'
  ).bind(id).first<ArtifactRow>();
  if (!current) return error('Artifact not found', 404);

  const isPi = await isPiRequest(request, env);
  const actor = await resolveActor(env, user, body.revised_by, {
    allowImpersonation: isPi,
  });
  if ('error' in actor) return error(actor.error, 400);

  // Ownership gate (mirrors handleDeleteArtifact's PI-only gate below, plus a
  // creator carve-out): without this, ANY authed team member could overwrite
  // body_md on someone ELSE's artifact — including one already visibility=
  // 'public' and served live at GET /a/:id — i.e. inject arbitrary HTML into
  // a link a third party already has open. Only the artifact's own creator
  // or a PI/service-key (Hermes' hub_ai_listener auths via PB_API_KEY, which
  // isPiRequest() treats as PI-equivalent) may revise.
  if (actor.slug !== current.created_by && !isPi) {
    return error('Forbidden — only the artifact creator or a PI may revise it', 403);
  }

  // 1. Archive the CURRENT body at its current version number.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO artifact_versions (artifact_id, version, body_md, revised_by, revision_note, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    id,
    current.version,
    current.body_md,
    actor.slug,
    body.revision_note?.trim() || null,
  ).run();

  // 2. Replace body (+ optional title) and bump version off the row's own value.
  const newVersion = current.version + 1;
  const newTitle = body.title?.trim() || current.title;
  await env.DB.prepare(
    `UPDATE artifacts SET body_md = ?, title = ?, version = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.body_md, newTitle, newVersion, id).run();

  const updated = await env.DB.prepare('SELECT * FROM artifacts WHERE id = ?').bind(id).first<ArtifactRow>();
  return json({ data: updated });
}

// ── POST /api/artifacts/:id/delete ──────────────────────────────────────────────
// Hard-delete an artifact + cascade its version history AND its activity_entries
// (Rule 70: entity delete must clear the unified timeline). PI/service gated —
// artifacts are deliverables, not throwaway rows; a team member shouldn't nuke
// the lit-review someone else is commenting on.
export async function handleDeleteArtifact(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403);
  }
  const existing = await env.DB.prepare('SELECT id FROM artifacts WHERE id = ? LIMIT 1').bind(id).first<{ id: string }>();
  if (!existing) return json({ data: { deleted: id, idempotent: true } });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_entries WHERE entity_type = 'artifact' AND entity_id = ?").bind(id),
    env.DB.prepare('DELETE FROM artifact_versions WHERE artifact_id = ?').bind(id),
    env.DB.prepare('DELETE FROM artifacts WHERE id = ?').bind(id),
  ]);
  return json({ data: { deleted: id, idempotent: false } });
}

// ── GET /api/artifacts/:id/activity ─────────────────────────────────────────────
// The unified feed for an artifact (every activity_entries kind, visibility-gated,
// newest-first) — same shape as /api/tasks/:id/activity so the frontend reuses the
// ActivityEntryItem renderer. Imported gate lives in activity-entry.ts.
import { activityVisibilityGate, activityHiddenClause, postActivityEntry } from '../lib/activity-entry';

export async function handleGetArtifactActivity(id: string, request: Request, env: Env): Promise<Response> {
  const artifact = await env.DB.prepare('SELECT id FROM artifacts WHERE id = ? LIMIT 1').bind(id).first<{ id: string }>();
  if (!artifact) return error('Artifact not found', 404);
  const vis = await activityVisibilityGate(request, env);
  const result = await env.DB.prepare(
    `SELECT id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, created_at
     FROM activity_entries
     WHERE entity_type = 'artifact' AND entity_id = ? AND ${activityHiddenClause()} AND ${vis.clause}
     ORDER BY created_at DESC, id DESC`
  ).bind(id, ...vis.binds).all();
  return json({ data: result.results || [] });
}

// ── POST /api/artifacts/:id/comments ────────────────────────────────────────────
// Add a comment on an artifact via the unified postActivityEntry() primitive
// (kind='comment'). That primitive owns @me/visibility, @mention notifications,
// and the @hermes dispatch (source_type='artifact_comment') + placeholder. Body:
//   { content, author_slug?, visibility? }
export async function handleAddArtifactComment(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { content?: string; author_slug?: string; visibility?: string };
  if (!body.content?.trim()) return error('content required', 400);

  const artifact = await env.DB.prepare('SELECT id FROM artifacts WHERE id = ? LIMIT 1').bind(id).first<{ id: string }>();
  if (!artifact) return error('Artifact not found', 404);

  const actor = await resolveActor(env, user, body.author_slug, {
    allowImpersonation: await isPiRequest(request, env),
  });
  if ('error' in actor) return error(actor.error, 400);

  const posted = await postActivityEntry({
    env,
    user,
    entityType: 'artifact',
    entityId: id,
    kind: 'comment',
    body: body.content,
    actorSlug: actor.slug,
    visibility: body.visibility === 'author' ? 'author' : undefined,
  });
  if (!posted.ok) return error(posted.error, posted.status);

  const r = posted.row;
  return json({ data: { id: r.id, artifact_id: r.entity_id, author_slug: r.actor_slug, content: r.body, created_at: r.created_at } }, 201);
}
