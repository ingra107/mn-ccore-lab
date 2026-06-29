/**
 * Shared task column definitions.
 *
 * Moved out of api/routes/tasks.ts so that api/helpers.ts can use
 * TASK_SELECT_COLS (for safeTaskRow) without creating a circular dependency
 * (helpers ← tasks ← helpers).
 *
 * Keep TASK_PRIVATE_COLS in sync with the `notes` omission comment below.
 * Any column added here must NOT be in TASK_PRIVATE_COLS, and vice-versa.
 */

// Generated from schema_dsl §6 — see pb-schema/pb_schema/generated/route-field-lists.generated.ts / backlog #225 A1.
// NOTE: `notes` deliberately omitted (private brain.db field). `project_id` resolved to slug below via PROJECT_ID_AS_SLUG.
import { TASK_PLAIN_COLS } from '../../pb-schema/pb_schema/generated/route-field-lists.generated.ts';
export { TASK_PLAIN_COLS };

// `project_id` slug-resolution at the READ boundary (Direction 1, 2026-06-05).
// STORAGE holds the typed proj_* PK (P2 `aa85c71b`), but every read consumer —
// the Hub frontend's slug-keyed project maps AND the PB→Hub pull (which reads
// the field as `d1_project_slug`) — expects the SLUG. Resolving here, in the
// ONE shared column list, means no task-read endpoint can leak the typed PK
// (the half-migration bug). Correlated subquery, id-only lookup: projects.id is
// the unique PK and `slug == id` holds on 0 rows, so COALESCE is unambiguous —
// it returns the project's slug for the typed-PK majority and falls back to the
// raw stored value for any legacy slug-stored straggler. (Internal mutation
// paths — applyInsert/advanceProjectMovement/cascade — keep using the stored
// typed PK; this is purely the wire/presentation form.) See decision doc
// Context/Decisions/2026-06-05-tasks-project-id-store-typed-present-slug.md.
const PROJECT_ID_AS_SLUG =
  'COALESCE((SELECT p.slug FROM projects p WHERE p.id = t.project_id), t.project_id) AS project_id';

export const TASK_SELECT_COLS = [
  ...TASK_PLAIN_COLS.map((c) => `t.${c}`),
  PROJECT_ID_AS_SLUG,
].join(', ');

/**
 * A2 (Slice C, 2026-06-08): `TASK_SELECT_COLS_TYPED` — sync/wire read shape.
 *
 * Returns the raw stored `t.project_id` (the typed `proj_*` PK) instead of the
 * COALESCE slug-resolution. Consumed by `handleGetTasks` when `?wire=typed` is
 * present (gated to authenticated/PI callers via `canSeePb`). The browser/Hub-UI
 * always uses the default TASK_SELECT_COLS (slug form); PB sync pull uses typed
 * so the brain.db cache stores the same PK form that Hub stores internally.
 *
 * Do NOT pass PROJECT_ID_AS_SLUG here — that would defeat the purpose (PB would
 * receive slugs instead of typed PKs, which is the P2 half-migration bug class).
 *
 * TASK_SELECT_COLS is pinned by task-cols.test.ts:52-63 and MUST NOT change.
 */
export const TASK_SELECT_COLS_TYPED = [
  ...TASK_PLAIN_COLS.map((c) => `t.${c}`),
  't.project_id',
].join(', ');

/**
 * Columns that must be stripped from a full task row (SELECT *) before the
 * row is returned to callers. Currently only `notes`. Add here if future
 * private columns are introduced — safeTaskRow uses this list.
 *
 * Must stay in sync with the omission list above: any column in
 * TASK_PRIVATE_COLS MUST be absent from TASK_SELECT_COLS.
 */
export const TASK_PRIVATE_COLS = new Set<string>(['notes']);

/**
 * T2.5 (2026-05-28) · `TABLE_PRIVATE_COLS` — per-table registry of private
 * columns. Generalizes the tasks-only TASK_PRIVATE_COLS so future tables with
 * private fields can register them once and have every SELECT * return path
 * pick them up via `safeRow(table, row)`.
 *
 * Z3.1 (2026-05-28): expanded to cover the 3 non-tasks tables codex flagged.
 * Adding a private column to a new table: add the table key here with a Set
 * of column names. safeRow strips them automatically; the old per-table
 * helpers (safeTaskRow) stay as backward-compat re-exports.
 */
export const TABLE_PRIVATE_COLS: Record<string, Set<string>> = {
  tasks: TASK_PRIVATE_COLS,
  email_drafts: new Set<string>(['body_text', 'body_html', 'thread_id', 'gmail_draft_url']),
  file_attachments: new Set<string>(['r2_key']),
  inbox_events: new Set<string>(['raw_payload_json', 'notes']),
  regulatory_items: new Set<string>(['notes']),
};

/**
 * T2.5 (2026-05-28) · `safeRow(table, row)` — strip TABLE_PRIVATE_COLS[table]
 * columns from any row. No-op when the table has no registered private cols.
 * Returns a shallow copy (matches safeTaskRow's contract: never mutates input).
 *
 * Used by api/routes/mutations.ts::readCanonical to replace the tasks-only
 * special case (`table === 'tasks' ? safeTaskRow(row) : row`) with a
 * registry-driven dispatch.
 */
export function safeRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const privateCols = TABLE_PRIVATE_COLS[table];
  if (!privateCols || privateCols.size === 0) return row;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!privateCols.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * T2.6 (2026-05-28) · `FK_SLUG_FIELDS` — per-table registry of FK columns whose
 * value is a project id-or-slug that must be canonicalized to the stored form
 * (`slug || id`) before write. Generalizes the tasks-only project_id
 * canonicalization in applyInsert: any new table with a projects-FK column
 * registers here and gets resolved automatically.
 *
 * Semantics: each column listed for a given table will be looked up via
 * projectRefToCanonical at write time; unresolvable refs become NULL (no
 * reject, mirroring the existing /api/tasks behavior — PB may push before
 * the project row arrives on Hub, then a later sync resolves it).
 *
 * Z3.2 (2026-05-28): expanded from tasks-only to every project-linked Hub
 * table. /api/mutations applyInsert consults this registry — unregistered
 * tables silently store the raw ref (sync drift class).
 */
export const FK_SLUG_FIELDS: Record<string, string[]> = {
  tasks: ['project_id'],
  submission_events: ['project_id'],
  conference_submissions: ['project_id'],
  regulatory_items: ['project_id'],
  manuscript_revisions: ['project_id'],
  project_documents: ['project_id'],
  // deadline_dependencies intentionally absent: no project_id column (straddles
  // upstream_id + downstream_id); Z4.3 exempts it from FK_SLUG_FIELDS handling.
};
