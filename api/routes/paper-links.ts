import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

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

  const id = generateId();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO paper_project_links (id, paper_id, project_slug, linked_by, note)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, body.paper_id, body.project_slug, user.email, body.note ?? null).run();

  await logActivity(
    env,
    'paper_link',
    `Linked paper to project ${body.project_slug}`,
    user.email,
    body.paper_id,
    'paper',
  );

  return json({ data: { id, paper_id: body.paper_id, project_slug: body.project_slug } }, 201);
}

// POST /api/paper-links/:id/delete — unlink a paper from a project
export async function handleUnlinkPaper(id: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'DELETE FROM paper_project_links WHERE id = ?'
  ).bind(id).run();

  if (result.meta.changes === 0) {
    return error('Link not found', 404);
  }

  return json({ data: { deleted: id } });
}
