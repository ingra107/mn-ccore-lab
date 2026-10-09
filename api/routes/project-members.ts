// project-members.ts -- who is on a project (#145 Lane B, schema-v120).
//
//   GET    /api/projects/:id/members         the project's members
//   POST   /api/projects/:id/members         { slug } add a member
//   DELETE /api/projects/:id/members/:slug   remove a member
//   GET    /api/team/:slug/projects          the projects a member is on
//
// Every query runs on the caller's handle (env.DB is viewer-bound), so a
// project the caller cannot see answers 404 here exactly as it does
// everywhere else, and GET /api/team/:slug/projects lists only the projects
// the CALLER can see that the member is on (Casey looking at Nate's page does
// not learn the names of Nate's other projects).
//
// Authority (Nick's rulings, 2026-10-08):
//   add     anyone who can see the project: a member, the PB key, or Nick with
//           "show all projects" on (a project he is not on is invisible to him
//           otherwise, so a PI who can see it is one of those).
//   remove  a PI (that can see it), the PB key, or the member themself.
// There is no self-join from a directory in this issue: you are added.

import type { AuthUser, Env } from '../helpers'
import { json, error, logActivity } from '../helpers'
import type { Viewer } from '../lib/viewer-db'

export interface ProjectMemberRow {
  slug: string
  name: string | null
  preferred_name: string | null
  photo_url: string | null
  member_type: string | null
  email: string | null
  added_by: string
  created_at: string
}

export interface MemberProjectRow {
  id: string
  slug: string | null
  title: string
  status: string | null
  stage: string | null
  category: string | null
  added_by: string
  joined_at: string
}

async function visibleProject(env: Env, ref: string): Promise<{ id: string; title: string } | null> {
  if (!ref) return null
  return env.DB.prepare(
    'SELECT id, title FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
  ).bind(ref, ref).first<{ id: string; title: string }>()
}

async function memberList(env: Env, projectId: string): Promise<ProjectMemberRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT tm.slug AS slug, tm.name AS name, tm.preferred_name AS preferred_name, tm.photo_url AS photo_url,
            tm.member_type AS member_type, tm.email AS email, pm.added_by AS added_by, pm.created_at AS created_at
       FROM project_members pm JOIN team_members tm ON tm.slug = pm.member_slug
      WHERE pm.project_id = ?
      ORDER BY COALESCE(tm.preferred_name, tm.name, tm.slug) COLLATE NOCASE`,
  ).bind(projectId).all<ProjectMemberRow>()
  return results ?? []
}

/** GET /api/projects/:id/members */
export async function handleGetProjectMembers(ref: string, env: Env): Promise<Response> {
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  return json({ data: await memberList(env, project.id), project_id: project.id })
}

/** POST /api/projects/:id/members  body { slug } */
export async function handleAddProjectMember(ref: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  let body: { slug?: unknown }
  try { body = await request.json() as { slug?: unknown } } catch { return error('JSON body required', 400) }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!slug) return error('slug required', 400)
  const member = await env.DB.prepare('SELECT slug FROM team_members WHERE slug = ?').bind(slug).first<{ slug: string }>()
  if (!member) return error(`No team member with slug "${slug}"`, 400)
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, ?, ?)',
  ).bind(project.id, slug, user.slug).run()
  const added = (res.meta?.changes ?? 0) > 0
  if (added) await logActivity(env, 'project', `Added ${slug} to ${project.title}`, user.email, project.id, 'project')
  return json({ data: await memberList(env, project.id), project_id: project.id, added }, added ? 201 : 200)
}

/** DELETE /api/projects/:id/members/:slug */
export async function handleRemoveProjectMember(
  ref: string, memberSlug: string, user: AuthUser, viewer: Viewer, env: Env,
): Promise<Response> {
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  const slug = (memberSlug ?? '').trim().toLowerCase()
  const self = viewer.kind === 'person' && viewer.slug === slug
  const pi = viewer.kind === 'service' || (viewer.kind === 'person' && viewer.pi)
  if (!self && !pi) return error('Only a PI or the member themself can remove a member', 403)
  const res = await env.DB.prepare(
    'DELETE FROM project_members WHERE project_id = ? AND member_slug = ?',
  ).bind(project.id, slug).run()
  const removed = (res.meta?.changes ?? 0) > 0
  if (!removed) return error('Not a member of this project', 404)
  await logActivity(env, 'project', `Removed ${slug} from ${project.title}`, user.email, project.id, 'project')
  // A member who removed themself can no longer read the list; answer without it.
  const visible = await visibleProject(env, project.id)
  return json({ data: visible ? await memberList(env, project.id) : [], project_id: project.id, removed })
}

/** GET /api/team/:slug/projects */
export async function handleGetMemberProjects(memberSlug: string, env: Env): Promise<Response> {
  const slug = (memberSlug ?? '').trim().toLowerCase()
  const { results } = await env.DB.prepare(
    `SELECT p.id AS id, p.slug AS slug, p.title AS title, p.status AS status, p.stage AS stage, p.category AS category,
            pm.added_by AS added_by, pm.created_at AS joined_at
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
      WHERE pm.member_slug = ? AND p.deleted_at IS NULL
      ORDER BY p.title COLLATE NOCASE`,
  ).bind(slug).all<MemberProjectRow>()
  return json({ data: results ?? [] })
}
