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
// 2026-10-30): a one-line, one-tap follow-up. It groups as Quick, never Deep
// Work, and it is not a project's next step. Its title is the bare subject
// (schema-v156 dropped the stored "Check in: " prefix and its triggers, Nick
// 2026-11-03): kind is the one fact, and a surface that shows the row as text
// labels it through withKindLabel below. It IS in TASK_KIND_OPTIONS: the
// picker sends { kind } and nothing else.

export const TASK_KINDS = ['task', 'milestone', 'question', 'checkin'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const DEFAULT_TASK_KIND: TaskKind = 'task';

/** The ONE display label per kind. Every surface that shows a kind goes
 *  through this (Record<TaskKind, ...> so a new kind fails tsc until it has a
 *  label and can never render raw). */
export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  task: 'Task',
  milestone: 'Milestone',
  question: 'Question',
  checkin: 'Check-in',
};

export function taskKindLabel(kind: string | null | undefined): string {
  return isTaskKind(kind) ? TASK_KIND_LABELS[kind] : TASK_KIND_LABELS[DEFAULT_TASK_KIND];
}

/** Picker options for the Kind select (TaskDetailPanel + the drawers' field
 *  row). 'question' is minted, never picked — see the header. */
export const TASK_KIND_OPTIONS: ReadonlyArray<{ value: TaskKind; label: string }> = (
  ['task', 'milestone', 'checkin'] as const
).map((value) => ({ value, label: TASK_KIND_LABELS[value] }));

/** The kinds a TEXT surface names in words: "Check-in: X", "Milestone: X"
 *  (Nick 2026-11-03, schema-v156). A text surface is one that shows the row as
 *  plain words with no kind-aware shape: digest email, calendar, search,
 *  Telegram (PB short_title.task_label is the twin), the Hub's compact lists.
 *  A row that DRAWS its kind (CheckinRow's label, a milestone's diamond) shows
 *  the bare subject instead, so the kind is never said twice. 'task' is the
 *  default and 'question' never reaches a work list, so neither is labelled. */
export const TEXT_LABELED_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['checkin', 'milestone']);

/** The text label for a row of this kind: "Check-in: X" / "Milestone: X", or
 *  the text unchanged for every other kind. Empty text stays empty, so a
 *  caller's own fallback ("Untitled") still fires. */
export function withKindLabel(kind: string | null | undefined, text: string): string {
  if (!text || !isTaskKind(kind) || !TEXT_LABELED_KINDS.has(kind)) return text;
  return `${TASK_KIND_LABELS[kind]}: ${text}`;
}

export function isTaskKind(v: unknown): v is TaskKind {
  return typeof v === 'string' && (TASK_KINDS as readonly string[]).includes(v);
}

export function isMilestone(t: { kind?: string | null } | null | undefined): boolean {
  return t?.kind === 'milestone';
}

export function isQuestion(t: { kind?: string | null } | null | undefined): boolean {
  return t?.kind === 'question';
}

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

/**
 * SQL for "this row is not a meeting-approval row" (pending, accepted or
 * declined; source='meeting_approval'). An approval asks whether a calendar
 * event is a meeting; it is not work. Every task list on the client drops these
 * (src/lib/taskStats.ts isWorkTask), so a server count of open or overdue work
 * must too, or it reads higher than the list it describes. Pass the alias as above.
 */
export function notApprovalSql(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(${p}approval_status, '') NOT IN ('pending', 'accepted', 'declined')`;
}
