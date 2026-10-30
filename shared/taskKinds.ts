// shared/taskKinds.ts — the ONE vocabulary for tasks.kind (schema-v109, PB mig
// 128, 2026-09-16, GH #131/#132). Imported by BOTH the API (api/routes/tasks.ts
// value guard) and the UI (src/*) via relative import, the way
// shared/activityKinds.ts is, so the guard and the renderer cannot drift.
//
// A milestone is a task row with kind='milestone': same project link, due
// date, assignee, activity thread and sync as any task. Only the rendering
// differs — a half-height dated rule with no done box, interleaved by due date
// inside its Today group (src/components/tasks/TaskRow.tsx variant prop; never
// a forked row, Rule 68).
//
// A question is a task row with kind='question' (schema-v111, PB mig 130,
// 2026-09-17): a process is waiting on Nick's answer. The ask lives in
// question_spec_json, the answer in question_answer_json (NULL = unanswered),
// the Telegram card handle in question_telegram_json. Questions are MINTED by a
// PB producer, never typed by a person, so 'question' is deliberately absent
// from TASK_KIND_OPTIONS (the Kind picker); the API chokepoint refuses a
// kind='question' row with no spec, so the picker could not mint a valid one
// anyway. Answered is not done: the consumer closes the row after its durable
// effect (api/routes/mutations.ts applyPatch refuses done/deleted while the
// answer is NULL).
//
// A check-in is a task row with kind='checkin' (schema-v152, PB mig 155,
// 2026-10-30): a one-line, one-tap follow-up titled "Check in: ...". It groups
// as Quick, never Deep Work, and it is not a project's next step. The title
// prefix is stored (schema-v152 trg_tasks_checkin_title_*), so a check-in reads
// as one on every surface that renders `title`. Not in TASK_KIND_OPTIONS yet:
// flipping an ordinary task to a check-in would fail on its title, and the
// check-in UI waits on Nick's mockup pick.

export const TASK_KINDS = ['task', 'milestone', 'question', 'checkin'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const DEFAULT_TASK_KIND: TaskKind = 'task';

/** Picker options for the Kind select (TaskDetailPanel + the drawers' field
 *  row). 'question' is minted, never picked — see the header. */
export const TASK_KIND_OPTIONS: ReadonlyArray<{ value: TaskKind; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'milestone', label: 'Milestone' },
];

export function isTaskKind(v: unknown): v is TaskKind {
  return typeof v === 'string' && (TASK_KINDS as readonly string[]).includes(v);
}

export function isMilestone(t: { kind?: string | null } | null | undefined): boolean {
  return t?.kind === 'milestone';
}

export function isQuestion(t: { kind?: string | null } | null | undefined): boolean {
  return t?.kind === 'question';
}

/** The title every check-in starts with (schema-v152 refuses any other). */
export const CHECKIN_TITLE_PREFIX = 'Check in: ';

export function isCheckin(t: { kind?: string | null } | null | undefined): boolean {
  return t?.kind === 'checkin';
}

/**
 * #8842 R4: the PB consumer closes a question after it acts on the answer;
 * the API refuses a close that does not carry the consumer's receipt
 * (question_unconsumed), and a Hub-UI write never carries one. So a
 * question row does not offer Done, unless it is already done (then the
 * select still has to show its value).
 */
export function statusOptionsFor<T extends { value: string }>(options: readonly T[], kind: string | null | undefined, status: string | null | undefined): T[] {
  if (kind !== 'question' || status === 'done') return [...options];
  return options.filter((o) => o.value !== 'done');
}

/**
 * SQL for "this row is an ordinary task, not a question for Nick". A question
 * is waiting on an answer, not on work: it shows only on the Today "Needs you"
 * card, and its due_date is the snooze date, so it must stay out of every task
 * list, count, overdue view and digest. Add this to any server query that
 * lists or counts open work. Pass the table alias ('t') when the query has one.
 * NULL kind reads as 'task' (the column is NOT NULL DEFAULT 'task', but old
 * test fixtures and PB-local rows may omit it).
 */
export function notQuestionSql(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(${p}kind, 'task') <> 'question'`;
}
export const NOT_QUESTION_SQL = notQuestionSql();
export const NOT_QUESTION_SQL_T = notQuestionSql('t');
