import { memo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Clock, ClipboardList, ArrowRight, AlertTriangle } from 'lucide-react'
import BentoCard from './BentoCard'
import Avatar from '../Avatar'
import { useTasks } from '../../hooks/useApiData'
import { formatBrandName } from '../BrandName'
import { useUpdateTaskStatus } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'

const statusIcon: Record<string, { icon: typeof Circle; color: string }> = {
  todo: { icon: Circle, color: 'var(--slate)' },
  in_progress: { icon: Clock, color: 'var(--teal)' },
  blocked: { icon: AlertTriangle, color: 'var(--maroon)' },
}

function ActionBoardCard() {
  const { data: items = [] } = useTasks() // Already deduped by useTasks hook
  const updateStatus = useUpdateTaskStatus()
  const { showUndo } = useUndoToast()

  const pending = items.filter((i) => !i.completed)
  const completed = items.filter((i) => i.completed)

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
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                        {assigneeItems.length}
                      </span>
                    </div>
                    {assigneeItems.map((item) => {
                      const isOverdue = item.due_date && new Date(item.due_date) < new Date()
                      const si = statusIcon[item.status] || statusIcon.todo
                      const StatusIcon = si.icon
                      return (
                        <div key={item.id} className="flex items-start gap-2 py-1.5 pl-7 action-board-row"
                          style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.04)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', margin: '0 -4px', padding: '6px 4px 6px 28px', transition: 'background 0.15s' }}
                          onClick={() => {
                            const next = item.status === 'todo' ? 'in_progress' : 'done'
                            const prev = item.status
                            updateStatus.mutate({ id: item.id, status: next })
                            showUndo(`Status → ${next === 'done' ? 'Done' : 'In Progress'}`, () => updateStatus.mutate({ id: item.id, status: prev }))
                          }}>
                          <button type="button" className="cursor-pointer flex-shrink-0 action-board-status-btn"
                            aria-label={`Mark "${item.title || item.description}" done`}
                            onClick={(e) => {
                              e.stopPropagation()
                              const prev = item.status
                              updateStatus.mutate({ id: item.id, status: 'done' })
                              showUndo('Completed task', () => updateStatus.mutate({ id: item.id, status: prev }))
                            }}
                            style={{ '--status-color': si.color, background: 'none', border: 'none', padding: 'var(--sp-sm)', margin: '-8px', color: si.color, opacity: 0.85, transition: 'all 0.15s', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}>
                            <StatusIcon size={14} />
                          </button>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '11.5px', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
                              {item.title || item.description}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.due_date && (
                                <span style={{ fontSize: '10px', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: isOverdue ? 1 : 0.85, fontWeight: isOverdue ? 600 : 400 }}>
                                  {isOverdue ? 'Overdue' : `Due ${formatShortDate(item.due_date)}`}
                                </span>
                              )}
                              {item.priority && item.priority !== 'medium' && (
                                <span style={{ fontSize: '10px', color: item.priority === 'urgent' ? 'var(--maroon)' : item.priority === 'high' ? 'var(--orange)' : 'var(--slate)', opacity: 0.85 }}>
                                  {item.priority}
                                </span>
                              )}
                              {item.meeting_title && (
                                <Link to={`/meetings/${item.meeting_id}`}
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
          style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201, 168, 76, 0.1)' }}>
          View all tasks <ArrowRight size={11} />
        </Link>
      </div>
      <style>{`
        .action-board-row:active { background: var(--gold-hover); }
        .action-board-row:hover { background: var(--gold-hover); }
        .action-board-status-btn:hover { opacity: 1 !important; color: var(--teal) !important; }
      `}</style>
    </BentoCard>
  )
}

export default memo(ActionBoardCard)
