import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, isPiRequest, resolveActor } from '../helpers';

// ── Types ──────────────────────────────────────────────────
//
// Slice D (2026-06-09): storage re-keyed onto durable project PKs
// (from_project_id / to_project_id, proj_*), so a slug rename can never strand
// an edge. The WIRE shape stays slug-keyed (from_slug/to_slug) — every consumer
// (frontend ProjectDependencies/ProjectDependencyMap, narratives.ts) reads slugs
// — so the read path resolves PK->slug via a JOIN at the edge. brain.db has no
// project_dependencies table; this is Hub-only.

/** Wire/response shape — slug-keyed (display cache resolved at read). */
interface DependencyRow {
  id: string;
  from_slug: string;
  to_slug: string;
  relationship_type: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// SELECT projection that resolves the stored proj_* PKs back to display slugs.
// INNER JOIN: an edge whose endpoint project was hard-deleted simply won't
// appear (belt-and-suspenders with ON DELETE CASCADE); an edge to a soft-deleted
// project still resolves (the projects row persists with deleted_at set).
const SELECT_DEPS_JOIN = `
  SELECT d.id,
         pf.slug AS from_slug,
         pt.slug AS to_slug,
         d.relationship_type,
         d.note,
         d.created_by,
         d.created_at
  FROM project_dependencies d
  JOIN projects pf ON pf.id = d.from_project_id
  JOIN projects pt ON pt.id = d.to_project_id
`;

// ── Strict slug/PK -> live PK resolver ─────────────────────
//
// R1 (codex catch): projects.slug is nullable AND NOT db-unique, so the shared
// projectRefToCanonical (helpers.ts:551) — which uses LIMIT 1 — would silently
// pick the first of several slug matches. For a WRITE that mints a durable FK
// that must be wrong-state-proof, we cannot guess. Resolve a ref (PK or slug) to
// EXACTLY ONE live (non-deleted) project, or fail loud.
//
// Returns the canonical proj_* id, or one of:
//   { notFound: true }   — 0 live matches
//   { ambiguous: n }     — >1 live match (slug collision)
async function resolveExactlyOneLiveProject(
  env: Env,
  ref: string,
): Promise<{ id: string } | { notFound: true } | { ambiguous: number }> {
  // Direct-PK is unambiguous by construction (id is the PRIMARY KEY).
  const byId = await env.DB.prepare(
    "SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1",
  ).bind(ref).first<{ id: string }>();
  if (byId) return { id: byId.id };

  // Slug arm: count live matches; reject 0 and >1 rather than guess.
  const matches = await env.DB.prepare(
    "SELECT id FROM projects WHERE slug = ? AND deleted_at IS NULL",
  ).bind(ref).all<{ id: string }>();
  const rows = matches.results ?? [];
  if (rows.length === 0) return { notFound: true };
  if (rows.length > 1) return { ambiguous: rows.length };
  return { id: rows[0].id };
}

// ── GET /api/dependencies — all dependencies ───────────────

export async function handleGetDependencies(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `${SELECT_DEPS_JOIN} ORDER BY d.created_at DESC`,
  ).all<DependencyRow>();
  return json({ data: result.results, count: result.results.length });
}

// ── GET /api/projects/:slug/dependencies — per-project ─────

export async function handleGetProjectDependencies(slug: string, env: Env): Promise<Response> {
  // Resolve the inbound ref (slug OR PK) to the project PK the edges are keyed on.
  // Read path tolerates ambiguity/absence gracefully (returns empty) — it is the
  // WRITE path that must be strict. Use a direct id/slug lookup (no live-only
  // filter) so a project page still lists edges even if its row is soft-deleted.
  const proj = await env.DB.prepare(
    "SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1",
  ).bind(slug, slug).first<{ id: string }>();
  if (!proj) return json({ data: [], count: 0 });

  const result = await env.DB.prepare(
    `${SELECT_DEPS_JOIN} WHERE d.from_project_id = ? OR d.to_project_id = ? ORDER BY d.created_at DESC`,
  ).bind(proj.id, proj.id).all<DependencyRow>();
  return json({ data: result.results, count: result.results.length });
}

// ── POST /api/dependencies — create dependency ─────────────

export async function handleCreateDependency(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    from_slug?: string;
    to_slug?: string;
    relationship_type?: string;
    note?: string;
    created_by?: string;
  };

  if (!body.from_slug || !body.to_slug) {
    return error('from_slug and to_slug are required', 400);
  }

  if (body.from_slug === body.to_slug) {
    return error('A project cannot depend on itself', 400);
  }

  const validTypes = ['feeds_into', 'blocks', 'shares_data', 'related_to'];
  const relType = body.relationship_type || 'feeds_into';
  if (!validTypes.includes(relType)) {
    return error(`relationship_type must be one of: ${validTypes.join(', ')}`, 400);
  }

  // Slice D: resolve both endpoints to durable proj_* PKs. The FK would reject a
  // dangling ref anyway; resolving here returns a clean 400/404 instead of an
  // opaque constraint error, and (R1) refuses to guess on a slug collision.
  const fromRes = await resolveExactlyOneLiveProject(env, body.from_slug);
  if ('notFound' in fromRes) return error(`from_slug does not resolve to a live project: ${body.from_slug}`, 404);
  if ('ambiguous' in fromRes) return error(`from_slug "${body.from_slug}" is ambiguous (${fromRes.ambiguous} live projects share this slug)`, 409);

  const toRes = await resolveExactlyOneLiveProject(env, body.to_slug);
  if ('notFound' in toRes) return error(`to_slug does not resolve to a live project: ${body.to_slug}`, 404);
  if ('ambiguous' in toRes) return error(`to_slug "${body.to_slug}" is ambiguous (${toRes.ambiguous} live projects share this slug)`, 409);

  if (fromRes.id === toRes.id) {
    return error('A project cannot depend on itself', 400);
  }

  const id = generateId();

  // AM-2: created_by is an actor identity. Resolve to a canonical team slug;
  // impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.created_by, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const createdBy = actor.slug;

  try {
    await env.DB.prepare(
      'INSERT INTO project_dependencies (id, from_project_id, to_project_id, relationship_type, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, fromRes.id, toRes.id, relType, body.note || null, createdBy).run();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return error('This dependency already exists', 409);
    }
    throw e;
  }

  await logActivity(env, 'dependency_created', `Created dependency: ${body.from_slug} → ${body.to_slug} (${relType})`, createdBy, body.from_slug, 'project');

  const created = await env.DB.prepare(
    `${SELECT_DEPS_JOIN} WHERE d.id = ?`,
  ).bind(id).first<DependencyRow>();
  return json({ data: created }, 201);
}

// ── POST /api/dependencies/:id/delete — delete dependency ──
//
// R2 (codex catch): the shared idempotentDelete hard-mode pre-flight SELECTs
// `project_id` (idempotent-delete.ts:110), a column project_dependencies has
// never had — on D1 that SELECT THROWS ("no such column: project_id") before the
// DELETE. So this handler must NOT route through idempotentDelete. Delete keys on
// the per-edge id (now the PRIMARY KEY post-Slice-D), which is rename/identity
// stable. Direct, idempotent DELETE: meta.changes==0 → already gone.
export async function handleDeleteDependency(id: string, _request: Request, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'DELETE FROM project_dependencies WHERE id = ?',
  ).bind(id).run();
  const changed = (result.meta?.changes ?? 0) > 0;
  return json({ data: { id, deleted: true, idempotent: !changed } });
}
