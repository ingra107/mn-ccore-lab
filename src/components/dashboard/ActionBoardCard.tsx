import { memo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardList, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import Avatar from '../Avatar'
import { useTasks } from '../../hooks/useApiData'
import { formatBrandName } from '../BrandName'
import { useUpdateTaskStatus } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { getPersonInfo } from '../../data/team'
import DueLabel from '../DueLabel'
import { DoneBox } from '../tasks/TaskRow'
import TaskTitle from '../tasks/TaskTitle'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { ACCENT_GOLD, isTaskDone, withAlpha } from '../../lib/taskGrouping'

function ActionBoardCard() {
  const { data: items = [] } = useTasks() // Already deduped by useTasks hook
  const updateStatus = useUpdateTaskStatus()
  const { showUndo } = useUndoToast()

  const pending = items.filter((i) => !isTaskDone(i))
  const completed = items.filter((i) => isTaskDone(i))

  // Group pending by assignee
  const byAssignee = new Map<string, typeof pending>()
  for (const item of pending) {
    const list = byAssignee.get(item.assignee) || []
    list.push(item)
    byAssignee.set(item.assignee, list)
  }

  return (
    <BentoCard title="Tasks" subtitle={`${pending.length} pending · ${completed.length} done`} size="span-2" icon={ClipboardList} drillDown noLift>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto -mx-1 px-1" tabIndex={0} role="region" aria-label="Action items" style={{ maxHeight: '300px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
          {pending.length > 0 ? (
            <div className="flex flex-col gap-3">
              {Array.from(byAssignee.entries()).map(([assignee, assigneeItems]) => {
                const person = getPersonInfo(assignee)
                return (
                  <div key={assignee}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>
                        {person.name}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)', fontVariantNumeric: 'tabular-nums' }}>
                        {assigneeItems.length}
                      </span>
                    </div>
                    {assigneeItems.map((item) => {
                      return (
                        <div key={item.id} className="flex items-start gap-2 py-1.5 pl-7 action-board-row"
                          style={{ borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 4)}`, cursor: 'pointer', borderRadius: 'var(--radius-sm)', margin: '0 -4px', padding: '6px 4px 6px 28px', transition: 'background 0.15s' }}
                          onClick={() => {
                            const next = item.status === 'todo' ? 'in_progress' : 'done'
                            const prev = item.status
                            updateStatus.mutate({ id: item.id, status: next })
                            showUndo(`Status → ${next === 'done' ? 'Done' : 'In Progress'}`, () => updateStatus.mutate({ id: item.id, status: prev }))
                          }}>
                          {/* C15 DoneBox — canonical square = complete */}
                          <DoneBox
                            done={isTaskDone(item)}
                            onToggle={() => {
                              const prev = item.status
                              const next = isTaskDone(item) ? 'todo' : 'done'
                              updateStatus.mutate({ id: item.id, status: next })
                              showUndo(next === 'done' ? 'Completed task' : 'Reopened task', () => updateStatus.mutate({ id: item.id, status: prev }))
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '11.5px', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
                              {/* C2 short_title · C13 TaskTitle ([Carried forward] chip) */}
                              <TaskTitle title={item.short_title || item.title} fallback={item.description} />
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <DueLabel due={item.due_date} style={{ fontSize: 10 }} />
                              {item.priority && item.priority !== 'medium' && (
                                <span style={{ fontSize: '10px', color: item.priority === 'urgent' ? 'var(--maroon)' : item.priority === 'high' ? 'var(--orange)' : 'var(--slate)', opacity: 0.85 }}>
                                  {item.priority}
                                </span>
                              )}
                              {item.meeting_id && item.meeting_title && (
                                <Link to={PATHS.meeting(item.meeting_id)}
                                  style={{ fontSize: '10px', color: 'var(--gold)', textDecoration: 'none', opacity: 0.85 }}
                                  onClick={(e) => e.stopPropagation()}>
                                  {formatBrandName(item.meeting_title?.split(':')[0] || '')}
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8" style={{ opacity: 0.85 }}>
              <CheckCircle2 size={24} style={{ color: 'var(--teal)', marginBottom: '8px' }} />
              <p style={{ fontSize: '12px', color: 'var(--slate)', margin: 0 }}>
                All caught up
              </p>
            </div>
          )}
        </div>

        <Link to={PATHS.myTasks} className="flex items-center gap-1 mt-3 pt-2 portal-footer-link"
          style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 10)}` }}>
          View all tasks <ArrowRight {...ICON_PROPS} size={11} />
        </Link>
      </div>
      <style>{`
        .action-board-row:active { background: var(--gold-hover); }
        .action-board-row:hover { background: var(--gold-hover); }
      `}</style>
    </BentoCard>
  )
}

export default memo(ActionBoardCard)
