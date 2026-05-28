// idempotent-delete.ts — Z4.2
//
// Codex's Other-Primitive #6: delete handlers each hand-roll idempotency
// semantics. Some tables soft-delete (have deleted_at column), some hard-
// delete (no column). Anti-recommendation: do NOT force all to soft.
//
// idempotentDelete() encodes table capability per call site. Soft mode
// requires the table to have deleted_at; hard mode unconditionally DELETEs
// and reports based on meta.changes.

import type { Env } from '../helpers';
import { json, logActivity, assertProjectVisible } from '../helpers';
import { hiddenResource } from './hidden-resource';

export interface IdempotentDeleteArgs {
  table: string;
  id: string;
  mode: 'soft' | 'hard';
  request: Request;
  env: Env;
  /** Optional: caller slug for the activity log. If omitted, no log is emitted. */
  actorSlug?: string | null;
  /** Activity-log category (e.g. 'submission', 'conference'). Required if actorSlug set. */
  activityCategory?: string;
  /** Activity-log entity-type label. Defaults to the table name. */
  activityEntityType?: string;
}

/**
 * Idempotent delete with optional PB-visibility gate.
 *
 * Soft mode (table has deleted_at):
 *   - If row absent → hiddenResource() (404).
 *   - If row.deleted_at != null → 200 idempotent:true (no log — nothing new happened).
 *   - Else UPDATE deleted_at = now → 200 idempotent:false (activity log if actorSlug set).
 *
 * Hard mode (no deleted_at column):
 *   - SELECT project_id first to gate on PB visibility (if column present in row).
 *   - DELETE; meta.changes == 0 → 200 idempotent:true (already gone);
 *             meta.changes > 0 → 200 idempotent:false (log if actorSlug set).
 *   - No 404 on missing row in hard mode — hard-delete is idempotent by
 *     definition: the desired end-state (row absent) is already achieved.
 *
 * Both modes:
 *   - Pre-mutation, if the row carries project_id, assertProjectVisible runs.
 *     A 403 from the gate short-circuits before the mutation.
 *
 * Z4.3 EXEMPTIONS (documented here so future callers know):
 *   - deadline_dependencies: straddles TWO project IDs (upstream + downstream);
 *     keep hand-rolled with double gate until idempotentDelete gains a
 *     multi-project hook.
 *   - file_attachments: has an R2 side-effect (env.FILES.delete(r2_key)) that
 *     this wrapper does not model; keep hand-rolled with an exemption comment.
 */
export async function idempotentDelete(args: IdempotentDeleteArgs): Promise<Response> {
  const { table, id, mode, request, env } = args;

  if (mode === 'soft') {
    const row = await env.DB.prepare(
      `SELECT id, deleted_at, project_id FROM ${table} WHERE id = ?`,
    ).bind(id).first<{ id: string; deleted_at: string | null; project_id: string | null }>();

    if (!row) return hiddenResource();

    if (row.project_id) {
      const block = await assertProjectVisible(request, env, row.project_id);
      if (block) return block;
    }

    if (row.deleted_at !== null) {
      return json({ data: { id, deleted: true, idempotent: true } });
    }

    await env.DB.prepare(
      `UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`,
    ).bind(id).run();

    if (args.actorSlug && args.activityCategory) {
      await logActivity(
        env,
        args.activityCategory,
        `${table} ${id} soft-deleted`,
        args.actorSlug,
        id,
        args.activityEntityType ?? table,
      );
    }

    return json({ data: { id, deleted: true, idempotent: false } });
  }

  // hard mode
  // Pre-flight SELECT to gate on PB visibility if the row has a project_id.
  // The SELECT result is discarded after the gate check — the DELETE is the
  // source of truth for whether a row existed (meta.changes).
  const row = await env.DB.prepare(
    `SELECT id, project_id FROM ${table} WHERE id = ?`,
  ).bind(id).first<{ id: string; project_id: string | null }>();

  if (row?.project_id) {
    const block = await assertProjectVisible(request, env, row.project_id);
    if (block) return block;
  }

  const result = await env.DB.prepare(
    `DELETE FROM ${table} WHERE id = ?`,
  ).bind(id).run();

  const changed = (result.meta?.changes ?? 0) > 0;

  if (changed && args.actorSlug && args.activityCategory) {
    await logActivity(
      env,
      args.activityCategory,
      `${table} ${id} deleted`,
      args.actorSlug,
      id,
      args.activityEntityType ?? table,
    );
  }

  return json({ data: { id, deleted: true, idempotent: !changed } });
}
