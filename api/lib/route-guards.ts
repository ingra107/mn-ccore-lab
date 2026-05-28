// route-guards.ts — Z2.1
//
// Runtime wrappers that make the resolve + visibility-gate pattern impossible
// to forget. resolveAndGuardProject() already exists as a helper, but callers
// can still forget to call it on a new route (codex Other-Primitive #2:
// "helper exists but caller forgets to use it").
//
// These wrappers make bypass structurally impossible: the inner handler
// RECEIVES the resolved projectId and cannot run without it. Any 403/400
// short-circuits before the inner is invoked.

import type { Env } from '../helpers';
import { resolveAndGuardProject, error } from '../helpers';
import { hiddenResource } from './hidden-resource';

/**
 * withProjectWrite — guarantee a write handler runs only after the body's
 * project_id has been resolved + PB-visibility-checked.
 *
 * Usage in api/routes/xxx.ts:
 *
 *   export async function handleCreateX(
 *     request: Request, user: AuthUser, env: Env,
 *   ): Promise<Response> {
 *     const body = await request.json() as CreateXBody;
 *     return withProjectWrite(
 *       async (req, e, projectId) => {
 *         // projectId is the canonical resolved form; PB gate already passed.
 *         ...
 *       }
 *     )(request, env, body);
 *   }
 *
 * The wrapper reads body.project_id, runs resolveAndGuardProject (one SELECT),
 * and passes the canonical projectId to the inner handler. Missing project_id
 * → 400. Invisible project → 403. Inner never runs on either path.
 */
export function withProjectWrite<TBody extends { project_id?: string }>(
  inner: (req: Request, env: Env, projectId: string, body: TBody) => Promise<Response>,
): (req: Request, env: Env, body: TBody) => Promise<Response> {
  return async (req, env, body) => {
    if (!body.project_id) {
      return error('project_id required', 400);
    }
    const { block, projectId } = await resolveAndGuardProject(req, env, body.project_id);
    if (block) return block;
    return inner(req, env, projectId, body);
  };
}

/**
 * withOptionalProjectWrite — like withProjectWrite, but project-less rows are
 * allowed. Inner receives projectId: string | null.
 *
 * Used by conference_submissions where project_id is optional (lab-wide
 * conferences that are not linked to a specific manuscript project).
 * The PB visibility gate runs when project_id IS present; absent = no gate.
 */
export function withOptionalProjectWrite<TBody extends { project_id?: string }>(
  inner: (req: Request, env: Env, projectId: string | null, body: TBody) => Promise<Response>,
): (req: Request, env: Env, body: TBody) => Promise<Response> {
  return async (req, env, body) => {
    if (!body.project_id) {
      return inner(req, env, null, body);
    }
    const { block, projectId } = await resolveAndGuardProject(req, env, body.project_id);
    if (block) return block;
    return inner(req, env, projectId, body);
  };
}

/**
 * withTaskProject — for handlers that take a task id from the URL and need
 * the parent project resolved + gated before the handler runs.
 *
 * Pattern: SELECT project_id FROM tasks WHERE id = ? → resolveAndGuardProject
 * on that project_id → call inner with (taskId, projectId).
 * Project-less tasks (lab-wide) pass projectId: null; no visibility gate.
 */
export function withTaskProject(
  inner: (req: Request, env: Env, taskId: string, projectId: string | null) => Promise<Response>,
): (req: Request, env: Env, taskId: string) => Promise<Response> {
  return async (req, env, taskId) => {
    const task = await env.DB.prepare(
      'SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL',
    ).bind(taskId).first<{ project_id: string | null }>();
    if (!task) return error('Task not found', 404);
    if (task.project_id) {
      const { block, projectId } = await resolveAndGuardProject(req, env, task.project_id);
      if (block) return block;
      return inner(req, env, taskId, projectId);
    }
    // Project-less tasks (lab-wide) — inner gets null projectId; no visibility gate.
    return inner(req, env, taskId, null);
  };
}

/**
 * withExistingRowProject — for update/delete handlers that take a row id and
 * need the row's parent project resolved + gated BEFORE mutation. Generic over
 * table name; the table must have a `project_id` column.
 *
 * Existence oracle fix (codex final-audit #2, 2026-05-28): both the missing-row
 * path and the hidden-row path return hiddenResource() (404, uniform envelope)
 * so callers cannot distinguish "row does not exist" from "row exists but is
 * attached to a PB project the caller cannot see." This closes the status-code
 * oracle that the Z4.1 hidden-resource primitive was designed to prevent.
 */
export function withExistingRowProject(
  table: string,
  inner: (req: Request, env: Env, rowId: string, projectId: string | null) => Promise<Response>,
): (req: Request, env: Env, rowId: string) => Promise<Response> {
  return async (req, env, rowId) => {
    const row = await env.DB.prepare(
      `SELECT project_id FROM ${table} WHERE id = ?`,
    ).bind(rowId).first<{ project_id: string | null }>();
    if (!row) return hiddenResource();
    if (row.project_id) {
      const { block, projectId } = await resolveAndGuardProject(req, env, row.project_id);
      if (block) return hiddenResource();
      return inner(req, env, rowId, projectId);
    }
    return inner(req, env, rowId, null);
  };
}
