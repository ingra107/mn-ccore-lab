import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ClipboardList, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import Avatar from '../Avatar'
import { useActionItems } from '../../hooks/useApiData'
import { useToggleActionItem } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatShortDate } from '../../lib/dateUtils'

export default function ActionBoardCard() {
  const { data: rawItems = [] } = useActionItems()
  const toggleAction = useToggleActionItem()

  // Deduplicate carried-forward items (keep most recent)
  const items = useMemo(() => {
    const seen = new Map<string, typeof rawItems[0]>()
    for (const item of rawItems) {
      const normalized = item.description.replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      const existing = seen.get(key)
      if (!existing || item.created_at > existing.created_at) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
  }, [rawItems])

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
    <BentoCard title="Action Items" subtitle={`${pending.length} pending · ${completed.length} done`} size="span-2" icon={ClipboardList}>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto -mx-1 px-1" style={{ maxHeight: '300px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
          {pending.length > 0 ? (
            <div className="flex flex-col gap-3">
              {Array.from(byAssignee.entries()).map(([assignee, assigneeItems]) => {
                const person = getPersonInfo(assignee)
                return (
                  <div key={assignee}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>
                        {person.name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.5 }}>
                        {assigneeItems.length}
                      </span>
                    </div>
                    {assigneeItems.map((item) => {
                      const isOverdue = item.due_date && new Date(item.due_date) < new Date()
                      return (
                        <div key={item.id} className="flex items-start gap-2 py-1.5 pl-7 action-board-row"
                          style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.04)', cursor: 'pointer', borderRadius: '4px', margin: '0 -4px', padding: '6px 4px 6px 28px', transition: 'background 0.15s' }}
                          onClick={() => toggleAction.mutate(item.id)}>
                          <button type="button" className="cursor-pointer flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); toggleAction.mutate(item.id) }}
                            style={{ background: 'none', border: 'none', padding: '8px', margin: '-8px', color: 'var(--slate)', opacity: 0.4, transition: 'all 0.15s', minWidth: '30px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--teal)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--slate)' }}>
                            <Circle size={14} />
                          </button>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11.5px', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
                              {item.description}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.due_date && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: isOverdue ? 1 : 0.5, fontWeight: isOverdue ? 600 : 400 }}>
                                  {isOverdue ? 'Overdue' : `Due ${formatShortDate(item.due_date)}`}
                                </span>
                              )}
                              {item.meeting_title && (
                                <Link to={`/meetings/${item.meeting_id}`}
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', textDecoration: 'none', opacity: 0.7 }}>
                                  {item.meeting_title?.split(':')[0]}
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
            <div className="flex flex-col items-center justify-center py-8" style={{ opacity: 0.4 }}>
              <CheckCircle2 size={24} style={{ color: 'var(--teal)', marginBottom: '8px' }} />
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', margin: 0 }}>
                All caught up
              </p>
            </div>
          )}
        </div>

        <Link to="/meetings" className="flex items-center gap-1 mt-3 pt-2"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201, 168, 76, 0.1)' }}>
          View meetings <ArrowRight size={11} />
        </Link>
      </div>
      <style>{`
        .action-board-row:active { background: rgba(201, 168, 76, 0.06); }
        .action-board-row:hover { background: rgba(201, 168, 76, 0.03); }
      `}</style>
    </BentoCard>
  )
}
