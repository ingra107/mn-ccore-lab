import StatRow from '../components/ui/StatRow'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckCircle2, Circle, Clock,
  Calendar, ListChecks, Flag, Printer} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { TableSkeleton } from '../components/LoadingSkeleton'
import Breadcrumb from '../components/Breadcrumb'
import { FaceDisc } from '../components/today/skin'
import { getPersonInfo } from '../data/team'
import { slugForEmail } from '../lib/emailSlug'
import { formatLongDate, formatShortDate, isOverdue as isItemOverdue } from '../lib/dateUtils'
import { PRIORITY_COLORS } from '../lib/taskConstants'
import { PATHS } from '../constants/paths'
import EntityNotFound from '../components/EntityNotFound'
import { ICON_PROPS } from '../lib/iconProps'
import SectionHead from '../components/ui/SectionHead'
import PageHeartbeat from '../components/moments/PageHeartbeat'

interface PrepData {
  meeting: { id: string; title: string; date: string; status: string; attendees: string | null; facilitator?: string | null }
  previousMeeting: { id: string; date: string; title: string } | null
  previousActionItems: { id: string; description: string; assignee: string; completed: number; due_date: string | null }[]
  recentActivity: { type: string; description: string; actor: string; entity_id: string; entity_type: string; created_at: string }[]
  upcomingDeadlines: { id: string; title: string; description: string; assignee: string; due_date: string; priority: string; status: string }[]
  overdueTasks: { id: string; title: string; description: string; assignee: string; due_date: string; priority: string }[]
  agendaItems: { id: string; content: string; added_by: string; type: string; sort_order: number }[]
}

function useMeetingPrep(meetingId: string) {
  return useQuery<PrepData>({
    queryKey: ['meeting-prep', meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/meetings/${meetingId}/prep`)
      const json = await res.json() as { data: PrepData }
      return json.data
    },
    enabled: !!meetingId,
  })
}

export default function MeetingPrep() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useMeetingPrep(id || '')

  usePageMeta(
    data ? `Prep: ${data.meeting.title} | MN-CCORE` : 'Meeting Prep | MN-CCORE',
    'Facilitator preparation view with action items, activity, and deadlines.'
  )

  if (isLoading) {
    return (
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        <Breadcrumb backTo="/meetings" backLabel="Meetings" current="Prep" />
        <TableSkeleton rows={6} cols={3} />
      </div>
    )
  }

  if (!data) {
    return (
      <EntityNotFound
        entityLabel="Meeting"
        reference={id}
        artVariant="meetings"
        backTo={{ to: PATHS.meetings, label: 'Back to Meetings' }}
      />
    )
  }

  const { meeting, previousMeeting, previousActionItems, recentActivity, upcomingDeadlines, overdueTasks, agendaItems } = data
  // #102: the RECORDED facilitator, or nothing. No derivation.
  const facilitator = meeting.facilitator ? getPersonInfo(meeting.facilitator) : null
  const pendingPrev = previousActionItems.filter(a => !a.completed)
  const completedPrev = previousActionItems.filter(a => a.completed)

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        <Breadcrumb backTo={PATHS.meeting(meeting.id)} backLabel={meeting.title} current="Prep View" />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks {...ICON_PROPS} size={16} style={{ color: 'var(--sk-t3)' }} />
            <span style={{ fontSize: 11, color: 'var(--sk-t2)', fontWeight: 500 }}>
              Facilitator Prep
            </span>
          </div>
          <h1 style={{ fontWeight: 600, fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'var(--ink)', margin: 0 }}>
            {meeting.title}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p style={{ fontSize: 14, color: 'var(--slate)', margin: 0 }}>
              {formatLongDate(meeting.date)}
              {facilitator && ` — Facilitated by ${facilitator.name}`}
            </p>
            <button
              onClick={() => window.print()}
              className="tk-btn tk-sm"
              title="Print prep sheet"
            >
              <Printer {...ICON_PROPS} size={12} />
              Print
            </button>
          </div>
          {/* The heartbeat line under the title (color-back pick 10). */}
          <PageHeartbeat />
          {/* Meeting countdown */}
          {(() => {
            const meetingDate = new Date(meeting.date + 'T15:00:00') // 3pm CT
            const now = new Date()
            const diffMs = meetingDate.getTime() - now.getTime()
            if (diffMs < 0) return null
            const days = Math.floor(diffMs / 86400000)
            const hours = Math.floor((diffMs % 86400000) / 3600000)
            const label = days > 0 ? `${days}d ${hours}h until meeting` : hours > 0 ? `${hours}h until meeting` : 'Meeting starting soon'
            return (
              <span
                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: days === 0 ? 'color-mix(in srgb, var(--job-wants) 15%, transparent)' : 'var(--sk-line)',
                  color: days === 0 ? 'var(--job-wants)' : 'var(--sk-t2)',
                }}
              >
                <Clock {...ICON_PROPS} size={10} />
                {label}
              </span>
            )
          })()}
          <div style={{ height: 1, background: 'linear-gradient(to right, var(--sk-line2), transparent)', opacity: 0.85, marginTop: '1rem', marginBottom: '1.5rem' }} />
        </motion.div>

        {/* Stats row */}
        <StatRow
          stats={[
            { label: 'Overdue', value: overdueTasks.length, rule: 'o' },
            { label: 'Pending from last', value: pendingPrev.length },
            { label: 'Deadlines (14d)', value: upcomingDeadlines.length },
            { label: 'Recent activity', value: recentActivity.length },
          ]}
        />

        {/* Three-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Previous Action Items */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <SectionHead title="Previous action items" count={previousMeeting ? `From ${formatShortDate(previousMeeting.date)}` : undefined} />
            <div className="detail-card" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {pendingPrev.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--sk-t2)', marginBottom: 6 }}>
                    Still pending ({pendingPrev.length})
                  </p>
                  {pendingPrev.map(item => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              )}
              {completedPrev.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--st-done)', opacity: 0.85, marginBottom: 6 }}>
                    Completed ({completedPrev.length})
                  </p>
                  {completedPrev.map(item => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              )}
              {previousActionItems.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85, textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                  No previous meeting found
                </p>
              )}
            </div>
          </motion.div>

          {/* Center: Suggested Agenda */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <SectionHead title="Suggested agenda" />
            <div className="detail-card" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {/* Overdue items first */}
              {overdueTasks.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--job-overdue)', marginBottom: 6 }}>
                    Discuss: Overdue items
                  </p>
                  {overdueTasks.slice(0, 5).map(task => {
                    const person = getPersonInfo(task.assignee)
                    return (
                      <div key={task.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid var(--sk-line)` }}>
                        <Flag {...ICON_PROPS} size={10} style={{ color: PRIORITY_COLORS[task.priority] || 'var(--slate)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{task.title || task.description}</span>
                        <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                          <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Team-added agenda items */}
              {agendaItems.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--sk-t2)', marginBottom: 6 }}>
                    Team agenda ({agendaItems.length})
                  </p>
                  {agendaItems.map((item, i) => (
                    <div key={item.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: i < agendaItems.length - 1 ? `1px solid var(--sk-line)` : 'none' }}>
                      <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85, marginTop: 2, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending carry-forwards */}
              {pendingPrev.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--sk-t2)', marginBottom: 6 }}>
                    Carry forward ({pendingPrev.length})
                  </p>
                  {pendingPrev.map(item => {
                    const person = getPersonInfo(item.assignee)
                    return (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        <Circle {...ICON_PROPS} size={10} style={{ color: 'var(--sk-t3)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{item.description}</span>
                        <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                          <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {agendaItems.length === 0 && overdueTasks.length === 0 && pendingPrev.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85, textAlign: 'center', padding: 'var(--sp-lg) 0', margin: 0 }}>
                  No agenda items yet. The team can add items from the meeting page.
                </p>
              )}
            </div>
          </motion.div>

          {/* Right: Upcoming Deadlines + Activity */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <SectionHead title="Upcoming deadlines" count="Next 14 days" />
            <div className="detail-card" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
              {upcomingDeadlines.length > 0 ? (
                upcomingDeadlines.slice(0, 8).map(task => {
                  const person = getPersonInfo(task.assignee)
                  return (
                    <div key={task.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid var(--sk-line)` }}>
                      <Calendar {...ICON_PROPS} size={10} style={{ color: 'var(--sk-t3)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{task.title || task.description}</span>
                      <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85 }}>{formatShortDate(task.due_date)}</span>
                      <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                        <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
                      </div>
                    </div>
                  )
                })
              ) : (
                <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85, textAlign: 'center', padding: 'var(--sp-md) 0', margin: 0 }}>
                  No deadlines in the next two weeks.
                </p>
              )}
            </div>

            <SectionHead title="Recent activity" count="Last 14 days" />
            <div className="detail-card" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 10).map((act, i) => {
                  // Rule 34: never split('@')[0] — route through the team_members directory.
                  const person = getPersonInfo(slugForEmail(act.actor || ''))
                  return (
                    <div key={i} className="flex items-start gap-2 py-1.5" style={{ borderBottom: i < Math.min(recentActivity.length, 10) - 1 ? `1px solid var(--sk-line)` : 'none' }}>
                      <div style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
                        <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--ink)', flex: 1, lineHeight: 1.4 }}>{act.description}</span>
                    </div>
                  )
                })
              ) : (
                <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85, textAlign: 'center', padding: 'var(--sp-md) 0', margin: 0 }}>
                  No recent activity.
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Back to meeting detail */}
        <div className="mt-8 text-center">
          <Link
            to={PATHS.meeting(meeting.id)}
            style={{ fontSize: 13, color: 'var(--job-accent)', textDecoration: 'none' }}
          >
            Back to meeting details
          </Link>
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ──────────────────

function ActionRow({ item }: { item: { id: string; description: string; assignee: string; completed: number; due_date: string | null } }) {
  const person = getPersonInfo(item.assignee)
  // R4: canonical isOverdue() uses T23:59:59 — hand-rolled missed same-day items.
  const isOverdue = item.due_date && !item.completed && isItemOverdue(item.due_date)
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid var(--sk-line)` }}>
      {item.completed ? (
        <CheckCircle2 {...ICON_PROPS} size={12} style={{ color: 'var(--st-done)', flexShrink: 0 }} />
      ) : (
        <Circle {...ICON_PROPS} size={12} style={{ color: isOverdue ? 'var(--job-overdue)' : 'var(--slate)', opacity: 0.85, flexShrink: 0 }} />
      )}
      <span style={{
        fontSize: 12, color: 'var(--ink)', flex: 1,
        textDecoration: item.completed ? 'line-through' : 'none',
        opacity: item.completed ? 0.85 : 1,
      }}>
        {item.description}
      </span>
      <div style={{ width: 16, height: 16, flexShrink: 0 }}>
        <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={16} />
      </div>
    </div>
  )
}
