import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, isPiRequest, resolveActor } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';

// ── Types ──────────────────────────────────────────────────

interface DependencyRow {
  id: string;
  from_slug: string;
  to_slug: string;
  relationship_type: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// ── GET /api/dependencies — all dependencies ───────────────

export async function handleGetDependencies(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM project_dependencies ORDER BY created_at DESC'
  ).all<DependencyRow>();
  return json({ data: result.results, count: result.results.length });
}

// ── GET /api/projects/:slug/dependencies — per-project ─────

export async function handleGetProjectDependencies(slug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM project_dependencies WHERE from_slug = ? OR to_slug = ? ORDER BY created_at DESC'
  ).bind(slug, slug).all<DependencyRow>();
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

  const id = generateId();

  // AM-2: created_by is an actor identity. Pre-fix it stored a raw email
  // (user.email) or an unvalidated body.created_by. Resolve to a canonical
  // team slug; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.created_by, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const createdBy = actor.slug;

  try {
    await env.DB.prepare(
      'INSERT INTO project_dependencies (id, from_slug, to_slug, relationship_type, note, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, body.from_slug, body.to_slug, relType, body.note || null, createdBy).run();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return error('This dependency already exists', 409);
    }
    throw e;
  }

  await logActivity(env, 'dependency_created', `Created dependency: ${body.from_slug} → ${body.to_slug} (${relType})`, createdBy, body.from_slug, 'project');

  const created = await env.DB.prepare('SELECT * FROM project_dependencies WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/dependencies/:id/delete — delete dependency ──

export async function handleDeleteDependency(id: string, request: Request, env: Env): Promise<Response> {
  return idempotentDelete({ table: 'project_dependencies', id, mode: 'hard', request, env });
}
