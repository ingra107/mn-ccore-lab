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
export const TASK_SELECT_COLS = [
  'id', 'meeting_id', 'project_id', 'title', 'description', 'assignee',
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
  // NOTE: `notes` is deliberately omitted — private brain.db field.
].map((c) => `t.${c}`).join(', ');

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
