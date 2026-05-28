import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, isPiRequest, resolveActor, assertProjectVisible } from '../helpers';

type DocType = 'folder' | 'draft' | 'data' | 'protocol' | 'submission' | 'link';

// GET /api/projects/:slug/documents — list documents linked to a project
export async function handleGetProjectDocuments(projectSlug: string, request: Request, env: Env): Promise<Response> {
  // Phase 1b-B: block non-PI callers from listing documents of a PB-category project.
  const block = await assertProjectVisible(request, env, projectSlug);
  if (block) return block;
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

  // Phase 1b-extended: block non-PI callers from attaching documents to a PB-category project.
  const block = await assertProjectVisible(request, env, projectSlug);
  if (block) return block;

  const id = generateId();
  const docType = body.doc_type || 'link';
  // AM-2: validate/canonicalize created_by; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.created_by, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const createdBy = actor.slug;

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
// Hard-delete (project_documents has no deleted_at column).
// SEC-10.3: Idempotent — check meta.changes; repeat calls return 200 with
// idempotent:true instead of 404.
//
// Phase 1b-extended: gate the delete on the parent project's visibility so a
// non-PI caller who knows a PB document id cannot delete it. Resolve the
// document's project_id, then call assertProjectVisible. If the document row
// is already gone we return idempotent 200 (no project to gate on).
export async function handleDeleteProjectDocument(
  docId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const doc = await env.DB.prepare(
    'SELECT project_id FROM project_documents WHERE id = ?'
  ).bind(docId).first<{ project_id: string | null }>();
  if (doc?.project_id) {
    const block = await assertProjectVisible(request, env, doc.project_id);
    if (block) return block;
  }

  const result = await env.DB.prepare(
    'DELETE FROM project_documents WHERE id = ?'
  ).bind(docId).run();

  const changed = (result.meta?.changes ?? 0) > 0;
  return json({ data: { deleted: docId, idempotent: !changed } });
}
