import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, isPiRequest, resolveActor, assertProjectVisible } from '../helpers';
import { idempotentDelete } from '../lib/idempotent-delete';

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
// Hard-delete (project_documents has no deleted_at column; Z4.3 migration).
// SEC-10.3: Idempotent — idempotentDelete() handles the meta.changes check;
// repeat calls return 200 with idempotent:true instead of 404.
//
// Phase 1b-extended: idempotentDelete() gates on project_id via
// assertProjectVisible before mutating — PB-category projects are protected.
// If the document row is already gone the pre-flight SELECT returns null and
// we return idempotent 200 (no project to gate on).
export async function handleDeleteProjectDocument(
  docId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Z4.3: collapsed from hand-rolled SELECT→gate→DELETE to idempotentDelete().
  // mode:'hard' because project_documents has no deleted_at column.
  return idempotentDelete({
    table: 'project_documents',
    id: docId,
    mode: 'hard',
    request,
    env,
  });
}
