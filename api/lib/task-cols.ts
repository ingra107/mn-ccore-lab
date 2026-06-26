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

// AM-5 (SEC-T0-4): explicit task column list that EXCLUDES the private
// `notes` column. `notes` is the brain.db private field (team-visible content
// lives in `description`); `SELECT t.*` leaked it on both the list and the
// detail endpoints before this fix. Prefixed `t.` so it composes with the
// meetings LEFT JOIN. Exported so other route modules (proactive-brief, etc.)
// can reuse without duplicating the column list.
const TASK_PLAIN_COLS = [
  'id', 'meeting_id', 'title', 'description', 'assignee',
  'assigned_by', 'due_date', 'priority', 'status', 'source', 'completed',
  'completed_at', 'completed_by', 'created_at', 'updated_at', 'deleted_at',
  'acknowledged_at', 'acknowledged_by', 'watchers', 'reminder_days',
  'instructions', 'key_link_1', 'key_link_1_desc', 'key_link_2',
  'key_link_2_desc', 'key_link_3', 'key_link_3_desc', 'effort', 'short_title',
  'source_thread_id', 'related_message_ids', 'blocked_by', 'description_json',
  'group_override', 'seq', 'deadline', 'waiting_on', 'promised_to',
  'promise_date', 'next_checkin_date', 'nick_followup_date',
  'requires_nick_brain', 'estimated_minutes', 'deadline_type', 'next_artifact',
  'inbox_event_id', 'last_mutation_id',
  // Slice B B-5 (2026-06-06): waiting_since + email_link promoted from PB-only
  // to Hub-canonical synced columns. Must be in TASK_PLAIN_COLS so pull returns
  // them (write-accept without read-expose = not Hub-rebuildable, R10 class).
  'waiting_since', 'email_link',
  // Workstream B (schema-v75, 2026-06-09): the Today operating-day plan as synced
  // task columns (replaces the per-browser today_state_* localStorage blob).
  // planned_for (civil date) / plan_slot ('right_now'|'strip'|'between-<n>') /
  // plan_rank (REAL ordering). Must be read-exposed so /api/tasks returns them for
  // the Today/MyTasks frontend AND so PB pull mirrors them (R10 Hub-rebuildable).
  'planned_for', 'plan_slot', 'plan_rank',
  // Today timeline task-blocks Phase 2 (schema-v87, 2026-06-19): fine start time,
  // minutes since midnight (0..1439); NULL = not time-positioned. Read-exposed so
  // /api/tasks returns it AND PB pull mirrors it (R10 Hub-rebuildable).
  'plan_start_min',
  // Meeting Accept/Decline (schema-v90, 2026-06-25): approval status for
  // source='meeting_approval' tasks — 'pending'|'accepted'|'declined'|null.
  // Not private (not in TASK_PRIVATE_COLS), must be read-exposed so Accept/Decline
  // patches round-trip and PB pull mirrors the field (R10 Hub-rebuildable).
  'approval_status',
  // NOTE: `notes` is deliberately omitted — private brain.db field.
  // NOTE: `project_id` is NOT in this list — it is resolved to slug below.
];

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
