// project-join.ts -- the project directory, requests to join, and the project's
// Browse listing (schema-v139; #145 follow-up, Nick 2026-10-13).
//
//   GET  /api/project-directory               every listed project: name, blurb, PI, and MY state on it
//   POST /api/projects/:id/join-request       { note? }  ask to join (one pending ask per project)
//   GET  /api/join-requests                   Nick and Nate only: pending asks + the last 14 days
//   POST /api/join-requests/:id/decision      { decision: 'approve'|'decline'|'close', note? }  Nick and Nate only; close only once the project left the directory
//   GET  /api/projects/:id/listing            a project I can see: its blurb, whether Browse hides it, whether I may change that
//   PUT  /api/projects/:id/listing            { blurb?: string|null, hidden?: boolean }  blurb: any member; hidden: Nick or the PI
//
// Every handler runs on the caller's own handle (env.DB is viewer-bound). What
// a non-member may read is api/lib/project-join.ts's DirectoryRow, nothing else.

import type { AuthUser, Env } from '../helpers'
import { json, error } from '../helpers'
import { isSiteAdmin, type Viewer } from '../lib/viewer-db'
import {
  cleanBlurb,
  cleanJoinNote,
  decideJoinRequest,
  readDirectoryFor,
  readRequestsForApprover,
  submitJoinRequest,
  type JoinQuestionMinter,
} from '../lib/project-join'
import { isJoinApprover } from '../../shared/joinApprovers'

function personSlug(viewer: Viewer): string | null {
  return viewer.kind === 'person' ? viewer.slug : null
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** GET /api/project-directory */
export async function handleGetProjectDirectory(viewer: Viewer, env: Env): Promise<Response> {
  const slug = personSlug(viewer)
  if (!slug) return error('Sign in as a team member to browse projects', 401)
  return json({ data: await readDirectoryFor(env.DB, slug) })
}

/** POST /api/projects/:id/join-request */
export async function handleRequestToJoin(
  projectId: string, request: Request, user: AuthUser, viewer: Viewer, env: Env, mint: JoinQuestionMinter,
): Promise<Response> {
  const slug = personSlug(viewer)
  if (!slug) return error('Sign in as a team member to ask to join a project', 401)
  const body = (await readJson(request)) ?? {}
  const cleaned = cleanJoinNote(body.note)
  if (!cleaned.ok) return error(cleaned.reason, 400)
  const me = await env.DB.prepare(
    "SELECT COALESCE(NULLIF(trim(preferred_name), ''), name, slug) AS name FROM team_members WHERE slug = ?",
  ).bind(slug).first<{ name: string }>()
  if (!me) return error('No team member row for the signed-in caller', 403)
  const out = await submitJoinRequest(env.DB, {
    projectId: (projectId ?? '').trim(),
    requester: { slug, name: me.name },
    note: cleaned.note,
    user,
    mint,
  })
  switch (out.kind) {
    case 'not_listed': return error('Project not found', 404)
    case 'member': return json({ error: 'You are already on this project', code: 'member' }, 409)
    case 'too_soon':
      return json({ error: 'You can ask again 7 days after a decline', code: 'too_soon', retry_after: out.retry_after }, 429)
    case 'existing': return json({ data: out.request, created: false, telegram: out.telegram })
    // No activity_log row: the lab feed is not where an ask to join belongs,
    // and its row would name a project to people who cannot see it.
    case 'created':
      return json({ data: out.request, created: true, telegram: out.telegram }, 201)
  }
}

/** GET /api/join-requests */
export async function handleGetJoinRequests(viewer: Viewer, env: Env): Promise<Response> {
  const slug = personSlug(viewer)
  if (!slug || !isJoinApprover(slug)) return error('Only Nick or Nate can review requests to join', 403)
  return json({ data: await readRequestsForApprover(env.DB, slug) })
}

/** POST /api/join-requests/:id/decision */
export async function handleDecideJoinRequest(id: string, request: Request, viewer: Viewer, env: Env): Promise<Response> {
  const slug = personSlug(viewer)
  if (!slug || !isJoinApprover(slug)) return error('Only Nick or Nate can approve a request to join', 403)
  const body = await readJson(request)
  const decision = body?.decision
  if (decision !== 'approve' && decision !== 'decline' && decision !== 'close') {
    return error("decision must be 'approve', 'decline' or 'close'", 400)
  }
  const cleaned = cleanJoinNote(body?.note)
  if (!cleaned.ok) return error(cleaned.reason, 400)
  const out = await decideJoinRequest(env.DB, { id, deciderSlug: slug, decision, note: cleaned.note })
  switch (out.kind) {
    case 'forbidden': return error(out.reason, 403)
    case 'not_found': return error('Request not found', 404)
    case 'already':
      return json({ error: `Already ${out.request.status}${out.request.decided_by ? ` by ${out.request.decided_by}` : ''}`, code: 'decided', data: out.request }, 409)
    case 'not_listed':
      return json({ error: 'The project is no longer open to requests; the request was closed', code: 'not_listed', data: out.request }, 409)
    case 'still_listed':
      return json({ error: 'The project is still open to requests: approve or decline it', code: 'listed', data: out.request }, 409)
    case 'decided': return json({ data: out.request })
  }
}

interface ListingProject { id: string; pi: string | null }

async function visibleProject(env: Env, ref: string): Promise<ListingProject | null> {
  if (!ref) return null
  return (await env.DB.prepare(
    'SELECT id, pi FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
  ).bind(ref, ref).first<ListingProject>()) ?? null
}

/** Nick (the site admin) or the project's PI may hide a project from Browse. */
function mayHide(viewer: Viewer, project: ListingProject): boolean {
  if (viewer.kind !== 'person') return false
  return isSiteAdmin({ slug: viewer.slug, pi: viewer.pi }) || (project.pi ?? '') === viewer.slug
}

async function listingBody(env: Env, project: ListingProject, viewer: Viewer) {
  const row = await env.DB.prepare('SELECT blurb, hidden, updated_by, updated_at FROM project_listing WHERE project_id = ?')
    .bind(project.id).first<{ blurb: string | null; hidden: number; updated_by: string; updated_at: string }>()
  return {
    project_id: project.id,
    blurb: row?.blurb ?? null,
    hidden: (row?.hidden ?? 0) === 1,
    can_hide: mayHide(viewer, project),
    updated_by: row?.updated_by ?? null,
    updated_at: row?.updated_at ?? null,
  }
}

/** GET /api/projects/:id/listing */
export async function handleGetProjectListing(ref: string, viewer: Viewer, env: Env): Promise<Response> {
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  return json({ data: await listingBody(env, project, viewer) })
}

/** PUT /api/projects/:id/listing  body { blurb?: string | null, hidden?: boolean } */
export async function handleSetProjectListing(ref: string, request: Request, user: AuthUser, viewer: Viewer, env: Env): Promise<Response> {
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  const body = await readJson(request)
  if (!body || (!('blurb' in body) && !('hidden' in body))) return error('JSON body { blurb } or { hidden } required', 400)
  const sets: string[] = []
  const vals: unknown[] = []
  if ('blurb' in body) {
    const cleaned = cleanBlurb(body.blurb)
    if (!cleaned.ok) return error(cleaned.reason, 400)
    sets.push('blurb = ?')
    vals.push(cleaned.blurb)
  }
  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') return error('hidden must be true or false', 400)
    if (!mayHide(viewer, project)) return error("Only Nick or the project's PI can hide a project from Browse", 403)
    sets.push('hidden = ?', 'hidden_by = ?')
    vals.push(body.hidden ? 1 : 0, (viewer as { slug: string }).slug)
  }
  const who = user.slug && user.slug !== 'anonymous' ? user.slug : user.email
  // No upsert: viewer-db refuses ON CONFLICT DO UPDATE on a scoped table.
  const upd = await env.DB.prepare(
    `UPDATE project_listing SET ${sets.join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE project_id = ?`,
  ).bind(...vals, who, project.id).run()
  if ((upd.meta?.changes ?? 0) === 0) {
    const cols = ['project_id', 'updated_by', ...sets.map((s) => s.split(' = ')[0])]
    await env.DB.prepare(
      `INSERT INTO project_listing (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).bind(project.id, who, ...vals).run()
  }
  return json({ data: await listingBody(env, project, viewer) })
}
