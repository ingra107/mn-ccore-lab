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

// Tables that carry a `status` column and must have status='deleted' co-set
// alongside deleted_at on every soft-delete path (M33, 2026-05-29: forward
// guard). Mirrors STATUS_BEARING_DELETE_TABLES in mutations.ts — kept here
// as a local constant to avoid a circular import (lib → route).
const STATUS_BEARING_DELETE_TABLES = new Set(['tasks', 'projects']);

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
  /**
   * Set false for tables with NO project_id column (e.g. inbox_events). The
   * project-ACL SELECT hard-codes `project_id`, which 500s ("no such column:
   * project_id") on tables that lack it. Default true preserves the
   * project-scoped SELECT+gate for tasks/projects and every existing caller.
   */
  gateProject?: boolean;
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
  // Tables without a project_id column (e.g. inbox_events) opt out of the
  // project-ACL SELECT+gate, which otherwise 500s on the hard-coded project_id.
  const gateProject = args.gateProject !== false;

  if (mode === 'soft') {
    const cols = gateProject ? 'id, deleted_at, project_id' : 'id, deleted_at';
    const row = await env.DB.prepare(
      `SELECT ${cols} FROM ${table} WHERE id = ?`,
    ).bind(id).first<{ id: string; deleted_at: string | null; project_id?: string | null }>();

    if (!row) return hiddenResource();

    if (gateProject && row.project_id) {
      const block = await assertProjectVisible(request, env, row.project_id);
      if (block) return block;
    }

    if (row.deleted_at !== null) {
      return json({ data: { id, deleted: true, idempotent: true } });
    }

    // Co-set status='deleted' for status-bearing tables (M33, 2026-05-29).
    // tasks and projects must read status='deleted' AND deleted_at IS NOT NULL
    // so PB's pull guard (hub.py:1315-1339) accepts the tombstone instead of
    // refusing it as malformed. Lane-3 tables have no status column — exclude.
    const extraSet = STATUS_BEARING_DELETE_TABLES.has(table)
      ? `, status = 'deleted'`
      : '';
    await env.DB.prepare(
      `UPDATE ${table} SET deleted_at = datetime('now')${extraSet} WHERE id = ?`,
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
  const row = gateProject
    ? await env.DB.prepare(
        `SELECT id, project_id FROM ${table} WHERE id = ?`,
      ).bind(id).first<{ id: string; project_id: string | null }>()
    : null;

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
