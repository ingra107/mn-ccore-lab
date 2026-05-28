import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, assertProjectVisible } from '../helpers';
import { withProjectWrite, withExistingRowProject } from '../lib/route-guards';
import { hiddenResource } from '../lib/hidden-resource';

// ── Types ──

interface RevisionRow {
  id: string;
  project_id: string;
  round: number;
  submitted_at: string | null;
  response_due: string | null;
  status: string;
  journal: string | null;
  notes: string | null;
  created_at: string;
}

interface CommentRow {
  id: string;
  revision_id: string;
  reviewer_number: number;
  comment_text: string;
  assigned_to: string;
  status: string;
  response_text: string | null;
  resolved_at: string | null;
  created_at: string;
}

const VALID_REVISION_STATUSES = ['in_progress', 'submitted', 'accepted', 'rejected'];
const VALID_COMMENT_STATUSES = ['pending', 'in_progress', 'done', 'wont_fix'];

// ── GET /api/revisions?project_id= ──
// List revisions for a project with comment counts
// Phase 1b-extended: gate on the parent project's visibility.
export async function handleGetRevisions(url: URL, request: Request, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return error('project_id required', 400);

  const block = await assertProjectVisible(request, env, projectId);
  if (block) return block;

  const revisions = await env.DB.prepare(`
    SELECT r.*,
      COUNT(c.id) as comment_count,
      SUM(CASE WHEN c.status IN ('done', 'wont_fix') THEN 1 ELSE 0 END) as resolved_count
    FROM manuscript_revisions r
    LEFT JOIN reviewer_comments c ON c.revision_id = r.id
    WHERE r.project_id = ?
    GROUP BY r.id
    ORDER BY r.round ASC
  `).bind(projectId).all();

  return json({ data: revisions.results || [], count: revisions.results?.length || 0 });
}

// ── POST /api/revisions ──
// Create a new revision round
// Z2.3 (2026-05-28): withProjectWrite wraps the resolve+visibility-gate so
// bypass is impossible. Accepts project_id OR project_slug (convenience alias)
// by normalizing into project_id before the wrapper call. Outer signature
// (request, user, env) unchanged for api/index.ts compatibility.
export async function handleCreateRevision(request: Request, user: AuthUser, env: Env): Promise<Response> {
  type CreateBody = {
    project_id?: string;
    project_slug?: string;
    round?: number;
    submitted_at?: string;
    response_due?: string;
    status?: string;
    journal?: string;
    notes?: string;
    reviewer_comments?: string;
  };

  const rawBody = await request.json() as CreateBody;

  // Normalize: accept project_id OR project_slug. Feed the canonical project_id
  // slot so withProjectWrite can find it. Preserve the original project_slug for
  // the activity-log message below.
  const ref = rawBody.project_id || rawBody.project_slug;
  if (!ref) return error('project_id or project_slug required', 400);
  const normalizedBody: CreateBody = { ...rawBody, project_id: ref };

  // withProjectWrite checks project_id presence (→ 400 if absent, handled above)
  // + runs resolveAndGuardProject (→ 403/400 if hidden/unknown). Inner only runs
  // when the project is confirmed visible; receives the canonical projectId.
  return withProjectWrite<CreateBody>(async (_req, e, projectId, b) => {
    // Auto-detect round number if not provided
    let round = b.round;
    if (!round) {
      const latest = await e.DB.prepare(
        'SELECT MAX(round) as max_round FROM manuscript_revisions WHERE project_id = ?'
      ).bind(projectId).first<{ max_round: number | null }>();
      round = (latest?.max_round || 0) + 1;
    }

    const status = b.status && VALID_REVISION_STATUSES.includes(b.status)
      ? b.status : 'in_progress';

    // reviewer_comments is a convenience alias for notes (the deep-audit test
    // + UI create form both send this name).
    const notes = b.notes ?? b.reviewer_comments ?? null;

    const id = generateId();
    await e.DB.prepare(`
      INSERT INTO manuscript_revisions (id, project_id, round, submitted_at, response_due, status, journal, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      projectId,
      round,
      b.submitted_at || null,
      b.response_due || null,
      status,
      b.journal || null,
      notes,
    ).run();

    const actor = actorSlug(user.email);
    await logActivity(e, 'revision', `Revision R${round} created for project ${ref}`, actor, id, 'revision');

    const created = await e.DB.prepare('SELECT * FROM manuscript_revisions WHERE id = ?').bind(id).first();
    return json({ data: created }, 201);
  })(request, env, normalizedBody);
}

// ── POST /api/revisions/:id ──
// Update revision fields (status, dates, journal, notes)
// P4 (2026-05-28): migrated to withExistingRowProject so the row-existence
// check + PB visibility gate cannot be bypassed by forgetting to call them.
// Inner receives the canonical projectId; outer signature (id, request, user, env)
// is unchanged for api/index.ts compatibility.
export async function handleUpdateRevision(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  return withExistingRowProject('manuscript_revisions', async (req, e, rowId, _projectId) => {
    const body = await req.json() as {
      submitted_at?: string;
      response_due?: string;
      status?: string;
      journal?: string;
      notes?: string;
    };

    const sets: string[] = [];
    const params: (string | null)[] = [];

    if (body.submitted_at !== undefined) { sets.push('submitted_at = ?'); params.push(body.submitted_at || null); }
    if (body.response_due !== undefined) { sets.push('response_due = ?'); params.push(body.response_due || null); }
    if (body.journal !== undefined) { sets.push('journal = ?'); params.push(body.journal || null); }
    if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes || null); }
    if (body.status !== undefined) {
      if (!VALID_REVISION_STATUSES.includes(body.status)) {
        return error(`status must be one of: ${VALID_REVISION_STATUSES.join(', ')}`, 400);
      }
      sets.push('status = ?');
      params.push(body.status);
    }

    if (sets.length === 0) return error('No fields to update', 400);

    params.push(rowId);
    await e.DB.prepare(
      `UPDATE manuscript_revisions SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    const actor = actorSlug(user.email);
    await logActivity(e, 'revision', `Revision ${rowId} updated`, actor, rowId, 'revision');

    const updated = await e.DB.prepare('SELECT * FROM manuscript_revisions WHERE id = ?').bind(rowId).first();
    if (!updated) return error('Revision not found', 404);
    return json({ data: updated });
  })(request, env, id);
}

// ── GET /api/revisions/:id/comments ──
// List comments for a revision
// Phase 1b-extended: gate on the parent revision's project visibility.
//
// T1.2 (2026-05-28): closed the existence oracle. Pre-fix returned 200/[]
// when the revision row was null, while a KNOWN PB revision returned 403 —
// the status-code asymmetry let an attacker probe revision IDs from the
// blocked response. Now: 404 when the revision doesn't exist, regardless of
// PB status; 403 only when the revision exists AND the caller can't see its
// parent project. Both PI and non-PI get 404 for unknown ids.
//
// P8 (2026-05-28): further closes the 404/403 differential. T1.2 fixed the
// null-revision path (now 404) but the hidden-project path still returned 403
// via assertProjectVisible — an attacker could still distinguish "no such
// revision" (404) from "revision exists but you can't see it" (403). Both
// paths now return hiddenResource() (404, uniform envelope) so the oracle is
// fully closed. The T1.2 tests at pb-visibility-contract.test.ts:811-824
// assert 404 for all callers on unknown ids — they continue to pass.
export async function handleGetRevisionComments(revisionId: string, request: Request, env: Env): Promise<Response> {
  const revision = await env.DB.prepare('SELECT project_id FROM manuscript_revisions WHERE id = ?').bind(revisionId).first<{ project_id: string | null }>();
  if (!revision) return hiddenResource();
  if (revision.project_id) {
    const block = await assertProjectVisible(request, env, revision.project_id);
    if (block) return hiddenResource();
  }

  const comments = await env.DB.prepare(
    'SELECT * FROM reviewer_comments WHERE revision_id = ? ORDER BY reviewer_number ASC, created_at ASC'
  ).bind(revisionId).all();

  return json({ data: comments.results || [], count: comments.results?.length || 0 });
}

// ── POST /api/revisions/:id/comments ──
// Add a reviewer comment to a revision
export async function handleCreateRevisionComment(revisionId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    reviewer_number?: number;
    comment_text: string;
    assigned_to?: string;
    status?: string;
    response_text?: string;
  };

  if (!body.comment_text) return error('comment_text required', 400);

  // Verify revision exists + pull parent project for Phase 1b-extended gating.
  const revision = await env.DB.prepare(
    'SELECT id, project_id FROM manuscript_revisions WHERE id = ?'
  ).bind(revisionId).first<{ id: string; project_id: string | null }>();
  if (!revision) return error('Revision not found', 404);
  if (revision.project_id) {
    const block = await assertProjectVisible(request, env, revision.project_id);
    if (block) return block;
  }

  const status = body.status && VALID_COMMENT_STATUSES.includes(body.status)
    ? body.status : 'pending';

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO reviewer_comments (id, revision_id, reviewer_number, comment_text, assigned_to, status, response_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    revisionId,
    body.reviewer_number || 1,
    body.comment_text,
    body.assigned_to || 'nick-ingraham',
    status,
    body.response_text || null,
  ).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'revision_comment', `Comment added to revision ${revisionId}`, actor, id, 'reviewer_comment');

  const created = await env.DB.prepare('SELECT * FROM reviewer_comments WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/revisions/comments/:id ──
// Update a reviewer comment (status, response_text, assigned_to)
// Phase 1b-extended: gate on the revision's parent project (two hops).
export async function handleUpdateRevisionComment(id: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const parent = await env.DB.prepare(
    'SELECT r.project_id FROM reviewer_comments c LEFT JOIN manuscript_revisions r ON r.id = c.revision_id WHERE c.id = ?'
  ).bind(id).first<{ project_id: string | null }>();
  if (parent?.project_id) {
    const block = await assertProjectVisible(request, env, parent.project_id);
    if (block) return block;
  }

  const body = await request.json() as {
    status?: string;
    response_text?: string;
    assigned_to?: string;
    comment_text?: string;
  };

  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (body.comment_text !== undefined) { sets.push('comment_text = ?'); params.push(body.comment_text); }
  if (body.assigned_to !== undefined) { sets.push('assigned_to = ?'); params.push(body.assigned_to || 'nick-ingraham'); }
  if (body.response_text !== undefined) { sets.push('response_text = ?'); params.push(body.response_text || null); }
  if (body.status !== undefined) {
    if (!VALID_COMMENT_STATUSES.includes(body.status)) {
      return error(`status must be one of: ${VALID_COMMENT_STATUSES.join(', ')}`, 400);
    }
    sets.push('status = ?');
    params.push(body.status);
    // Auto-set resolved_at when marking as done or wont_fix
    if (body.status === 'done' || body.status === 'wont_fix') {
      sets.push("resolved_at = datetime('now')");
    } else {
      sets.push('resolved_at = NULL');
    }
  }

  if (sets.length === 0) return error('No fields to update', 400);

  params.push(id);
  await env.DB.prepare(
    `UPDATE reviewer_comments SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  const actor = actorSlug(user.email);
  await logActivity(env, 'revision_comment', `Comment ${id} updated`, actor, id, 'reviewer_comment');

  const updated = await env.DB.prepare('SELECT * FROM reviewer_comments WHERE id = ?').bind(id).first();
  if (!updated) return error('Comment not found', 404);
  return json({ data: updated });
}

// ── GET /api/manuscripts/attention ──
// T-29: three-subgroup triage for the Manuscripts page "Needs your attention"
// section. Each subgroup computes from existing tables — no schema changes.
//
//   1. Revisions overdue — manuscript_revisions.status='in_progress'
//      AND response_due < NOW().
//   2. Awaiting your review — reviewer_comments.assigned_to = actor
//      AND status='pending' AND created_at older than `review_days` (default 7).
//   3. Stale drafts — publications.status='In Preparation'
//      AND updated_at older than `stale_days` (default 30).
//
// Thresholds are overridable per-request via `?overdue_days=14&review_days=7
// &stale_days=30` — lets Settings plumb Lab Preferences in a later ticket.
export async function handleAttentionManuscripts(
  url: URL,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const actor = actorSlug(user.email);
  const reviewDays = Math.max(0, parseInt(url.searchParams.get('review_days') ?? '7', 10) || 7);
  const staleDays = Math.max(0, parseInt(url.searchParams.get('stale_days') ?? '30', 10) || 30);

  const [overdue, awaiting, stale] = await Promise.all([
    env.DB.prepare(`
      SELECT r.id, r.project_id, r.round, r.journal, r.submitted_at, r.response_due,
             p.title AS project_title, p.slug AS project_slug,
             COUNT(c.id) AS comment_count,
             SUM(CASE WHEN c.status IN ('done', 'wont_fix') THEN 1 ELSE 0 END) AS resolved_count
      FROM manuscript_revisions r
      LEFT JOIN projects p ON p.slug = r.project_id OR p.id = r.project_id
      LEFT JOIN reviewer_comments c ON c.revision_id = r.id
      WHERE r.status = 'in_progress'
        AND r.response_due IS NOT NULL
        AND r.response_due < datetime('now')
      GROUP BY r.id
      ORDER BY r.response_due ASC
    `).all(),
    env.DB.prepare(`
      SELECT c.id, c.revision_id, c.reviewer_number, c.comment_text, c.created_at,
             r.project_id, r.round,
             p.title AS project_title, p.slug AS project_slug
      FROM reviewer_comments c
      JOIN manuscript_revisions r ON r.id = c.revision_id
      LEFT JOIN projects p ON p.slug = r.project_id OR p.id = r.project_id
      WHERE c.assigned_to = ?
        AND c.status = 'pending'
        AND c.created_at < datetime('now', ?)
      ORDER BY c.created_at ASC
    `).bind(actor, `-${reviewDays} days`).all(),
    env.DB.prepare(`
      SELECT id, title, status, updated_at, authors, journal
      FROM publications
      WHERE status = 'In Preparation'
        AND (updated_at IS NULL OR updated_at < datetime('now', ?))
      ORDER BY updated_at ASC
    `).bind(`-${staleDays} days`).all(),
  ]);

  return json({
    data: {
      revisions_overdue: overdue.results ?? [],
      awaiting_review: awaiting.results ?? [],
      stale_drafts: stale.results ?? [],
    },
    thresholds: { review_days: reviewDays, stale_days: staleDays },
  });
}

// ── GET /api/revisions/active ──
// All active revisions across projects (for dashboard)
// Phase 1b-B: canSeePb=false for non-PI callers — filter out PB-category project revisions.
export async function handleGetActiveRevisions(env: Env, canSeePb = false): Promise<Response> {
  // Mirror the category filter from search/activity for non-PI callers.
  const pbFilter = canSeePb ? '' : " AND (p.category != 'Peripheral Brain' OR p.category IS NULL)";
  const revisions = await env.DB.prepare(`
    SELECT r.*,
      p.title as project_title,
      p.slug as project_slug,
      COUNT(c.id) as comment_count,
      SUM(CASE WHEN c.status IN ('done', 'wont_fix') THEN 1 ELSE 0 END) as resolved_count
    FROM manuscript_revisions r
    LEFT JOIN projects p ON p.slug = r.project_id OR p.id = r.project_id
    LEFT JOIN reviewer_comments c ON c.revision_id = r.id
    WHERE r.status = 'in_progress'${pbFilter}
    GROUP BY r.id
    ORDER BY r.response_due ASC NULLS LAST, r.created_at DESC
  `).all();

  return json({ data: revisions.results || [], count: revisions.results?.length || 0 });
}
