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

export const TASK_KINDS = ['task', 'milestone'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const DEFAULT_TASK_KIND: TaskKind = 'task';

/** Picker options for the Kind select (TaskDetailPanel + the drawers' field row). */
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
