import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  Calendar, ListChecks, Activity, Flag, Printer,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { TableSkeleton } from '../components/LoadingSkeleton'
import Breadcrumb from '../components/Breadcrumb'
import Avatar from '../components/Avatar'
import { getPersonInfo } from '../data/team'
import { emailToSlug } from '../lib/emailSlug'
import { formatLongDate, formatShortDate } from '../lib/dateUtils'
import { PRIORITY_COLORS } from '../lib/taskConstants'
import { getMeetingFacilitator } from '../lib/facilitator'
import { PATHS } from '../constants/paths'
import { staggerContainer, staggerItem } from '../lib/animations'
import EntityNotFound from '../components/EntityNotFound'

interface PrepData {
  meeting: { id: string; title: string; date: string; status: string; attendees: string | null }
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
  const facilitatorSlug = getMeetingFacilitator(meeting.date)
  const facilitator = facilitatorSlug ? getPersonInfo(facilitatorSlug) : null
  const pendingPrev = previousActionItems.filter(a => !a.completed)
  const completedPrev = previousActionItems.filter(a => a.completed)

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        <Breadcrumb backTo={PATHS.meeting(meeting.id)} backLabel={meeting.title} current="Prep View" />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks size={16} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: 11, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
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
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer', opacity: 0.85 }}
              title="Print prep sheet"
            >
              <Printer size={12} />
              Print
            </button>
          </div>
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
                  backgroundColor: days === 0 ? 'var(--teal-active)' : 'var(--gold-active)',
                  color: days === 0 ? 'var(--teal)' : 'var(--gold)',
                }}
              >
                <Clock size={10} />
                {label}
              </span>
            )
          })()}
          <div style={{ height: 1, background: 'linear-gradient(to right, var(--gold), transparent)', opacity: 0.85, marginTop: '1rem', marginBottom: '1.5rem' }} />
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <StatCard icon={<AlertTriangle size={14} />} label="Overdue" value={overdueTasks.length} color="var(--maroon)" />
          <StatCard icon={<Clock size={14} />} label="Pending from last" value={pendingPrev.length} color="var(--orange)" />
          <StatCard icon={<Calendar size={14} />} label="Deadlines (14d)" value={upcomingDeadlines.length} color="var(--teal)" />
          <StatCard icon={<Activity size={14} />} label="Recent activity" value={recentActivity.length} color="var(--gold)" />
        </motion.div>

        {/* Three-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Previous Action Items */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <SectionHeader icon={<CheckCircle2 size={14} />} title="Previous Action Items" subtitle={previousMeeting ? `From ${formatShortDate(previousMeeting.date)}` : undefined} />
            <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {pendingPrev.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--orange)', opacity: 0.85, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Still pending ({pendingPrev.length})
                  </p>
                  {pendingPrev.map(item => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              )}
              {completedPrev.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--green)', opacity: 0.85, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
            <SectionHeader icon={<ListChecks size={14} />} title="Suggested Agenda" />
            <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {/* Overdue items first */}
              {overdueTasks.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--maroon)', opacity: 0.85, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Discuss: Overdue items
                  </p>
                  {overdueTasks.slice(0, 5).map(task => {
                    const person = getPersonInfo(task.assignee)
                    return (
                      <div key={task.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}>
                        <Flag size={10} style={{ color: PRIORITY_COLORS[task.priority] || 'var(--slate)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{task.title || task.description}</span>
                        <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Team-added agenda items */}
              {agendaItems.length > 0 && (
                <div className="mb-3">
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--teal)', opacity: 0.85, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Team agenda ({agendaItems.length})
                  </p>
                  {agendaItems.map((item, i) => (
                    <div key={item.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: i < agendaItems.length - 1 ? '1px solid rgba(201,168,76,0.04)' : 'none' }}>
                      <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85, marginTop: 2, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ fontSize: 12, color: 'var(--ink)' }}>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending carry-forwards */}
              {pendingPrev.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--orange)', opacity: 0.85, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Carry forward ({pendingPrev.length})
                  </p>
                  {pendingPrev.map(item => {
                    const person = getPersonInfo(item.assignee)
                    return (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        <Circle size={10} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{item.description}</span>
                        <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
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
            <SectionHeader icon={<Calendar size={14} />} title="Upcoming Deadlines" subtitle="Next 14 days" />
            <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
              {upcomingDeadlines.length > 0 ? (
                upcomingDeadlines.slice(0, 8).map(task => {
                  const person = getPersonInfo(task.assignee)
                  return (
                    <div key={task.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}>
                      <Calendar size={10} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1 }}>{task.title || task.description}</span>
                      <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85 }}>{formatShortDate(task.due_date)}</span>
                      <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
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

            <SectionHeader icon={<Activity size={14} />} title="Recent Activity" subtitle="Last 14 days" />
            <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: 'var(--sp-md) var(--sp-lg)' }}>
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 10).map((act, i) => {
                  // Rule 34: never split('@')[0] — route through emailToSlug LUT.
                  const person = getPersonInfo(emailToSlug(act.actor || ''))
                  return (
                    <div key={i} className="flex items-start gap-2 py-1.5" style={{ borderBottom: i < Math.min(recentActivity.length, 10) - 1 ? '1px solid rgba(201,168,76,0.04)' : 'none' }}>
                      <div style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
                        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
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
            style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}
          >
            Back to meeting details
          </Link>
        </div>
      </div>

      <style>{`
        .dark .detail-card { background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important; border: 1px solid var(--border-subtle); }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <motion.div
      variants={staggerItem}
      className="detail-card"
      style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <div style={{ color, opacity: 0.85 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: value > 0 ? color : 'var(--slate)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85, marginTop: 2 }}>
          {label}
        </div>
      </div>
    </motion.div>
  )
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span style={{ color: 'var(--gold)' }}>{icon}</span>
      <h2 style={{ fontWeight: 500, fontSize: 14, color: 'var(--ink)', margin: 0 }}>
        {title}
      </h2>
      {subtitle && (
        <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.85 }}>
          {subtitle}
        </span>
      )}
    </div>
  )
}

function ActionRow({ item }: { item: { id: string; description: string; assignee: string; completed: number; due_date: string | null } }) {
  const person = getPersonInfo(item.assignee)
  const isOverdue = item.due_date && !item.completed && new Date(item.due_date) < new Date()
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}>
      {item.completed ? (
        <CheckCircle2 size={12} style={{ color: 'var(--green)', flexShrink: 0 }} />
      ) : (
        <Circle size={12} style={{ color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: 0.85, flexShrink: 0 }} />
      )}
      <span style={{
        fontSize: 12, color: 'var(--ink)', flex: 1,
        textDecoration: item.completed ? 'line-through' : 'none',
        opacity: item.completed ? 0.85 : 1,
      }}>
        {item.description}
      </span>
      <div style={{ width: 16, height: 16, flexShrink: 0 }}>
        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="2xs" variant="ice" />
      </div>
    </div>
  )
}
