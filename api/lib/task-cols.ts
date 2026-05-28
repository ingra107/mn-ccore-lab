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
