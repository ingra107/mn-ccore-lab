import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { useActivity } from '../../hooks/useApiData'
import { useDashboardMounted } from '../../pages/Dashboard'
import { isProductionVisibleActivity } from '../../lib/isProductionVisible'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

interface FeedItem {
  id: string
  dotColor: string
  actorName: string | null
  description: string
  time: string
  link?: string
}

// Collapsed entries clamp to 3 lines (Nick 2026-06-15: consistent height, easier
// on the eyes); a "more" toggle expands the full text per entry.
const CLAMP_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

/**
 * Pick a small accent dot color based on the activity entry's `type`.
 * Keeps the feed visually scannable without inventing a per-row icon.
 */
function dotColorForType(type: string): string {
  if (type.startsWith('task')) return '#c9a84c'   // gold — user-driven action
  if (type.startsWith('project')) return '#2d8a8a' // teal — system / project work
  if (type.startsWith('comment')) return '#5cbcb4'
  if (type.startsWith('meeting')) return '#5cbcb4'
  if (type.startsWith('idea')) return '#c9a84c'
  if (type.startsWith('decision')) return '#7a0019' // maroon — decision
  return 'var(--slate)'
}

function ActivityFeedCard() {
  const mounted = useDashboardMounted()
  // Over-fetch a bit so the post-filter feed still has 5 items.
  const { data: rawActivity = [] } = useActivity(20)

  const items = useMemo<FeedItem[]>(() => {
    if (!mounted) return []
    return rawActivity
      .filter((a) => isProductionVisibleActivity({ description: a.description }))
      .slice(0, 5)
      .reverse() // newest at the BOTTOM — chronological, easier to read (Nick 2026-06-15)
      .map((a) => {
        const person = a.actor ? getPersonInfo(a.actor) : null
        return {
          id: a.id,
          dotColor: dotColorForType(a.type || ''),
          actorName: person?.name ?? null,
          description: a.description || '',
          time: formatRelativeTime(a.timestamp),
          link: PATHS.activity,
        }
      })
  }, [rawActivity, mounted])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <BentoCard title="Recent Activity" subtitle="Lab updates" size="span-1x2" icon={Activity} drillDown>
      <div className="flex flex-col h-full">
        {/* Feed list */}
        <div
          className="flex-1 overflow-y-auto -mx-1 px-1"
          tabIndex={0}
          role="region"
          aria-label="Activity feed"
          style={{
            maxHeight: '340px',
            scrollbarWidth: 'thin',
          }}
        >
          <div className="relative">
            {/* Vertical line */}
            <div
              style={{
                position: 'absolute',
                left: '7px',
                top: '12px',
                bottom: '12px',
                width: '1.5px',
                background: 'linear-gradient(to top, var(--gold), transparent)',
                opacity: 0.15,
              }}
            />

            {items.length === 0 && (
              <div className="py-4 text-center" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                No recent activity yet.
              </div>
            )}
            {items.map((item, i) => {
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 py-2.5 relative group"
                  style={{
                    borderBottom: i < items.length - 1
                      ? '1px solid var(--gold-hover)'
                      : 'none',
                  }}
                >
                  {/* Dot */}
                  <div
                    className="flex-shrink-0 relative z-10"
                    style={{
                      width: '15px',
                      height: '15px',
                      borderRadius: 'var(--radius-circle)',
                      background: item.dotColor,
                      border: '2px solid var(--cream)',
                      marginTop: '2px',
                      transition: 'transform 0.2s ease',
                    }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="leading-snug"
                      style={{
                        fontSize: '12.5px',
                        color: 'var(--ink)',
                        margin: 0,
                        ...(expanded.has(item.id) ? null : CLAMP_STYLE),
                      }}
                    >
                      {item.actorName ? (
                        <span style={{ fontWeight: 500 }}>{item.actorName}</span>
                      ) : null}
                      {item.actorName ? ' ' : ''}
                      {item.description}
                    </p>
                    {item.description.length > 120 && (
                      <button
                        onClick={() => toggle(item.id)}
                        style={{
                          fontSize: '10px',
                          color: 'var(--teal)',
                          background: 'none',
                          border: 'none',
                          padding: '2px 0 0',
                          cursor: 'pointer',
                          opacity: 0.85,
                        }}
                      >
                        {expanded.has(item.id) ? 'less' : 'more'}
                      </button>
                    )}
                  </div>

                  {/* Time */}
                  <span
                    className="flex-shrink-0"
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-hint)',
                      whiteSpace: 'nowrap',
                      marginTop: '2px',
                    }}
                  >
                    {item.time}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* View all link */}
        <Link
          to={PATHS.activity}
          className="flex items-center gap-1 mt-3 pt-2 portal-footer-link"
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--gold)',
            textDecoration: 'none',
            borderTop: '1px solid rgba(201, 168, 76, 0.1)',
            transition: 'opacity 0.2s ease',
          }}
        >
          View all <ArrowRight {...ICON_PROPS} size={11} />
        </Link>
      </div>
    </BentoCard>
  )
}

export default memo(ActivityFeedCard)
