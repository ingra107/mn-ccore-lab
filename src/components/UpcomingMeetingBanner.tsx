import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ArrowRight, CheckCircle2, UserCheck } from 'lucide-react'
import { useMeetingsApi, useMeetingLinkedTasks } from '../hooks/useApiData'
import { localDateKey } from '../lib/dateUtils'
import { countActionsByMeetingId } from '../lib/meetingTaskCounts'
import { getPersonInfo } from '../data/team'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

export default function UpcomingMeetingBanner() {
  const { data: meetings = [] } = useMeetingsApi()
  const { data: allMeetingTasks = [] } = useMeetingLinkedTasks()

  // Find the next upcoming meeting: status='upcoming' or nearest future date
  const nextMeeting = useMemo(() => {
    const today = localDateKey()

    // First try status='upcoming'
    const upcoming = meetings.find((m) => m.status === 'upcoming')
    if (upcoming) return upcoming

    // Fallback: first meeting with date >= today, sorted ascending
    const future = meetings
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] || null
  }, [meetings])

  // T19 (#547): dual-id join (T3: IN (id, source_id)) via the shared
  // countActionsByMeetingId, so a PB-calendar-matched next meeting's tasks
  // aren't undercounted.
  const pendingCount = useMemo(() => {
    if (!nextMeeting) return 0
    return countActionsByMeetingId(allMeetingTasks, [nextMeeting]).get(nextMeeting.id)?.pendingCount ?? 0
  }, [nextMeeting, allMeetingTasks])

  if (!nextMeeting) return null

  // Format the date nicely
  const meetingDate = new Date(nextMeeting.date + 'T12:00:00')
  const formattedDate = meetingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="section-cream">
      <section className="py-6 sm:py-8 content-container">
        <Link
          to={PATHS.meeting(nextMeeting.id)}
          className="block rounded-2xl p-5 sm:p-6 lg:p-7 transition-all duration-300 group"
          style={{
            textDecoration: 'none',
            background:
              `linear-gradient(135deg, ${withAlpha(ACCENT_GOLD, 6)}, rgba(45,138,138,0.04))`,
            border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = withAlpha(ACCENT_GOLD, 30)
            e.currentTarget.style.boxShadow =
              '0 4px 20px var(--gold-active)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--gold-emphasis)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Left side: Calendar icon + meeting info */}
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 p-3 rounded-xl"
                style={{ background: 'var(--gold-emphasis)' }}
              >
                <Calendar
                  size={22}
                  strokeWidth={1.5}
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
                />
              </div>
              <div>
                <p
                  className="text-xs mb-1"
                  style={{
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    fontSize: '10px',
                  }}
                >
                  Next Meeting
                </p>
                <h3
                  className="text-base sm:text-lg mb-1"
                  style={{
                    fontWeight: 400,
                    color: 'var(--ink)',
                    lineHeight: 1.3,
                  }}
                >
                  {nextMeeting.title}
                </h3>
                <p
                  className="text-sm"
                  style={{ color: 'var(--slate)' }}
                >
                  {formattedDate}
                </p>
                {(() => {
                  // #102: recorded facilitator only — never derived from the date.
                  const fInfo = nextMeeting.facilitator ? getPersonInfo(nextMeeting.facilitator) : null
                  return fInfo ? (
                    <p
                      className="flex items-center gap-1.5 text-xs mt-1"
                      style={{ color: 'var(--teal)', margin: 'var(--sp-xs) 0 0 0' }}
                    >
                      <UserCheck size={13} strokeWidth={1.5} aria-hidden="true" />
                      Facilitated by {fInfo.name}
                    </p>
                  ) : null
                })()}
              </div>
            </div>

            {/* Right side: action items + arrow */}
            <div className="flex items-center gap-4 sm:gap-5">
              {pendingCount > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: 'var(--teal)' }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-sm"
                    style={{
                      color: 'var(--slate)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pendingCount} pending action{pendingCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className="text-sm font-medium hidden sm:inline"
                  style={{
                    color: 'var(--gold)',
                  }}
                >
                  View Meeting
                </span>
                <ArrowRight {...ICON_PROPS}
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </Link>
      </section>
    </div>
  )
}
