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

/** The activity line for a delete: "Deleted conference", not
 *  "conferences 4f1c... deleted" (a table name and a 32-character id read on
 *  the Overview feed and ran past its card edge, O2B 2026-10-14). The row's id
 *  stays in related_id. */
export function deletedDescription(entityType: string): string {
  return `Deleted ${entityType.replace(/_/g, ' ')}`;
}

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
   * Name of the column holding the project FK when it is not `project_id`
   * (paper_project_links keeps it in `project_slug` — a typed id since Z3.2
   * despite the name). When named, the row MUST carry it (a typo throws
   * rather than skipping the gate). When omitted, the gate runs on
   * `project_id` if the table has one and is skipped if it does not.
   */
  projectColumn?: string;
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
/** The row's project reference, or null when the table has none. */
function projectRefOf(row: Record<string, unknown>, table: string, projectColumn: string | undefined): string | null {
  const column = projectColumn ?? 'project_id';
  if (projectColumn && !Object.prototype.hasOwnProperty.call(row, column)) {
    throw new Error(`idempotentDelete: ${table} has no column ${column}`);
  }
  const v = row[column];
  return typeof v === 'string' && v !== '' ? v : null;
}

export async function idempotentDelete(args: IdempotentDeleteArgs): Promise<Response> {
  const { table, id, mode, request, env } = args;

  // `SELECT *`, then read the project column off the row. Naming a column in
  // the SELECT 500'd ("no such column: project_id") on every table without
  // one: the Literature unlink until 2026-09-16, and expertise tags, calendar
  // feeds and subtasks until 2026-10-14 (overnight audit G11-9). A table either
  // carries the column (gate runs) or it does not (nothing to gate); there is
  // no flag to get wrong.
  const row = await env.DB.prepare(
    `SELECT * FROM ${table} WHERE id = ?`,
  ).bind(id).first<Record<string, unknown>>();
  const projectRef = row ? projectRefOf(row, table, args.projectColumn) : null;

  if (mode === 'soft') {
    if (!row) return hiddenResource();

    if (projectRef) {
      const block = await assertProjectVisible(request, env, projectRef);
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
        deletedDescription(args.activityEntityType ?? table),
        args.actorSlug,
        id,
        args.activityEntityType ?? table,
      );
    }

    return json({ data: { id, deleted: true, idempotent: false } });
  }

  // hard mode
  // The pre-flight SELECT above only gates on PB visibility; the DELETE is the
  // source of truth for whether a row existed (meta.changes).
  if (projectRef) {
    const block = await assertProjectVisible(request, env, projectRef);
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
      deletedDescription(args.activityEntityType ?? table),
      args.actorSlug,
      id,
      args.activityEntityType ?? table,
    );
  }

  return json({ data: { id, deleted: true, idempotent: !changed } });
}
