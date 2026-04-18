import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, AlertCircle, ArrowRight, ListChecks, CalendarOff, UserCheck } from 'lucide-react'
import { useMeetingsApi, useActionItems, useMeetingCadence } from '../../hooks/useApiData'
import { getMeetingFacilitator } from '../../lib/facilitator'
import { getPersonInfo } from '../../data/team'
import BentoCard from './BentoCard'

interface Deadline {
  date: string
  label: string
  type: 'grant' | 'milestone' | 'review'
  daysUntil: number
}

function generateDeadlines(): Deadline[] {
  // Generate plausible upcoming deadlines based on real grant/project data
  const deadlines: Deadline[] = [
    {
      date: formatDate(daysFromNow(12)),
      label: 'R01 ADHERE-LPV LOI due',
      type: 'grant',
      daysUntil: 12,
    },
    {
      date: formatDate(daysFromNow(28)),
      label: 'LPV Variation revision response',
      type: 'review',
      daysUntil: 28,
    },
    {
      date: formatDate(daysFromNow(45)),
      label: 'CLIF annual meeting abstract',
      type: 'milestone',
      daysUntil: 45,
    },
    {
      date: formatDate(daysFromNow(67)),
      label: 'K23 progress report',
      type: 'grant',
      daysUntil: 67,
    },
    {
      date: formatDate(daysFromNow(-3)),
      label: 'CCI-ARDS data freeze',
      type: 'milestone',
      daysUntil: -3,
    },
  ]

  return deadlines.sort((a, b) => a.daysUntil - b.daysUntil)
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function typeColor(type: Deadline['type']): string {
  switch (type) {
    case 'grant': return 'var(--gold)'
    case 'review': return 'var(--teal)'
    case 'milestone': return 'var(--slate)'
  }
}

function UpcomingCard() {
  const deadlines = generateDeadlines()
  const { data: meetings = [] } = useMeetingsApi()
  const { data: allActionItems = [] } = useActionItems()
  const { data: cadence } = useMeetingCadence()

  // Find the next upcoming meeting — closest future date wins, regardless of status
  const nextMeeting = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const future = [...meetings]
      .filter((m) => m.date >= today && m.status !== 'cancelled')
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] ?? null
  }, [meetings])

  // Count action items for the next meeting
  const meetingActionCounts = useMemo(() => {
    if (!nextMeeting) return { pending: 0, total: 0 }
    const meetingActions = allActionItems.filter((a) => a.meeting_id === nextMeeting.id)
    return {
      pending: meetingActions.filter((a) => !a.completed).length,
      total: meetingActions.length,
    }
  }, [nextMeeting, allActionItems])

  return (
    <BentoCard title="Upcoming" subtitle="Deadlines & milestones" size="span-1" icon={Calendar} drillDown>
      {/* Next Meeting banner */}
      {nextMeeting ? (
        <div
          className="rounded-lg mb-3"
          style={{
            background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.08), rgba(45, 138, 138, 0.06))',
            border: '1px solid rgba(201, 168, 76, 0.15)',
            padding: '10px 12px',
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.3 }}>
                Next Meeting
              </p>
              <p style={{ fontSize: '12px', color: 'var(--ink)', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                {nextMeeting.title.split(':')[0]}
              </p>
              <p style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7, margin: '2px 0 0 0' }}>
                {new Date(nextMeeting.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              {(() => {
                const fSlug = getMeetingFacilitator(nextMeeting.date)
                const fInfo = fSlug ? getPersonInfo(fSlug) : null
                return fInfo ? (
                  <p className="flex items-center gap-1" style={{ fontSize: '10px', color: 'var(--teal)', margin: '2px 0 0 0' }}>
                    <UserCheck size={10} />
                    {fInfo.name.split(' ')[0]}
                  </p>
                ) : null
              })()}
            </div>
          </div>
          {/* Cadence pill */}
          {cadence && cadence.recommendation !== 'no_upcoming' && (
            <div
              className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full"
              style={{
                background: cadence.score >= 40
                  ? 'var(--green-hover)'
                  : cadence.score >= 20
                    ? 'rgba(234, 179, 8, 0.08)'
                    : cadence.score >= 0
                      ? 'rgba(249, 115, 22, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${
                  cadence.score >= 40
                    ? 'rgba(34, 197, 94, 0.2)'
                    : cadence.score >= 20
                      ? 'rgba(234, 179, 8, 0.2)'
                      : cadence.score >= 0
                        ? 'rgba(249, 115, 22, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)'
                }`,
                width: 'fit-content',
              }}
            >
              <span style={{ fontSize: '10px', lineHeight: 1 }}>{cadence.emoji}</span>
              <span style={{
                fontSize: '10px',
                color: 'var(--slate)',
                opacity: 0.8,
              }}>
                {cadence.recommendation}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            {meetingActionCounts.total > 0 && (
              <div className="flex items-center gap-1.5">
                <ListChecks size={11} style={{ color: 'var(--teal)', opacity: 0.8 }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7 }}>
                  {meetingActionCounts.pending}/{meetingActionCounts.total} pending
                </span>
              </div>
            )}
            <Link
              to={`/meetings/${nextMeeting.id}`}
              className="inline-flex items-center gap-1"
              style={{
                fontSize: '10px',
                color: 'var(--gold)',
                textDecoration: 'none',
                fontWeight: 'var(--label-weight)',
                marginLeft: 'auto',
              }}
            >
              View Meeting <ArrowRight size={10} />
            </Link>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-lg mb-3 px-3 py-3"
          style={{
            background: 'rgba(100, 116, 139, 0.04)',
            border: '1px solid rgba(100, 116, 139, 0.08)',
          }}
        >
          <CalendarOff size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            No meeting scheduled
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {deadlines.map((d, i) => {
          const isUrgent = d.daysUntil >= 0 && d.daysUntil <= 30
          const isOverdue = d.daysUntil < 0

          return (
            <div
              key={i}
              className="flex items-start gap-2.5 py-2"
              style={{
                borderBottom: i < deadlines.length - 1
                  ? '1px solid var(--gold-hover)'
                  : 'none',
              }}
            >
              {/* Date badge */}
              <div
                className="flex-shrink-0 text-center"
                style={{
                  minWidth: '46px',
                  padding: '3px 6px',
                  borderRadius: 'var(--radius-md)',
                  background: isOverdue
                    ? 'rgba(122, 0, 25, 0.1)'
                    : isUrgent
                      ? 'var(--gold-emphasis)'
                      : 'rgba(100, 116, 139, 0.06)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: isOverdue
                    ? 'var(--maroon)'
                    : isUrgent
                      ? 'var(--gold)'
                      : 'var(--slate)',
                  lineHeight: 1.3,
                }}
              >
                {d.date}
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <p
                  className="flex items-center gap-1"
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink)',
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {isOverdue && (
                    <AlertCircle
                      size={11}
                      style={{
                        color: 'var(--maroon)',
                        flexShrink: 0,
                        animation: 'overdue-pulse 2s ease-in-out infinite',
                      }}
                    />
                  )}
                  {d.label}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 'var(--radius-circle)',
                      background: typeColor(d.type),
                      opacity: 0.6,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-hint)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {d.type}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Overdue pulse animation */}
      <style>{`
        @keyframes overdue-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </BentoCard>
  )
}

export default memo(UpcomingCard)
