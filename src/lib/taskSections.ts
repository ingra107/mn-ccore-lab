// taskSections.ts -- the ONE place that decides which section a task sits in,
// shared by Today (components/today, pages/portal/TodayPage) and My Tasks
// (pages/MyTasks). Replaces both getGroupForTask copies, GroupKey / GROUP_META /
// the Move options, and the Today preview slice (2026-11-03).
//
// Decision: PB Context/Decisions/2026-11-03-today-sections-and-checkin-prefix.md
// (Nick's rulings) and Scratch/plans/2026-11-03-today-sections-RECONCILED.md.
//
// Order, first match wins (Nick: "Hand placement beats everything", ETL and
// With others included):
//   1. hand placement (work_kind_set = 'hand'): its kind, or Sort when NULL
//   2. With others: the assignee is someone else, or status waiting_external
//   3. CLIF ETL
//   4. check-in (kind = 'checkin') -> Replies & admin
//   5. work_kind (review | writing | analysis | admin)
//   6. Sort (no kind yet)
//
// Pure functions only: no hooks, no storage, so the order is unit-testable.

import type { TaskRow } from './api'
import { isCheckin, isMilestone } from '../../shared/taskKinds'
import { interleaveMilestones, isTaskDone, todayKey, civilDatePlusDays, type MilestoneEntry } from './taskGrouping'

// ──────────────────────────────────────────────────────────────────────────
// Kinds of work
// ──────────────────────────────────────────────────────────────────────────

/**
 * The kinds of work, mirroring the `work_kinds` lookup table (schema-v157:
 * review|Review, writing|Writing, analysis|Analysis & Build, admin|Replies &
 * admin). The server exposes no read route for that table, so the four labels
 * live here. A kind added later by an INSERT into work_kinds has no label until
 * it is added here: a task that carries it is not a known section and lands in
 * Sort, never lost (isWorkKind below).
 */
export const WORK_KINDS = [
  { code: 'review', label: 'Review' },
  { code: 'writing', label: 'Writing' },
  { code: 'analysis', label: 'Analysis & Build' },
  { code: 'admin', label: 'Replies & admin' },
] as const

export type WorkKind = typeof WORK_KINDS[number]['code']

export function isWorkKind(v: unknown): v is WorkKind {
  return typeof v === 'string' && WORK_KINDS.some((k) => k.code === v)
}

// ──────────────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────────────

export type SectionKey = 'sort' | WorkKind | 'etl' | 'others'

/** Top to bottom on Today, left to right in My Tasks Columns. */
export const SECTION_ORDER: readonly SectionKey[] = ['sort', 'review', 'writing', 'analysis', 'admin', 'etl', 'others']

export const SECTION_LABEL: Record<SectionKey, string> = {
  sort: 'Sort',
  review: 'Review',
  writing: 'Writing',
  analysis: 'Analysis & Build',
  admin: 'Replies & admin',
  etl: 'CLIF ETL',
  others: 'With others',
}

export function isSectionKey(v: unknown): v is SectionKey {
  return typeof v === 'string' && (SECTION_ORDER as readonly string[]).includes(v)
}

export function emptySections<T = TaskRow>(): Record<SectionKey, T[]> {
  return { sort: [], review: [], writing: [], analysis: [], admin: [], etl: [], others: [] }
}

// ──────────────────────────────────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────────────────────────────────

export type ProjectsBySlug = Map<string, { category?: string | null; slug: string }>

export interface SectionCtx {
  /** Whose list this is (the signed-in person; on My Tasks, the member being viewed). '' until loaded. */
  viewerSlug: string
  projectsBySlug: ProjectsBySlug
}

/** CQODE / CLIF ETL work (the pre-2026-11-03 detection, unchanged). */
export function isEtlTask(t: Pick<TaskRow, 'project_id' | 'title'>, projectsBySlug: ProjectsBySlug): boolean {
  const proj = t.project_id ? projectsBySlug.get(t.project_id) : null
  const projSlug = proj?.slug || ''
  const projCat = proj?.category || ''
  if (/cqode|clif-etl|etl/i.test(projSlug) || /CQODE|ETL/.test(t.title)) return true
  return projCat === 'clif' && /etl|ingest|backbone/i.test(t.title)
}

/** Peripheral Brain work: a row badge, no longer a section (the pre-2026-11-03 Today detection). */
export function isPbTask(t: Pick<TaskRow, 'source' | 'title' | 'project_id'>, projectsBySlug: ProjectsBySlug): boolean {
  if (t.source === 'pb') return true
  if (/^(pb|peripheral.?brain)\s*[:\-—]/i.test(t.title)) return true
  const proj = t.project_id ? projectsBySlug.get(t.project_id) : null
  const projSlug = proj?.slug || ''
  const projCat = proj?.category || ''
  return projCat === 'pb' || /(^|\W)(pb|peripheral.?brain)(\W|$)/i.test(projSlug)
}

/** A task Nick placed by hand: its kind (or Sort) outranks every rule below. */
export function isHandSorted(t: Pick<TaskRow, 'work_kind_set'>): boolean {
  return t.work_kind_set === 'hand'
}

/** Assigned to the viewer and never opened (the "New" chip, the fold rule's keep). */
export function isNewToViewer(t: Pick<TaskRow, 'assignee' | 'acknowledged_at'>, viewerSlug: string): boolean {
  return !!viewerSlug && !!t.assignee && t.assignee === viewerSlug && !t.acknowledged_at
}

// ──────────────────────────────────────────────────────────────────────────
// The resolver
// ──────────────────────────────────────────────────────────────────────────

export function sectionForTask(t: TaskRow, ctx: SectionCtx): SectionKey {
  const elsewhere = !!t.assignee && !!ctx.viewerSlug && t.assignee !== ctx.viewerSlug
  // 1. The viewer's own hand placement beats everything, including ETL and
  // waiting. work_kind_set is one value per task, so another person's hand
  // sort is THEIR placement: on this viewer's page their task stays in With
  // others (code review 2026-11-03).
  if (isHandSorted(t) && !elsewhere) return isWorkKind(t.work_kind) ? t.work_kind : 'sort'
  // 2. With others.
  if (elsewhere || t.status === 'waiting_external') return 'others'
  // 3. CLIF ETL.
  if (isEtlTask(t, ctx.projectsBySlug)) return 'etl'
  // 4. A check-in is a one-tap follow-up: Replies & admin.
  if (isCheckin(t)) return 'admin'
  // 5 + 6. The kind of work, else Sort.
  return isWorkKind(t.work_kind) ? t.work_kind : 'sort'
}

export function bucketBySection<T extends TaskRow>(tasks: readonly T[], ctx: SectionCtx): Record<SectionKey, T[]> {
  const out = emptySections<T>()
  for (const t of tasks) out[sectionForTask(t, ctx)].push(t)
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// Order inside a section
// ──────────────────────────────────────────────────────────────────────────

const isFlagged = (t: Pick<TaskRow, 'priority'>) => t.priority === 'urgent' || t.priority === 'high'

const dueKey = (t: Pick<TaskRow, 'due_date'>) => (t.due_date ? t.due_date.slice(0, 10) : '9999-12-31')

// urgent, then high, then by due date (overdue is the earliest date, so it leads).
function compareRows(a: TaskRow, b: TaskRow): number {
  const pa = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2
  const pb = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2
  if (pa !== pb) return pa - pb
  const da = dueKey(a)
  const db = dueKey(b)
  return da < db ? -1 : da > db ? 1 : 0
}

/**
 * Planned first, then urgent, then high, then by due date, done last. A
 * milestone is a gold rule placed by its own date among the unflagged rows
 * (interleaveMilestones) and never enters `planned`.
 */
export function orderSection<T extends TaskRow>(
  tasks: readonly T[],
  o: {
    isPlanned: (t: T) => boolean
    isDone: (t: T) => boolean
    /**
     * true (Today): a milestone becomes a gold rule (one or two entries, see
     * interleaveMilestones). false (My Tasks lists): a milestone is an ordinary
     * row, so a slipped one is not listed twice under one id.
     */
    milestoneRules?: boolean
  },
): Array<T & Partial<MilestoneEntry>> {
  const rules = o.milestoneRules ?? true
  const planned: T[] = []
  const active: T[] = []
  const done: T[] = []
  for (const t of tasks) {
    if (o.isDone(t)) done.push(t)
    else if (o.isPlanned(t) && !(rules && isMilestone(t))) planned.push(t)
    else active.push(t)
  }
  planned.sort(compareRows)
  const milestones = rules ? active.filter((t) => isMilestone(t)) : []
  const work = active.filter((t) => !rules || !isMilestone(t)).sort(compareRows)
  const flagged = work.filter(isFlagged)
  const plain = work.filter((t) => !isFlagged(t))
  const body = rules ? interleaveMilestones([...plain, ...milestones]) : plain
  return [...planned, ...flagged, ...body, ...done] as Array<T & Partial<MilestoneEntry>>
}

// ──────────────────────────────────────────────────────────────────────────
// The fold rule
// ──────────────────────────────────────────────────────────────────────────

/** A row due, or with a hard deadline, within this many days stays visible. */
export const FOLD_DAYS = 7

export interface FoldCtx {
  viewerSlug: string
  isPlanned: (t: TaskRow) => boolean
  /** The open steps of a parent, so a parent with a pressing step stays visible. */
  stepsOf?: (t: TaskRow) => readonly TaskRow[] | undefined
  /** Civil today; injectable for tests. */
  today?: string
  /**
   * My Tasks lists keep finished rows in view while "Show completed" is on.
   * Today does not: a ticked row sinks, then folds like any other, and leaves
   * for Completed today.
   */
  keepDone?: boolean
}

function rowNeedsEyes(t: TaskRow, ctx: FoldCtx, edge: string): boolean {
  if (ctx.isPlanned(t)) return true
  const due = t.due_date?.slice(0, 10)
  if (due && due <= edge) return true            // overdue, or due within the window
  const hard = t.deadline?.slice(0, 10)
  if (hard && hard <= edge) return true          // a hard deadline within the window
  if (isFlagged(t)) return true                  // urgent or high
  return isNewToViewer(t, ctx.viewerSlug)
}

/**
 * Always visible: planned, overdue, due or deadline within 7 days, urgent or
 * high, New to the viewer, a parent with such a step, a milestone (the horizon
 * itself). The rest folds behind "Show N more".
 */
export function isAlwaysVisible(t: TaskRow, ctx: FoldCtx): boolean {
  const today = ctx.today ?? todayKey()
  const edge = civilDatePlusDays(today, FOLD_DAYS)
  if (isMilestone(t)) return true
  if (ctx.keepDone && isTaskDone(t)) return true
  if (rowNeedsEyes(t, ctx, edge)) return true
  return (ctx.stepsOf?.(t) ?? []).some((s) => rowNeedsEyes(s, ctx, edge))
}

// ──────────────────────────────────────────────────────────────────────────
// With others
// ──────────────────────────────────────────────────────────────────────────

/** The collapsed header's counts: "N · x urgent · y overdue". */
export function othersSummary(tasks: readonly TaskRow[], today: string = todayKey()): { total: number; urgent: number; overdue: number } {
  let urgent = 0
  let overdue = 0
  for (const t of tasks) {
    if (isTaskDone(t)) continue
    if (t.priority === 'urgent') urgent++
    const due = t.due_date?.slice(0, 10)
    if (due && due < today) overdue++
  }
  return { total: tasks.length, urgent, overdue }
}

// ──────────────────────────────────────────────────────────────────────────
// Hand sort, as the sort route takes it (POST /api/tasks/:id/sort)
// ──────────────────────────────────────────────────────────────────────────

export type SortCommand =
  | { op: 'sort'; work_kind: WorkKind; from_section?: SectionKey; missing_category_note?: string }
  | { op: 'unsort'; from_section?: SectionKey }
  | { op: 'reset'; from_section?: SectionKey }

/** The optimistic (work_kind, work_kind_set) the server will store for a command (api/lib/task-work-kind.ts sortTarget). */
export function sortTarget(cmd: SortCommand): { work_kind: WorkKind | null; work_kind_set: 'auto' | 'hand' } {
  if (cmd.op === 'sort') return { work_kind: cmd.work_kind, work_kind_set: 'hand' }
  if (cmd.op === 'unsort') return { work_kind: null, work_kind_set: 'hand' }
  return { work_kind: null, work_kind_set: 'auto' }
}
