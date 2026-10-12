// project-member-folders.ts -- my folder for this project (schema-v127).
//
//   GET    /api/projects/:id/my-folder   { data: { folder_path, updated_at } | null, can_set }
//   POST   /api/projects/:id/my-folder   { folder_path } set or replace mine
//   DELETE /api/projects/:id/my-folder   clear mine
//
// One local path per (person, project), private to that person. Every
// statement runs on the caller's handle (env.DB is viewer-bound) and names the
// caller's own slug; the table's scope rule (api/lib/table-scope.ts) also
// admits only the viewer's own rows, so one person's path never reaches
// another person through any route, the PI's included.
//
// Who may set one: a member of the project. That is not checked here: the row
// is a composite foreign key to project_members, so a non-member's INSERT
// fails at the arbiter and answers 403 not_a_project_member. A project the
// caller cannot see is a 404, exactly as everywhere else.
//
// The PB key has no person behind it and no folder: 403. PB keeps using
// projects.primary_folder (Nick's Box path) and never reads this table.
//
// Set is UPDATE-then-INSERT, never an upsert: viewer-db refuses ON CONFLICT DO
// UPDATE and REPLACE on a scoped table.

import type { Env } from '../helpers'
import { json, error } from '../helpers'
import type { Viewer } from '../lib/viewer-db'
import { checkLocalFolderPath } from '../../shared/localFolderPath'

export interface MyFolderRow {
  folder_path: string
  updated_at: string
}

function personSlug(viewer: Viewer | undefined): string | null {
  return viewer && viewer.kind === 'person' && viewer.slug ? viewer.slug : null
}

async function visibleProjectId(env: Env, ref: string): Promise<string | null> {
  if (!ref) return null
  const row = await env.DB.prepare(
    'SELECT id FROM projects WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1',
  ).bind(ref, ref).first<{ id: string }>()
  return row?.id ?? null
}

async function readMine(env: Env, projectId: string, me: string): Promise<MyFolderRow | null> {
  return env.DB.prepare(
    'SELECT folder_path, updated_at FROM project_member_folders WHERE project_id = ? AND member_slug = ?',
  ).bind(projectId, me).first<MyFolderRow>()
}

async function isMember(env: Env, projectId: string, me: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS one FROM project_members WHERE project_id = ? AND member_slug = ?',
  ).bind(projectId, me).first<{ one: number }>()
  return !!row
}

const NO_PERSON = 'A folder belongs to a signed-in person; the PB key has none'

/** GET /api/projects/:id/my-folder */
export async function handleGetMyFolder(ref: string, viewer: Viewer, env: Env): Promise<Response> {
  const me = personSlug(viewer)
  if (!me) return error(NO_PERSON, 403)
  const projectId = await visibleProjectId(env, ref)
  if (!projectId) return error('Project not found', 404)
  const [mine, member] = await Promise.all([readMine(env, projectId, me), isMember(env, projectId, me)])
  return json({ data: mine, can_set: member, project_id: projectId })
}

/** POST /api/projects/:id/my-folder  body { folder_path } */
export async function handleSetMyFolder(ref: string, request: Request, viewer: Viewer, env: Env): Promise<Response> {
  const me = personSlug(viewer)
  if (!me) return error(NO_PERSON, 403)
  const projectId = await visibleProjectId(env, ref)
  if (!projectId) return error('Project not found', 404)
  let body: { folder_path?: unknown }
  try { body = await request.json() as { folder_path?: unknown } } catch { return error('JSON body required', 400) }
  const check = checkLocalFolderPath(body.folder_path)
  if (!check.ok) return json({ error: check.reason, code: 'invalid_folder_path' }, 400)
  const updated = await env.DB.prepare(
    "UPDATE project_member_folders SET folder_path = ?, updated_at = datetime('now') WHERE project_id = ? AND member_slug = ?",
  ).bind(check.path, projectId, me).run()
  if ((updated.meta?.changes ?? 0) === 0) {
    try {
      await env.DB.prepare(
        'INSERT INTO project_member_folders (project_id, member_slug, folder_path) VALUES (?, ?, ?)',
      ).bind(projectId, me, check.path).run()
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (/FOREIGN KEY/i.test(msg)) {
        return json({ error: 'Join this project to keep a folder for it.', code: 'not_a_project_member' }, 403)
      }
      if (/UNIQUE|PRIMARY KEY/i.test(msg)) {
        // A second tab inserted between our UPDATE and INSERT; theirs stands, take ours.
        await env.DB.prepare(
          "UPDATE project_member_folders SET folder_path = ?, updated_at = datetime('now') WHERE project_id = ? AND member_slug = ?",
        ).bind(check.path, projectId, me).run()
      } else {
        throw e
      }
    }
  }
  return json({ data: await readMine(env, projectId, me), can_set: true, project_id: projectId })
}

/** DELETE /api/projects/:id/my-folder */
export async function handleClearMyFolder(ref: string, viewer: Viewer, env: Env): Promise<Response> {
  const me = personSlug(viewer)
  if (!me) return error(NO_PERSON, 403)
  const projectId = await visibleProjectId(env, ref)
  if (!projectId) return error('Project not found', 404)
  const res = await env.DB.prepare(
    'DELETE FROM project_member_folders WHERE project_id = ? AND member_slug = ?',
  ).bind(projectId, me).run()
  return json({ data: null, cleared: (res.meta?.changes ?? 0) > 0, can_set: await isMember(env, projectId, me), project_id: projectId })
}
