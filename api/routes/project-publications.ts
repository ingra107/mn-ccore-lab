/**
 * api/routes/project-publications.ts — a project's PUBLISHED OUTPUT (#129).
 *
 * Backed by the `project_publications` junction (schema-v49, `role` added in
 * schema-v110): one row per (project, publication). Many-to-many on purpose —
 * Nick's K23 and the LPV adherence paper both list the same publication, and a
 * project lists its main paper, a letter and a preprint.
 *
 *   GET  /api/projects/:slug/publications               — the project's papers
 *   POST /api/projects/:slug/publications               — link { publication_id, role? }
 *   POST /api/projects/:slug/publications/:pubId/delete — unlink (idempotent)
 *   GET  /api/project-publications                      — every link, joined,
 *        for the Projects / Manuscripts row chips (one small fetch)
 *
 * Citation facts (authors, journal, year, DOI, PubMed) live ONLY in
 * `publications`; nothing is copied onto `projects` (the v71 bucket-C
 * `projects.journal/doi/...` columns stay inert). The Literature tab's
 * `paper_project_links` is the READING list (research_digest + hand-linked
 * papers); this junction is the project's own output. Two tables, two
 * questions.
 */

import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity, resolveAndGuardProject } from '../helpers';
import type { PublicationRow } from '../types';

import { PUBLICATION_ROLES, isPublicationRole, type PublicationRole } from '../../shared/publicationRoles';
export { PUBLICATION_ROLES, isPublicationRole, type PublicationRole };

export interface ProjectPublicationRow extends PublicationRow {
  role: PublicationRole;
  linked_at: string;
}

const PUB_COLS = `p.id, p.title, p.authors, p.journal, p.year, p.status,
            p.doi, p.pubmed, p.abstract, p.topics, p.featured, p.author_slugs,
            p.created_at, p.updated_at`;

// primary first, then newest; `p.id` is a deterministic tiebreak only.
const ROLE_ORDER = `CASE pp.role WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END`;

// GET /api/projects/:slug/publications
export async function handleGetProjectPublications(
  projectSlug: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const { block, projectId } = await resolveAndGuardProject(request, env, projectSlug);
  if (block) return block;

  const result = await env.DB.prepare(
    `SELECT ${PUB_COLS}, pp.role, pp.created_at AS linked_at
       FROM project_publications pp
       JOIN publications p ON p.id = pp.publication_id
      WHERE pp.project_id = ?
      ORDER BY ${ROLE_ORDER}, p.year DESC, p.id ASC`,
  ).bind(projectId).all<ProjectPublicationRow>();

  const rows = result.results ?? [];
  return json({ data: rows, count: rows.length });
}

// POST /api/projects/:slug/publications  { publication_id, role? }
export async function handleLinkProjectPublication(
  projectSlug: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { publication_id?: unknown; role?: unknown };

  const publicationId = typeof body.publication_id === 'string' ? body.publication_id.trim() : '';
  if (!publicationId) return error('publication_id is required', 400);

  const role: PublicationRole = body.role == null ? 'primary' : (body.role as PublicationRole);
  if (!isPublicationRole(role)) {
    return error(`Invalid role "${String(body.role)}". Must be one of ${PUBLICATION_ROLES.join('/')}.`, 400);
  }

  // The two lookups are independent (project by slug + caller; publication by
  // id) — one round trip, not two.
  const [{ block, projectId }, pub] = await Promise.all([
    resolveAndGuardProject(request, env, projectSlug),
    env.DB.prepare('SELECT id, title FROM publications WHERE id = ? LIMIT 1')
      .bind(publicationId)
      .first<{ id: string; title: string }>(),
  ]);
  if (block) return block;
  if (!pub) return error(`Unknown publication "${publicationId}"`, 404);

  // Upsert: relinking with a different role updates the role rather than
  // 409ing — the pair IS the identity, the role is an attribute of it.
  await env.DB.prepare(
    `INSERT INTO project_publications (project_id, publication_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id, publication_id) DO UPDATE SET role = excluded.role`,
  ).bind(projectId, publicationId, role).run();

  await logActivity(
    env,
    'publication_link',
    `Linked publication "${pub.title}" to project ${projectSlug} (${role})`,
    user.email,
    projectId,
    'project',
  );

  return json({ data: { project_id: projectId, publication_id: publicationId, role } }, 201);
}

// POST /api/projects/:slug/publications/:pubId/delete — idempotent unlink.
// Composite PK, so no idempotentDelete() (which keys on an `id` column);
// same DELETE-by-pair shape as member-featured-publications.
export async function handleUnlinkProjectPublication(
  projectSlug: string,
  publicationId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const { block, projectId } = await resolveAndGuardProject(request, env, projectSlug);
  if (block) return block;

  const res = await env.DB.prepare(
    'DELETE FROM project_publications WHERE project_id = ? AND publication_id = ?',
  ).bind(projectId, publicationId).run();
  const changes = res.meta?.changes ?? 0;

  if (changes > 0) {
    await logActivity(
      env,
      'publication_unlink',
      `Unlinked publication ${publicationId} from project ${projectSlug}`,
      user.email,
      projectId,
      'project',
    );
  }
  return json({ data: { project_id: projectId, publication_id: publicationId, deleted: changes > 0, idempotent: changes === 0 } });
}

export interface ProjectPublicationLinkRow {
  project_id: string;
  project_slug: string | null;
  publication_id: string;
  role: PublicationRole;
  title: string;
  journal: string | null;
  year: number;
  doi: string | null;
  pubmed: string | null;
  linked_at: string;
}

// GET /api/project-publications — every link, for list-page chips. The
// junction is small (one row per paper a project produced), so one fetch
// beats N per-project requests from a 100-row table. PB-category projects
// are hidden from non-PI callers by the same predicate the list endpoints
// use: category = 'Peripheral Brain' rows are dropped unless the caller is
// PI/API-key — `canSeePb` is what /api/projects applies, and the row chip
// never needs a paper for a project the caller cannot open.
export async function handleGetAllProjectPublications(
  env: Env,
  canSeePb: boolean,
): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT pp.project_id, pr.slug AS project_slug, pp.publication_id, pp.role,
            p.title, p.journal, p.year, p.doi, p.pubmed, pp.created_at AS linked_at
       FROM project_publications pp
       JOIN publications p ON p.id = pp.publication_id
       LEFT JOIN projects pr ON pr.id = pp.project_id
      WHERE (? = 1 OR pr.category IS NULL OR pr.category != 'Peripheral Brain')
      ORDER BY ${ROLE_ORDER}, p.year DESC, p.id ASC`,
  ).bind(canSeePb ? 1 : 0).all<ProjectPublicationLinkRow>();
  const rows = result.results ?? [];
  return json({ data: rows, count: rows.length });
}
