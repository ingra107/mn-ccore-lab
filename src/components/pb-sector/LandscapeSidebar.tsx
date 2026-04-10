import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Flag, AlertTriangle, Clock, CheckCircle2, Users, TrendingDown } from 'lucide-react'
import CalendarTimeline from './CalendarTimeline'

interface CalendarEvent {
  id: string
  date: string
  title: string
  type: 'meeting' | 'task' | 'milestone'
  meta?: any
}

interface LandscapeSidebarProps {
  mode: string
  events: CalendarEvent[]
  milestones: any[]
  commitments: any[]
  projects: any[]
  stats: { totalOpen: number; overdue: number; completedRecently: number }
  recentlyCompleted: any[]
  meetings: any[]
  selectedDate: string
  today: string
}

function SidebarCard({ title, icon: Icon, iconColor, children, linkTo, linkLabel }: {
  title: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  iconColor: string
  children: React.ReactNode
  linkTo?: string
  linkLabel?: string
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(201,168,76,0.1)', background: 'rgba(201,168,76,0.02)' }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={12} style={{ color: iconColor, opacity: 0.7 }} />
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: iconColor }}>
            {title}
          </span>
        </div>
        {linkTo && linkLabel && (
          <Link
            to={linkTo}
            style={{ fontSize: '9px', color: 'var(--teal)', textDecoration: 'none', opacity: 0.6 }}
          >
            {linkLabel}
          </Link>
        )}
      </div>
      <div className="px-3 pb-2.5">
        {children}
      </div>
    </div>
  )
}

function MilestoneRow({ milestone }: { milestone: any }) {
  const daysUntil = useMemo(() => {
    if (!milestone.target_date) return null
    const target = new Date(milestone.target_date + 'T12:00:00')
    const now = new Date()
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }, [milestone.target_date])

  const isOverdue = daysUntil !== null && daysUntil < 0
  const isUrgent = daysUntil !== null && daysUntil <= 3

  return (
    <div className="flex items-start gap-2 py-1">
      <Flag size={10} style={{ color: isOverdue ? 'var(--maroon)' : isUrgent ? 'var(--gold)' : 'var(--slate)', opacity: 0.6, flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.3 }}>
          {milestone.title || milestone.description}
        </span>
        <span style={{ fontSize: '9px', color: isOverdue ? 'var(--maroon)' : isUrgent ? 'var(--gold)' : 'var(--slate)', opacity: 0.7 }}>
          {milestone.project_title && `${milestone.project_title} · `}
          {daysUntil !== null ? (
            isOverdue ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'Today' : `${daysUntil}d`
          ) : ''}
        </span>
      </div>
    </div>
  )
}

export default function LandscapeSidebar({ mode, events, milestones, commitments, projects, stats, recentlyCompleted, meetings, selectedDate, today }: LandscapeSidebarProps) {
  const isToday = selectedDate === today

  // Milestones this week (next 7 days)
  const weekMilestones = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + 7)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return milestones.filter((m: any) => m.target_date && m.target_date <= cutoffStr).slice(0, 5)
  }, [milestones])

  // Open commitments
  const openCommitments = useMemo(() => {
    return commitments.filter((c: any) => c.status !== 'done').slice(0, 4)
  }, [commitments])

  // Stale projects (no update in 14+ days)
  const staleProjects = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return projects.filter((p: any) => {
      const lastUpdate = p.last_update
      return !lastUpdate || lastUpdate < cutoffStr
    }).slice(0, 3)
  }, [projects])

  // Deep work hours: count meeting-free hours between 8-17
  const deepWorkHours = useMemo(() => {
    if (!isToday) return null
    const meetingHours = new Set<number>()
    for (const m of meetings) {
      const d = new Date(m.date)
      if (!isNaN(d.getTime())) {
        meetingHours.add(d.getHours())
      }
    }
    let free = 0
    const now = new Date()
    const startHour = Math.max(8, now.getHours() + 1)
    for (let h = startHour; h < 17; h++) {
      if (!meetingHours.has(h)) free++
    }
    return free
  }, [meetings, isToday])

  // ── Execute mode: calendar only ────────────────────────
  if (mode === 'execute') {
    return (
      <div className="space-y-5">
        <CalendarTimeline events={events} />
      </div>
    )
  }

  // ── Review mode: completed + reflection prompt ─────────
  if (mode === 'review') {
    return (
      <div className="space-y-4">
        <CalendarTimeline events={events} />
        {recentlyCompleted.length > 0 && (
          <SidebarCard title="Completed" icon={CheckCircle2} iconColor="var(--teal)" linkTo="/portal/tasks" linkLabel="View all">
            {recentlyCompleted.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-0.5">
                <CheckCircle2 size={10} style={{ color: 'var(--teal)', opacity: 0.5, flexShrink: 0 }} />
                <span className="truncate" style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', opacity: 0.6, textDecoration: 'line-through' }}>
                  {t.title || t.description}
                </span>
              </div>
            ))}
          </SidebarCard>
        )}
      </div>
    )
  }

  // ── Plan/capture mode: full landscape ──────────────────
  return (
    <div className="space-y-4">
      {/* This Week */}
      {(weekMilestones.length > 0 || stats.overdue > 0 || staleProjects.length > 0) && (
        <SidebarCard title="This Week" icon={Flag} iconColor="var(--gold)" linkTo="/portal/deadlines" linkLabel="View all">
          {weekMilestones.map((m: any) => (
            <MilestoneRow key={m.id} milestone={m} />
          ))}

          {stats.overdue > 0 && (
            <div className="flex items-center gap-2 py-1">
              <AlertTriangle size={10} style={{ color: 'var(--maroon)', opacity: 0.7, flexShrink: 0 }} />
              <Link to="/portal/tasks" style={{ fontSize: 'var(--label-size)', color: 'var(--maroon)', textDecoration: 'none' }}>
                {stats.overdue} task{stats.overdue !== 1 ? 's' : ''} overdue
              </Link>
            </div>
          )}

          {staleProjects.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <TrendingDown size={10} style={{ color: 'var(--slate)', opacity: 0.5, flexShrink: 0 }} />
              <Link to="/projects" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textDecoration: 'none', opacity: 0.7 }}>
                {staleProjects.length} project{staleProjects.length !== 1 ? 's' : ''} stale
              </Link>
            </div>
          )}

          {deepWorkHours !== null && (
            <div className="flex items-center gap-2 py-1 mt-1" style={{ borderTop: '1px solid rgba(201,168,76,0.06)', paddingTop: 6 }}>
              <Clock size={10} style={{ color: 'var(--teal)', opacity: 0.6, flexShrink: 0 }} />
              <span style={{ fontSize: '10px', color: 'var(--teal)', opacity: 0.7 }}>
                {deepWorkHours}h deep work available
              </span>
            </div>
          )}
        </SidebarCard>
      )}

      {/* Commitments */}
      {openCommitments.length > 0 && (
        <SidebarCard title="Commitments" icon={Users} iconColor="var(--teal)" linkTo="/portal/tasks" linkLabel={`${openCommitments.length} open`}>
          {openCommitments.map((c: any) => (
            <div key={c.id} className="flex items-start gap-2 py-1">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.due_date && c.due_date <= today ? 'var(--maroon)' : 'var(--teal)', opacity: 0.5, flexShrink: 0, marginTop: 4 }} />
              <div className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.3 }}>
                  {c.description || c.commitment}
                </span>
                {c.due_date && (
                  <span style={{ fontSize: '9px', color: c.due_date <= today ? 'var(--maroon)' : 'var(--slate)', opacity: 0.6 }}>
                    Due {c.due_date}
                  </span>
                )}
              </div>
            </div>
          ))}
        </SidebarCard>
      )}

      {/* Calendar */}
      <CalendarTimeline events={events} />
    </div>
  )
}
