import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, projectRefToCanonical } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';

// GET /api/projects/:slug/papers — papers linked to a project, joined with research_digest
export async function handleGetPaperLinks(projectSlug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT ppl.id, ppl.paper_id, ppl.project_slug, ppl.linked_by, ppl.note, ppl.created_at,
            rd.title, rd.journal, rd.pub_date, rd.doi, rd.authors, rd.relevance_score
     FROM paper_project_links ppl
     LEFT JOIN research_digest rd ON rd.id = ppl.paper_id
     WHERE ppl.project_slug = ?
     ORDER BY ppl.created_at DESC`
  ).bind(projectSlug).all();
  return json({ data: result.results });
}

// POST /api/paper-links — link a paper to a project (upserts via UNIQUE constraint)
export async function handleLinkPaper(
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { paper_id?: string; project_slug?: string; note?: string };

  if (!body.paper_id || !body.project_slug) {
    return error('paper_id and project_slug are required', 400);
  }

  // Z3.2: canonicalize project_slug before insert. paper_project_links stores
  // a canonical slug for filtering; unresolvable refs store NULL.
  const canonicalProjectSlug = await projectRefToCanonical(env, body.project_slug);

  const id = generateId();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_project_links (id, paper_id, project_slug, linked_by, note)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, body.paper_id, canonicalProjectSlug, user.email, body.note ?? null).run();

  await logActivity(
    env,
    'paper_link',
    `Linked paper to project ${body.project_slug}`,
    user.email,
    body.paper_id,
    'paper',
  );

  return json({ data: { id, paper_id: body.paper_id, project_slug: canonicalProjectSlug } }, 201);
}

// POST /api/paper-links/:id/delete — unlink a paper from a project
export async function handleUnlinkPaper(id: string, request: Request, env: Env): Promise<Response> {
  return idempotentDelete({ table: 'paper_project_links', id, mode: 'hard', request, env });
}

// GET /api/papers/by-project?project_id= — publications linked to a project (with full pub data)
export async function handlePapersByProject(url: URL, env: Env): Promise<Response> {
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return error('project_id is required', 400);

  const result = await env.DB.prepare(
    `SELECT ppl.id as link_id, ppl.link_type, ppl.note, ppl.created_at as linked_at,
            p.id, p.title, p.authors, p.journal, p.year, p.status, p.doi, p.abstract,
            p.topics, p.featured, p.author_slugs
     FROM paper_project_links ppl
     JOIN publications p ON p.id = ppl.paper_id
     WHERE ppl.project_slug = ?
     ORDER BY p.year DESC, ppl.created_at DESC`
  ).bind(projectId).all();

  return json({ data: result.results });
}

// GET /api/papers/by-publication?publication_id= — projects linked to a publication
export async function handlePapersByPublication(url: URL, env: Env): Promise<Response> {
  const publicationId = url.searchParams.get('publication_id');
  if (!publicationId) return error('publication_id is required', 400);

  const result = await env.DB.prepare(
    `SELECT ppl.id as link_id, ppl.link_type, ppl.note, ppl.created_at as linked_at,
            pr.slug, pr.title, pr.status, pr.category, pr.stage, pr.pi
     FROM paper_project_links ppl
     JOIN projects pr ON pr.slug = ppl.project_slug
     WHERE ppl.paper_id = ?
     ORDER BY ppl.created_at DESC`
  ).bind(publicationId).all();

  return json({ data: result.results });
}
