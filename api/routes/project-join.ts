// project-join.ts -- the project directory, requests to join, and the one-line
// description (schema-v139; #145 follow-up, Nick 2026-10-13).
//
//   GET  /api/project-directory               every listed project: name, blurb, PI, and MY state on it
//   POST /api/projects/:id/join-request       { note? }  ask to join (one pending ask per project)
//   GET  /api/join-requests                   Nick and Nate only: pending asks + the last 14 days
//   POST /api/join-requests/:id/decision      { decision: 'approve'|'decline', note? }  Nick and Nate only
//   GET  /api/projects/:id/blurb              a project I can see: its one-line description
//   PUT  /api/projects/:id/blurb              { blurb: string|null }  a project I can see
//
// Every handler runs on the caller's own handle (env.DB is viewer-bound). What
// a non-member may read is api/lib/project-join.ts's DirectoryRow, nothing else.

import type { AuthUser, Env } from '../helpers'
import { json, error } from '../helpers'
import type { Viewer } from '../lib/viewer-db'
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
    case 'existing': return json({ data: out.request, created: false })
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
  if (decision !== 'approve' && decision !== 'decline') return error("decision must be 'approve' or 'decline'", 400)
  const cleaned = cleanJoinNote(body?.note)
  if (!cleaned.ok) return error(cleaned.reason, 400)
  const out = await decideJoinRequest(env.DB, { id, deciderSlug: slug, decision, note: cleaned.note })
  switch (out.kind) {
    case 'forbidden': return error(out.reason, 403)
    case 'not_found': return error('Request not found', 404)
    case 'already':
      return json({ error: `Already ${out.request.status} by ${out.request.decided_by ?? 'someone'}`, code: 'decided', data: out.request }, 409)
    case 'decided': return json({ data: out.request })
  }
}

async function visibleProjectId(env: Env, ref: string): Promise<string | null> {
  if (!ref) return null
  const row = await env.DB.prepare(
    'SELECT id FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
  ).bind(ref, ref).first<{ id: string }>()
  return row?.id ?? null
}

/** GET /api/projects/:id/blurb */
export async function handleGetProjectBlurb(ref: string, env: Env): Promise<Response> {
  const id = await visibleProjectId(env, ref)
  if (!id) return error('Project not found', 404)
  const row = await env.DB.prepare('SELECT blurb, updated_by, updated_at FROM project_blurbs WHERE project_id = ?')
    .bind(id).first<{ blurb: string; updated_by: string; updated_at: string }>()
  return json({ data: { project_id: id, blurb: row?.blurb ?? null, updated_by: row?.updated_by ?? null, updated_at: row?.updated_at ?? null } })
}

/** PUT /api/projects/:id/blurb  body { blurb: string | null } */
export async function handleSetProjectBlurb(ref: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const id = await visibleProjectId(env, ref)
  if (!id) return error('Project not found', 404)
  const body = await readJson(request)
  if (!body || !('blurb' in body)) return error('JSON body { blurb } required', 400)
  const cleaned = cleanBlurb(body.blurb)
  if (!cleaned.ok) return error(cleaned.reason, 400)
  const who = user.slug && user.slug !== 'anonymous' ? user.slug : user.email
  if (cleaned.blurb === null) {
    await env.DB.prepare('DELETE FROM project_blurbs WHERE project_id = ?').bind(id).run()
  } else {
    // No upsert: viewer-db refuses ON CONFLICT DO UPDATE on a scoped table.
    const upd = await env.DB.prepare(
      "UPDATE project_blurbs SET blurb = ?, updated_by = ?, updated_at = datetime('now') WHERE project_id = ?",
    ).bind(cleaned.blurb, who, id).run()
    if ((upd.meta?.changes ?? 0) === 0) {
      await env.DB.prepare('INSERT INTO project_blurbs (project_id, blurb, updated_by) VALUES (?, ?, ?)')
        .bind(id, cleaned.blurb, who).run()
    }
  }
  return handleGetProjectBlurb(id, env)
}
