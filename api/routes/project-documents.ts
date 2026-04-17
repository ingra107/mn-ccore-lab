import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug } from '../helpers';

export type DocType = 'folder' | 'draft' | 'data' | 'protocol' | 'submission' | 'link';

// GET /api/projects/:slug/documents — list documents linked to a project
export async function handleGetProjectDocuments(projectSlug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT * FROM project_documents
     WHERE project_id = ?
     ORDER BY created_at DESC`
  ).bind(projectSlug).all();
  return json({ data: result.results, count: result.results.length });
}

// POST /api/projects/:slug/documents — add a document link
export async function handleCreateProjectDocument(
  projectSlug: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as {
    title?: string;
    url?: string;
    doc_type?: DocType;
    created_by?: string;
  };

  if (!body.title?.trim()) {
    return error('title is required', 400);
  }
  if (!body.url?.trim()) {
    return error('url is required', 400);
  }

  const id = generateId();
  const docType = body.doc_type || 'link';
  const createdBy = body.created_by?.trim() || actorSlug(user.email);

  await env.DB.prepare(
    `INSERT INTO project_documents (id, project_id, title, url, doc_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, projectSlug, body.title.trim(), body.url.trim(), docType, createdBy).run();

  await logActivity(
    env,
    'document_link',
    `Linked ${docType} "${body.title.trim()}" to project ${projectSlug}`,
    user.email,
    id,
    'project_document',
  );

  const created = await env.DB.prepare('SELECT * FROM project_documents WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// DELETE /api/projects/:slug/documents/:docId — remove a document link
export async function handleDeleteProjectDocument(
  docId: string,
  env: Env,
): Promise<Response> {
  const result = await env.DB.prepare(
    'DELETE FROM project_documents WHERE id = ?'
  ).bind(docId).run();

  if (result.meta.changes === 0) {
    return error('Document link not found', 404);
  }

  return json({ data: { deleted: docId } });
}
