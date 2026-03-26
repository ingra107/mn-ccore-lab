import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ClipboardList, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import Avatar from '../Avatar'
import { useActionItems } from '../../hooks/useApiData'
import { useToggleActionItem } from '../../hooks/useMutations'
import { directors, getAllMembers } from '../../data/team'

function getPersonInfo(slug: string) {
  const director = directors.find((d) => d.slug === slug)
  if (director) return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  const member = getAllMembers().find((m) => m.slug === slug)
  if (member) return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  return { name: slug, initials: slug.slice(0, 2).toUpperCase(), photoUrl: undefined }
}

export default function ActionBoardCard() {
  const { data: items = [] } = useActionItems()
  const toggleAction = useToggleActionItem()

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
        <div className="flex-1 overflow-y-auto -mx-1 px-1" style={{ maxHeight: '300px', scrollbarWidth: 'thin' }}>
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
                        <div key={item.id} className="flex items-start gap-2 py-1.5 pl-7"
                          style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.04)' }}>
                          <button type="button" className="cursor-pointer flex-shrink-0 mt-0.5"
                            onClick={() => toggleAction.mutate(item.id)}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--slate)', opacity: 0.4, transition: 'all 0.15s' }}
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
                                  {isOverdue ? 'Overdue' : `Due ${new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
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
    </BentoCard>
  )
}
