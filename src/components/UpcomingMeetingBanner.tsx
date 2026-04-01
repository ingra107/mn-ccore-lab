import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ArrowRight, CheckCircle2, UserCheck } from 'lucide-react'
import { useMeetingsApi, useActionItems } from '../hooks/useApiData'
import { getMeetingFacilitator } from '../lib/facilitator'
import { getPersonInfo } from '../data/team'

export default function UpcomingMeetingBanner() {
  const { data: meetings = [] } = useMeetingsApi()
  const { data: actionItems = [] } = useActionItems()

  // Find the next upcoming meeting: status='upcoming' or nearest future date
  const nextMeeting = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

    // First try status='upcoming'
    const upcoming = meetings.find((m) => m.status === 'upcoming')
    if (upcoming) return upcoming

    // Fallback: first meeting with date >= today, sorted ascending
    const future = meetings
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] || null
  }, [meetings])

  // Count pending action items for this meeting
  const pendingCount = useMemo(() => {
    if (!nextMeeting) return 0
    return actionItems.filter(
      (ai) => ai.meeting_id === nextMeeting.id && !ai.completed
    ).length
  }, [nextMeeting, actionItems])

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
          to={`/meetings/${nextMeeting.id}`}
          className="block rounded-2xl p-5 sm:p-6 lg:p-7 transition-all duration-300 group"
          style={{
            textDecoration: 'none',
            background:
              'linear-gradient(135deg, rgba(201,168,76,0.06), rgba(45,138,138,0.04))',
            border: '1px solid rgba(201,168,76,0.15)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'
            e.currentTarget.style.boxShadow =
              '0 4px 20px rgba(201,168,76,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Left side: Calendar icon + meeting info */}
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 p-3 rounded-xl"
                style={{ background: 'rgba(201,168,76,0.12)' }}
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
                    fontFamily: 'var(--font-mono)',
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
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
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
                  const fSlug = getMeetingFacilitator(nextMeeting.date)
                  const fInfo = fSlug ? getPersonInfo(fSlug) : null
                  return fInfo ? (
                    <p
                      className="flex items-center gap-1.5 text-xs mt-1"
                      style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', margin: '4px 0 0 0' }}
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
                      fontFamily: 'var(--font-body)',
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
                    fontFamily: 'var(--font-body)',
                    color: 'var(--gold)',
                  }}
                >
                  View Meeting
                </span>
                <ArrowRight
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
