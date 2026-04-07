import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { User, Circle, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useActionItems } from '../../hooks/useApiData'
import type { ActionItemRow } from '../../hooks/useApiData'
import { useUnreadCount } from '../../hooks/useNotifications'
import { getPersonInfo } from '../../data/team'
import { isOverdue } from '../../lib/dateUtils'
import BentoCard from './BentoCard'

function MyItemsCard() {
  const { user } = useAuth()
  const userSlug = user?.email?.split('@')[0] || ''
  const { data: allItems = [] } = useActionItems(
    userSlug ? { assignee: userSlug } : undefined
  )
  const { data: unreadCount = 0 } = useUnreadCount(userSlug)

  // Deduplicate carried-forward items
  const items = useMemo(() => {
    const seen = new Map<string, ActionItemRow>()
    for (const item of allItems) {
      const normalized = item.description.replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      const existing = seen.get(key)
      if (!existing || item.created_at > existing.created_at) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
  }, [allItems])

  const pending = items.filter((i) => !i.completed)
  const overdueCount = pending.filter((i) => isOverdue(i.due_date)).length

  return (
    <BentoCard title="My Items" subtitle="Your action items" icon={User}>
      <div className="flex flex-col gap-2" style={{ minHeight: '100px' }}>
        {/* Summary row */}
        <div className="flex items-center gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <Circle size={12} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
              {pending.length}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.7 }}>
              pending
            </span>
          </div>
          {overdueCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={12} style={{ color: 'var(--maroon)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--maroon)' }}>
                {overdueCount}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--maroon)', opacity: 0.7 }}>
                overdue
              </span>
            </div>
          )}
          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gold)' }}>
                {unreadCount}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.7 }}>
                notifications
              </span>
            </div>
          )}
        </div>

        {/* Top 3 pending items */}
        {pending.slice(0, 3).map((item) => {
          const info = getPersonInfo(item.assignee)
          const overdue = isOverdue(item.due_date)
          return (
            <div
              key={item.id}
              className="flex items-start gap-2 py-1.5"
              style={{
                borderLeft: overdue ? '2px solid var(--maroon)' : '2px solid transparent',
                paddingLeft: '8px',
              }}
            >
              <Circle size={12} className="flex-shrink-0 mt-0.5" style={{ color: overdue ? 'var(--maroon)' : 'var(--gold)' }} />
              <div className="min-w-0 flex-1">
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.description.replace(/^\[Carried forward\]\s*/i, '')}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: overdue ? 'var(--maroon)' : 'var(--slate)',
                    opacity: overdue ? 1 : 0.5,
                    marginTop: '1px',
                  }}
                >
                  {info.name.split(' ')[0]} {item.due_date ? `· ${overdue ? 'overdue' : 'due'} ${new Date(item.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </div>
              </div>
            </div>
          )
        })}

        {pending.length === 0 && (
          <div className="flex items-center gap-2 py-3">
            <CheckCircle2 size={14} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.6 }}>
              All caught up
            </span>
          </div>
        )}

        {/* View all link */}
        <Link
          to="/my-items"
          className="inline-flex items-center gap-1 mt-auto pt-2"
          style={{
            fontSize: '10px',
            color: 'var(--gold)',
            textDecoration: 'none',
          }}
        >
          View all items <ArrowRight size={10} />
        </Link>
      </div>
    </BentoCard>
  )
}

export default memo(MyItemsCard)
