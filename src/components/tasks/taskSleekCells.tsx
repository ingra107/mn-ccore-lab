// Task cells for the sleek row (components/table/SleekRows). Shared by the
// My Tasks Table and Lanes, and by any later page that lists tasks in sleek
// rows. The pieces are the Today card's: CardCheck, CardDuePill, CardTags,
// .tk-tag / .tk-pill, so a task reads the same on a card and on a row.

import type { MouseEvent, KeyboardEvent } from 'react'
import { CardTags, useTaskAttention } from './TaskCardRow'
import { isMilestone } from '../../../shared/taskKinds'
import { taskShortLabel } from '../../lib/displayNames'
import type { TaskRow } from '../../lib/api'

const STATUS_WORD: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', waiting_external: 'Waiting', blocked: 'Blocked', done: 'Done',
}
const STATUS_DOT: Record<string, string> = {
  todo: 'sr-td', in_progress: 'sr-ip', waiting_external: 'sr-wt', blocked: 'sr-bl', done: '',
}
const PRIORITY_WORD: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

const modified = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || e.ctrlKey || e.metaKey

/** Title, then its tags: New / n new / moved / Planned / Waiting / Nd stale.
 *  A plain click on the title opens the editor; a modified click (shift,
 *  ctrl, cmd) or any click while `selecting` bubbles to the row to select. */
export function TaskTitleCell({ task, isDone, onOpen, selecting = false, planned = false, staleDays = 0, showWaiting = false, showMoved = true }: {
  task: TaskRow
  isDone: boolean
  onOpen?: () => void
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
      <span {...open}>{title}</span>
      {!isDone && task.priority === 'urgent' && <span className="sr-only">Urgent</span>}
      <CardTags task={task} isNew={isNewToViewer} activityCount={activityRow?.new_count ?? 0} showMoved={showMoved} />
      {planned && !isDone && <span className="tk-tag">Planned</span>}
      {showWaiting && !isDone && task.status === 'waiting_external' && <span className="tk-tag tk-n">Waiting</span>}
      {staleDays > 0 && <span className="tk-tag tk-n" title="In progress with no movement">{staleDays}d stale</span>}
    </div>
  )
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
