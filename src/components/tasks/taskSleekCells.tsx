// Task cells for the sleek row (components/table/SleekRows). Shared by the
// My Tasks Table and Lanes, and by any later page that lists tasks in sleek
// rows. The pieces are the Today card's: CardCheck, CardDuePill, CardTags,
// .tk-tag / .tk-pill, so a task reads the same on a card and on a row.

import type { MouseEvent, KeyboardEvent } from 'react'
import { CardCheck, CardDuePill, CardTags, useTaskAttention } from './TaskCardRow'
import { dueLabelCompact, isOverdue } from '../../lib/dateUtils'
import { isMilestone } from '../../../shared/taskKinds'
import { taskShortLabel } from '../../lib/displayNames'
import { isTaskDone } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

const STATUS_WORD: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done',
}
const STATUS_DOT: Record<string, string> = {
  todo: 'sr-td', in_progress: 'sr-ip', waiting_external: 'sr-wt', blocked: 'sr-bl', done: '',
}
const PRIORITY_WORD: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

const modified = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || e.ctrlKey || e.metaKey

/** Title, then its tags: New / n new / moved / Planned / Waiting / Nd stale
 *  (orange: going stale is orange's one job, principle 21).
 *  A plain click on the title opens the editor; a modified click (shift,
 *  ctrl, cmd) or any click while `selecting` bubbles to the row to select. */
export function TaskTitleCell({ task, isDone, onOpen, selecting = false, planned = false, staleDays = 0, showWaiting = false, showMoved = true, hint }: {
  task: TaskRow
  isDone: boolean
  onOpen?: () => void
  /** A hover tip on the title (Deadlines shows the full title behind a short one). */
  hint?: string
  selecting?: boolean
  planned?: boolean
  /** Days since the last movement on an in-progress task; 0 = not stale. */
  staleDays?: number
  /** Views with no Status column say "Waiting" here. */
  showWaiting?: boolean
  showMoved?: boolean
}) {
  const { isNewToViewer, activityRow } = useTaskAttention(task, isDone)
  const title = taskShortLabel(task)
  const open = onOpen
    ? {
        role: 'button' as const,
        tabIndex: 0,
        className: 'sr-x sr-open',
        onClick: (e: MouseEvent) => { if (modified(e) || selecting) return; e.stopPropagation(); onOpen() },
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); onOpen() } },
      }
    : { className: 'sr-x' }
  return (
    <div className="sr-tt">
      {isMilestone(task) && <span className="sr-dia" aria-hidden="true">◆</span>}
      <span {...open} title={hint}>{title}</span>
      {!isDone && task.priority === 'urgent' && <span className="sr-only">Urgent</span>}
      <CardTags task={task} isNew={isNewToViewer} activityCount={activityRow?.new_count ?? 0} showMoved={showMoved} />
      {planned && !isDone && <span className="tk-tag tk-n">Planned</span>}
      {showWaiting && !isDone && task.status === 'waiting_external' && <span className="tk-tag tk-n">Waiting</span>}
      {staleDays > 0 && <span className="tk-tag tk-stale" title="In progress with no movement">{staleDays}d stale</span>}
    </div>
  )
}

/** True when TaskDueCell has something to show (a live due date, or any milestone date). */
// eslint-disable-next-line react-refresh/only-export-components -- a predicate shared by the Table and Deadlines due cells
export const taskHasDuePill = (t: TaskRow) => (isMilestone(t) ? !!(t.deadline || t.due_date) : !!t.due_date && !isTaskDone(t))

/** The due cell for any task. A task shows its due pill; a milestone shows
 *  MilestoneDueCell. */
export function TaskDueCell({ task, isDone }: { task: TaskRow; isDone: boolean }) {
  if (!isMilestone(task)) return task.due_date && !isDone ? <CardDuePill due={task.due_date} status={task.status} /> : null
  return <MilestoneDueCell due={task.due_date} hard={task.deadline} isDone={isDone} />
}

/** A milestone's dates: its internal date (muted) and its hard date (gold,
 *  red once missed) side by side when they differ, else its one date in gold
 *  (the two-date rule, Nick 2026-09-17; same wording as MilestoneCardRow).
 *  Task milestones and grant milestones (Deadlines) both render here. */
export function MilestoneDueCell({ due: dueIn, hard: hardIn, isDone }: { due?: string | null; hard?: string | null; isDone: boolean }) {
  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
  const due = civil(dueIn)
  const hard = civil(hardIn) ?? due
  if (!hard) return null
  const missed = !isDone && isOverdue(hard)
  return (
    <span className="sr-ms-dates">
      {due && due !== hard && (
        <span className="tk-pill" data-tip={`Internal date: ${due}`} aria-label={`Internal date: ${due}`}><i />{dueLabelCompact(due, false)}</span>
      )}
      <span className={`tk-pill ${missed ? 'tk-o' : 'tk-g'}`} data-tip={`Hard date: ${hard}`} aria-label={`Hard date: ${hard}`}><i />{dueLabelCompact(hard, missed)}</span>
    </span>
  )
}

/** The complete square, or nothing for a milestone: a milestone is completed
 *  from its drawer, never by a box (TaskRow MilestoneRow contract). */
export function TaskCheckCell({ task, isDone, onToggle }: { task: TaskRow; isDone: boolean; onToggle: () => void }) {
  return isMilestone(task) ? null : <CardCheck done={isDone} onToggle={onToggle} taskId={task.id} />
}

/** Status as a quiet pill: the dot carries the state, the word stays gray. */
export function TaskStatusPill({ status }: { status: string }) {
  return <span className={`tk-pill ${STATUS_DOT[status] ?? ''}`}><i />{STATUS_WORD[status] ?? status}</span>
}

/** Priority: gray words, except Urgent, which is the one orange tag. */
export function TaskPriorityLabel({ priority, done = false }: { priority: string; done?: boolean }) {
  if (priority === 'urgent' && !done) return <span className="tk-tag tk-urgtag">Urgent</span>
  return <span className={`sr-m${priority === 'high' ? ' sr-hi' : ''}`}>{PRIORITY_WORD[priority] ?? priority}</span>
}
