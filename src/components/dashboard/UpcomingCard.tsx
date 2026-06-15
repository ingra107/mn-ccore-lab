import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, AlertCircle, ArrowRight, ListChecks, CalendarOff, UserCheck } from 'lucide-react'
import { useMeetingsApi, useActionItems, useMeetingCadence, useTasks } from '../../hooks/useApiData'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { getMeetingFacilitator } from '../../lib/facilitator'
import { localDateKey } from '../../lib/dateUtils'
import { isTaskDone } from '../../lib/taskGrouping'
import { getPersonInfo } from '../../data/team'
import BentoCard from './BentoCard'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

interface Deadline {
  date: string
  label: string
  type: 'task' | 'grant' | 'milestone'
  daysUntil: number
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function typeColor(type: Deadline['type']): string {
  switch (type) {
    case 'task': return 'var(--teal)'
    case 'grant': return 'var(--gold)'
    case 'milestone': return 'var(--slate)'
  }
}

function UpcomingCard() {
  const { data: meetings = [] } = useMeetingsApi()
  const { data: allActionItems = [] } = useActionItems()
  const { data: cadence } = useMeetingCadence()
  const { data: tasks = [] } = useTasks()
  const { data: grants = [] } = useGrantTimeline()

  // Aggregate real deadlines from open tasks (with due_date) + grant milestones.
  // Cap to 5 most-urgent: overdue first (most-overdue first), then ascending by days-until-due.
  const deadlines = useMemo<Deadline[]>(() => {
    const now = new Date()
    const items: Deadline[] = []

    // Open tasks with a due_date (skip completed)
    for (const t of tasks) {
      if (!t.due_date || isTaskDone(t)) continue
      const due = new Date(t.due_date + 'T23:59:59')
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        date: formatDateShort(due),
        label: t.title || t.description || 'Untitled task',
        type: 'task',
        daysUntil,
      })
    }

    // Grant milestones (target_date)
    for (const g of grants) {
      for (const m of g.milestones || []) {
        if (!m.target_date) continue
        if (m.status === 'completed') continue
        const due = new Date(m.target_date + 'T23:59:59')
        const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        items.push({
          date: formatDateShort(due),
          label: `${g.mechanism}: ${m.title}`,
          type: 'milestone',
          daysUntil,
        })
      }
    }

    // Grant submission targets (end_date) for grants in submission lifecycle
    for (const g of grants) {
      if (!g.end_date) continue
      // Only surface grants that haven't yet been funded/closed/declined
      if (g.status === 'funded' || g.status === 'closed' || g.status === 'declined') continue
      const due = new Date(g.end_date + 'T23:59:59')
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        date: formatDateShort(due),
        label: `${g.mechanism} ${g.pi || ''} — ${g.title}`.trim(),
        type: 'grant',
        daysUntil,
      })
    }

    // Sort: overdue first (negative days, most overdue first), then ascending by days-until-due
    items.sort((a, b) => {
      const aOver = a.daysUntil < 0
      const bOver = b.daysUntil < 0
      if (aOver && bOver) return a.daysUntil - b.daysUntil  // -10 before -2
      if (aOver) return -1
      if (bOver) return 1
      return a.daysUntil - b.daysUntil  // ascending future
    })

    return items.slice(0, 5)
  }, [tasks, grants])

  // Find the next upcoming meeting — closest future date wins, regardless of status
  const nextMeeting = useMemo(() => {
    const today = localDateKey()
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
          className="mb-3"
          style={{
            // N1b de-box: was a bg+border sub-box inside the card. Flattened to
            // a left-accent section — identity via the accent + whitespace, not a box.
            borderLeft: '2px solid rgba(201, 168, 76, 0.35)',
            paddingLeft: '10px',
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
              <p style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85, margin: '2px 0 0 0' }}>
                {new Date(nextMeeting.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              {(() => {
                const fSlug = getMeetingFacilitator(nextMeeting.date)
                const fInfo = fSlug ? getPersonInfo(fSlug) : null
                return fInfo ? (
                  <p className="flex items-center gap-1" style={{ fontSize: '10px', color: 'var(--teal)', margin: '2px 0 0 0' }}>
                    <UserCheck {...ICON_PROPS} size={10} />
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
                <ListChecks {...ICON_PROPS} size={11} style={{ color: 'var(--teal)', opacity: 0.8 }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85 }}>
                  {meetingActionCounts.pending}/{meetingActionCounts.total} pending
                </span>
              </div>
            )}
            <Link
              to={PATHS.meeting(nextMeeting.id)}
              className="inline-flex items-center gap-1"
              style={{
                fontSize: '10px',
                color: 'var(--gold)',
                textDecoration: 'none',
                fontWeight: 'var(--label-weight)',
                marginLeft: 'auto',
              }}
            >
              View Meeting <ArrowRight {...ICON_PROPS} size={10} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 px-1 py-2">
          {/* N1b de-box: empty state is one quiet line, not a bordered block (canon). */}
          <CalendarOff {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            No meeting scheduled
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {deadlines.length === 0 && (
          <div className="py-3 text-center" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            No upcoming deadlines
          </div>
        )}
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
                    <AlertCircle {...ICON_PROPS}
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
                      opacity: 0.85,
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
          50% { opacity: 0.85; }
        }
      `}</style>
    </BentoCard>
  )
}

export default memo(UpcomingCard)
