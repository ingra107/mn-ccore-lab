import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { useActivity } from '../../hooks/useApiData'
import { useDashboardMounted } from './dashboardMounted'
import { isProductionVisibleActivity } from '../../lib/isProductionVisible'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../QueryErrorNote'
import { CollapsibleBody } from '../activity/CollapsibleBody'

interface FeedItem {
  id: string
  dotColor: string
  /** First name only, with the initials badge beside it (principle 12). */
  actorName: string | null
  actorInitials: string | null
  description: string
  time: string
  link?: string
}

// Collapsed entries show 3 lines (Nick 2026-06-15: consistent height, easier
// on the eyes) through the shared CollapsibleBody, which offers "more" only
// when the text measurably overflows (#8635: was a `length > 120` guess).

/**
 * Pick a small accent dot color based on the activity entry's `type`.
 * Keeps the feed visually scannable without inventing a per-row icon.
 */
function dotColorForType(type: string): string {
  if (type.startsWith('task')) return 'var(--sk-t2)'
  if (type.startsWith('project')) return 'var(--sk-t2)'
  if (type.startsWith('comment')) return 'var(--sk-t2)'
  if (type.startsWith('meeting')) return 'var(--sk-t2)'
  if (type.startsWith('idea')) return 'var(--sk-t2)'
  if (type.startsWith('decision')) return 'var(--sk-t2)'
  return 'var(--slate)'
}

/**
 * One feed row's text: the actor badge + name, then the description, collapsed
 * to 3 lines. Exported so feed-entry-cap.test.tsx measures the real markup: the
 * inline badge sits on line 1, and a badge taller than the line pushes line 3
 * past CollapsibleBody's 3-line cap and clips it.
 */
export function FeedEntryText({ actorName, actorInitials, description }: Pick<FeedItem, 'actorName' | 'actorInitials' | 'description'>) {
  return (
    <CollapsibleBody maxLines={3} fontSize="12.5px" lineHeight={1.375} contentKey={description}>
      <p style={{ color: 'var(--ink)', margin: 0 }}>
        {actorName ? (
          <>
            {/* .tk scopes the shared Today initials badge (.tk-face, 16px at .tk-sm) */}
            <span className="tk" style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: 'inherit', color: 'inherit' }}>
              <span className="tk-face tk-sm" aria-hidden="true">{actorInitials}</span>
            </span>
            {' '}
            <span style={{ fontWeight: 500 }}>{actorName}</span>
          </>
        ) : null}
        {actorName ? ' ' : ''}
        {description}
      </p>
    </CollapsibleBody>
  )
}

function ActivityFeedCard() {
  const mounted = useDashboardMounted()
  // Over-fetch a bit so the post-filter feed still has 5 items.
  const { data: rawActivity = [], isError, refetch } = useActivity(20)

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
          actorName: person ? person.name.split(' ')[0] : null,
          actorInitials: person?.initials ?? null,
          description: a.description || '',
          time: formatRelativeTime(a.timestamp),
          link: PATHS.activity,
        }
      })
  }, [rawActivity, mounted])

  return (
    <BentoCard title="Recent Activity" subtitle="Lab updates" size="span-1x2" icon={Activity} drillDown>
      <div className="flex flex-col h-full">
        {/* Feed list. No inner scroll box: the feed is at most five entries
            clamped to 3 lines, so it is already bounded, and the card's fit
            height follows it. The old 340px cap with its own scroll cut the
            last entry through a line, and the last entry is the NEWEST one
            (G8-13, 2026-10-14). */}
        <div
          className="flex-1 -mx-1 px-1"
          role="region"
          aria-label="Activity feed"
          style={{ minHeight: '72px' }}
        >
          <div className="relative">
            {/* Vertical line: only beside entries, never on the empty state */}
            {items.length > 0 && <div
              style={{
                position: 'absolute',
                left: '7px',
                top: '12px',
                bottom: '12px',
                width: '1.5px',
                background: 'linear-gradient(to top, var(--sk-t2), transparent)',
                opacity: 0.15,
              }}
            />}

            {items.length === 0 && (
              isError ? (
                <div className="py-4 flex items-center justify-center">
                  <QueryErrorNote label="activity feed" onRetry={() => refetch()} />
                </div>
              ) : (
                <div className="py-4 text-center" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  No recent activity yet.
                </div>
              )
            )}
            {items.map((item, i) => {
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 py-2.5 relative group"
                  style={{
                    borderBottom: i < items.length - 1
                      ? '1px solid color-mix(in srgb, var(--sk-t1) 3%, transparent)'
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
                    <FeedEntryText actorName={item.actorName} actorInitials={item.actorInitials} description={item.description} />
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
            color: 'var(--slate)',
            textDecoration: 'none',
            borderTop: '1px solid var(--border-subtle)',
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
