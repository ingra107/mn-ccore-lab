import { memo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { FaceDisc } from '../today/skin'
import { useTasks } from '../../hooks/useApiData'
import { useUpdateTaskStatus } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { getPersonInfo } from '../../data/team'
import DueLabel from '../DueLabel'
import { DoneBox } from '../tasks/TaskRow'
import TaskDetailPanel from '../tasks/TaskDetailPanel'
import TaskTitle from '../tasks/TaskTitle'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { isTaskDone } from '../../lib/taskGrouping'
import type { TaskRow as TaskRowData } from '../../lib/api'
import { taskShortLabel } from '../../lib/displayNames'

function ActionBoardCard() {
  const { data: items = [] } = useTasks() // Already deduped by useTasks hook
  const updateStatus = useUpdateTaskStatus()
  const { showUndo } = useUndoToast()
  // #114: clicking a row opens the editor. It used to CYCLE THE STATUS
  // (todo → in_progress, anything else → done), which meant every attempt to
  // read a task silently mutated it — and Rule 9 / Rule 68 say the square is
  // the only thing that completes. The panel mounts here rather than routing
  // to /portal/my-tasks?openTask= because this card is the surface you are
  // already on (Rule 63e).
  const [detailTask, setDetailTask] = useState<TaskRowData | null>(null)

  const pending = items.filter((i) => !isTaskDone(i))
  const completed = items.filter((i) => isTaskDone(i))

  // Wave 3 (Lab Overview option A): the card is one hero number and the three
  // tasks to look at first (soonest due, undated last). The full list is one
  // link away, so the card never scrolls inside itself.
  const lead = [...pending]
    .sort((x, y) => (x.due_date ?? '9999').localeCompare(y.due_date ?? '9999'))
    .slice(0, 3)

  return (
    <BentoCard
      title="Tasks"
      hero={{ value: pending.length, label: `pending · ${completed.length} done`, rule: 'accent', to: PATHS.myTasks }}
      size="span-2"
      uniform
      noLift
    >
      <div className="flex flex-col h-full">
        <div role="region" aria-label="Action items">
          {lead.length > 0 ? (
            lead.map((item) => {
              const person = getPersonInfo(item.assignee)
              return (
                <div key={item.id} className="bento-row action-board-row" style={{ cursor: 'pointer' }} onClick={() => setDetailTask(item)}>
                  {/* C15 DoneBox: the canonical square = complete */}
                  <DoneBox
                    taskId={item.id}
                    done={isTaskDone(item)}
                    onToggle={() => {
                      const prev = item.status
                      const next = isTaskDone(item) ? 'todo' : 'done'
                      updateStatus.mutate({ id: item.id, status: next })
                      showUndo(next === 'done' ? 'Completed task' : 'Reopened task', () => updateStatus.mutate({ id: item.id, status: prev }))
                    }}
                  />
                  <span className="bento-row-t">
                    {/* C2 short_title, C13 TaskTitle ([Carried forward] chip) */}
                    <TaskTitle title={taskShortLabel(item)} fallback={item.description} />
                  </span>
                  {item.due_date ? (
                    <DueLabel due={item.due_date} style={{ fontSize: 11 }} />
                  ) : item.priority && item.priority !== 'medium' ? (
                    <span className={`bento-row-f${item.priority === 'urgent' ? ' bento-urgent' : ''}`}>{item.priority}</span>
                  ) : null}
                  <span style={{ width: 18, height: 18, flexShrink: 0 }} title={person.name}>
                    <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={18} />
                  </span>
                </div>
              )
            })
          ) : (
            <div className="py-4" style={{ fontSize: '12px', color: 'var(--sk-t3)' }}>All caught up</div>
          )}
        </div>

        <div className="bento-foot">
          <Link to={PATHS.myTasks} className="flex items-center gap-1 portal-footer-link"
            style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textDecoration: 'none' }}>
            View all tasks <ArrowRight {...ICON_PROPS} size={11} />
          </Link>
        </div>
      </div>
      {/* Portalled to <body> on purpose: DashboardGrid renders every widget
          inside a react-grid-layout item that carries a CSS transform
          (useCSSTransforms), and a transformed ancestor becomes the containing
          block for position:fixed — so the panel and its backdrop would be
          clipped into this card instead of covering the viewport. */}
      {detailTask && createPortal(
        <TaskDetailPanel task={detailTask} onClose={() => setDetailTask(null)} />,
        document.body,
      )}
    </BentoCard>
  )
}

export default memo(ActionBoardCard)
