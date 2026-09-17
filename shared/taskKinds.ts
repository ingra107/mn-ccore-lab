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

export const TASK_KINDS = ['task', 'milestone', 'question'] as const;
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
