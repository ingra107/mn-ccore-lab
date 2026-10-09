// pins.ts -- a person's pinned projects (the sidebar's "My projects" list and
// the Projects page star), stored server-side so a pin follows the person
// across devices (Nick, 2026-10-09: pins are per person, on the server).
//
//   GET    /api/pins             the caller's pinned projects, oldest pin first
//   POST   /api/pins             { project } pin a project (id or slug)
//   DELETE /api/pins/:project    unpin (id or slug)
//
// Storage is the existing D1 `watchlist` table (schema-v49): one row per
// (member_slug, 'project', entity_id), unique on the triple. No migration.
// entity_id holds the project's typed id (proj_*), never its slug, because a
// slug can be renamed and a pin must survive that. A row written earlier with
// a slug still reads back (the GET joins on id OR slug).
//
// Who sees what. env.DB is the viewer-bound handle (api/lib/viewer-db.ts), so
// `projects` here is the caller's visible set: a project the caller cannot
// see answers 404 on POST and never comes back from GET, even if a row for it
// exists (membership was removed after the pin). The watchlist rule in
// table-scope.ts limits rows by the ENTITY's visibility only, not by whose row
// it is, so every statement below also names member_slug = the caller: one
// person's pins are never read or removed by another.

import type { AuthUser, Env } from '../helpers'
import { json, error } from '../helpers'

export interface PinRow {
  project_id: string
  slug: string | null
  pinned_at: string | null
}

function callerSlug(user: AuthUser): string | null {
  const slug = (user.slug ?? '').trim()
  return slug && slug !== 'anonymous' ? slug : null
}

async function visibleProject(env: Env, ref: string): Promise<{ id: string; slug: string | null } | null> {
  if (!ref) return null
  return env.DB.prepare(
    'SELECT id, slug FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
  ).bind(ref, ref).first<{ id: string; slug: string | null }>()
}

export async function handleGetPins(user: AuthUser, env: Env): Promise<Response> {
  const me = callerSlug(user)
  if (!me) return json({ data: [] })
  const { results } = await env.DB.prepare(
    `SELECT p.id AS project_id, p.slug AS slug, MIN(w.created_at) AS pinned_at
       FROM watchlist w
       JOIN projects p ON (p.id = w.entity_id OR p.slug = w.entity_id) AND p.deleted_at IS NULL
      WHERE w.member_slug = ? AND w.entity_type = 'project'
      GROUP BY p.id, p.slug
      ORDER BY pinned_at, p.id`,
  ).bind(me).all<PinRow>()
  return json({ data: results ?? [] })
}

export async function handleCreatePin(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const me = callerSlug(user)
  if (!me) return error('Authentication required', 401)
  const body = await request.json().catch(() => ({})) as { project?: unknown }
  const ref = typeof body.project === 'string' ? body.project.trim() : ''
  if (!ref) return error('project (id or slug) required', 400)
  const project = await visibleProject(env, ref)
  if (!project) return error('Project not found', 404)
  // INSERT OR IGNORE, never an upsert: the unique index (member_slug,
  // entity_type, entity_id) makes a second pin a no-op, and viewer-db refuses
  // ON CONFLICT DO UPDATE on a scoped table.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO watchlist (id, member_slug, entity_type, entity_id)
     VALUES (?, ?, 'project', ?)`,
  ).bind(`pin_${crypto.randomUUID()}`, me, project.id).run()
  return json({ data: { project_id: project.id, slug: project.slug, pinned: true } }, 201)
}

export async function handleDeletePin(ref: string, user: AuthUser, env: Env): Promise<Response> {
  const me = callerSlug(user)
  if (!me) return error('Authentication required', 401)
  const project = await visibleProject(env, decodeURIComponent(ref ?? '').trim())
  if (!project) return error('Project not found', 404)
  // Both spellings: the typed id this route writes, and a slug an older row
  // may hold. Idempotent: unpinning what is not pinned answers 200.
  const refs = [project.id, project.slug].filter((s): s is string => !!s)
  await env.DB.prepare(
    `DELETE FROM watchlist
      WHERE member_slug = ? AND entity_type = 'project' AND entity_id IN (${refs.map(() => '?').join(', ')})`,
  ).bind(me, ...refs).run()
  return json({ data: { project_id: project.id, slug: project.slug, pinned: false } })
}
