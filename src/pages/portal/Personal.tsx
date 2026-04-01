import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckSquare, Clock, FolderKanban, Bell, Calendar, Handshake,
  Activity, ArrowRight, Circle, AlertTriangle, TrendingUp,
  Users, Send, Lightbulb, User, History,
  Eye, EyeOff, FlaskConical, CalendarDays, UserCircle,
} from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import OnboardingChecklist from '../../components/OnboardingChecklist'
import BentoCard from '../../components/dashboard/BentoCard'
import Avatar from '../../components/Avatar'
import { useTasks } from '../../hooks/useApiData'
import { useProjectHealth, useActivity } from '../../hooks/useApiData'
import { useNotifications } from '../../hooks/useNotifications'
import { useCommitments } from '../../hooks/useCommitments'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { useUpdateTaskStatus, useCreateIdea } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, formatRelativeTime } from '../../lib/dateUtils'
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed'
import { useWatchlist } from '../../hooks/useWatchlist'
import type { WatchItem } from '../../hooks/useWatchlist'
import type { TaskRow } from '../../lib/api'

// Try to get current user from CF Access JWT
function getCurrentUser(): string | null {
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const cfCookie = cookies.find((c) => c.startsWith('CF_Authorization='))
    if (cfCookie) {
      const jwt = cfCookie.split('=')[1]
      const payload = JSON.parse(atob(jwt.split('.')[1]))
      if (payload.email) return payload.email.split('@')[0].toLowerCase()
    }
  } catch { /* no auth */ }
  return null
}

// Check if user is PI (Nick or Nate)
function isPI(slug: string | null): boolean {
  return slug === 'nick-ingraham' || slug === 'nate-mesfin'
}

export default function Personal() {
  const { recent } = useRecentlyViewed()
  const watchlist = useWatchlist()
  const currentUser = useMemo(() => getCurrentUser(), [])
  const person = currentUser ? getPersonInfo(currentUser) : null

  const { data: allTasks = [] } = useTasks()
  const { data: healthData } = useProjectHealth()
  const { data: activity = [] } = useActivity(10)
  const { data: notifications = [] } = useNotifications(currentUser || '')
  const { data: commitments = [] } = useCommitments(currentUser || undefined)
  const { data: grants = [] } = useGrantTimeline()
  const updateStatus = useUpdateTaskStatus()

  // Filter tasks for current user (or show all if no auth)
  const myTasks = useMemo(() => {
    if (!currentUser) return allTasks
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser])

  const pendingTasks = myTasks.filter((t) => !t.completed)
  const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent' || t.priority === 'high')
  const overdueTasks = pendingTasks.filter(
    (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  )

  // Tasks assigned by me to others
  const assignedByMe = useMemo(() => {
    if (!currentUser) return []
    return allTasks.filter((t) => t.assigned_by && t.assigned_by.includes(currentUser) && !t.completed)
  }, [allTasks, currentUser])

  // Upcoming deadlines (next 14 days)
  const upcomingDeadlines = useMemo(() => {
    const now = new Date()
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    return pendingTasks
      .filter((t) => t.due_date && new Date(t.due_date + 'T23:59:59') >= now && new Date(t.due_date + 'T00:00:00') <= twoWeeks)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [pendingTasks])

  // Unread notifications
  const unreadNotifications = notifications.filter((n) => !n.read)

  // Pending commitments
  const pendingCommitments = commitments.filter((c) => c.status !== 'completed')

  // Health summary (for PIs)
  const health = healthData?.summary

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-1">
        {person && (
          <div style={{ width: 48, height: 48 }}>
            <Avatar
              name={person.name}
              initials={person.initials}
              photoUrl={person.photoUrl}
              size="sm"
              variant="ice"
              className="!w-12 !h-12 !min-w-0 !min-h-0 !text-sm"
            />
          </div>
        )}
        <SectionHeader
          icon={User}
          title={person ? `${person.name.split(' ')[0]}'s Hub` : 'My Hub'}
          subtitle={overdueTasks.length > 0
            ? `${overdueTasks.length} overdue — your personal command center`
            : pendingTasks.length > 0
              ? `${pendingTasks.length} active task${pendingTasks.length !== 1 ? 's' : ''} — your personal command center`
              : 'All caught up — your personal command center'}
        />
      </div>

      {!currentUser && (
        <div
          className="mt-3 px-4 py-2.5 rounded-lg border text-sm"
          style={{
            fontFamily: 'var(--font-sans)',
            borderColor: 'var(--gold)',
            backgroundColor: 'rgba(201,168,76,0.06)',
            color: 'var(--ink)',
          }}
        >
          Sign in with @umn.edu to see your personalized dashboard.
        </div>
      )}

      {/* Onboarding Checklist */}
      <div className="mt-5">
        <OnboardingChecklist />
      </div>

      {/* Quick Stats Bar */}
      <div className="flex items-center gap-4 mt-5 flex-wrap">
        <QuickStat
          label="Active Tasks"
          value={pendingTasks.length}
          color="var(--teal)"
          icon={CheckSquare}
        />
        {overdueTasks.length > 0 && (
          <QuickStat
            label="Overdue"
            value={overdueTasks.length}
            color="var(--maroon)"
            icon={AlertTriangle}
          />
        )}
        {urgentTasks.length > 0 && (
          <QuickStat
            label="High Priority"
            value={urgentTasks.length}
            color="var(--orange)"
            icon={TrendingUp}
          />
        )}
        {unreadNotifications.length > 0 && (
          <QuickStat
            label="Unread"
            value={unreadNotifications.length}
            color="var(--gold)"
            icon={Bell}
          />
        )}
      </div>

      {/* Recently Viewed */}
      {recent.length > 1 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <History size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
          {recent.slice(0, 5).map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:bg-[rgba(45,138,138,0.06)]"
              style={{
                fontFamily: 'var(--font-sans)',
                color: 'var(--slate)',
                borderColor: 'var(--border-light)',
                textDecoration: 'none',
              }}
            >
              {page.label}
            </Link>
          ))}
        </div>
      )}

      {/* Quick Capture */}
      <QuickCapture />

      {/* Bento Grid */}
      <div className="bento-grid mt-8">
        {/* My Tasks — span 2 */}
        <MyTasksCard tasks={pendingTasks} onStatusChange={(id, s) => updateStatus.mutate({ id, status: s })} />

        {/* Upcoming Deadlines */}
        <DeadlinesCard deadlines={upcomingDeadlines} overdue={overdueTasks} />

        {/* Notifications */}
        <NotificationsCard notifications={unreadNotifications} />

        {/* Assigned by Me (if any) */}
        {assignedByMe.length > 0 && (
          <AssignedByMeCard tasks={assignedByMe} />
        )}

        {/* Commitments */}
        {pendingCommitments.length > 0 && (
          <CommitmentsCard commitments={pendingCommitments} />
        )}

        {/* Recent Activity */}
        <ActivityCard activity={activity} />

        {/* Watching */}
        {watchlist.items.length > 0 && (
          <WatchingCard items={watchlist.items} onUnwatch={watchlist.unwatch} />
        )}

        {/* PI-only cards */}
        {isPI(currentUser) && health && (
          <LabHealthCard health={health} />
        )}
        {isPI(currentUser) && grants.length > 0 && (
          <GrantMiniCard grants={grants} />
        )}
      </div>

      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--density-gap, 1rem);
        }
        .bento-span-2 { grid-column: span 2; }
        .bento-span-1x2 { grid-row: span 2; }
        @media (max-width: 1024px) {
          .bento-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .bento-grid { grid-template-columns: 1fr; }
          .bento-span-2 { grid-column: span 1; }
        }
      `}</style>
    </div>
  )
}

// ── Quick Capture ────────────────────────────────────────────

function QuickCapture() {
  const [value, setValue] = useState('')
  const createIdea = useCreateIdea()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    createIdea.mutate({ title: value.trim() })
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex items-center gap-2">
      <Lightbulb size={16} style={{ color: 'var(--gold)', opacity: 0.6, flexShrink: 0 }} />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Quick capture — type an idea, thought, or note..."
        className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1"
        style={{
          fontFamily: 'var(--font-sans)',
          borderColor: 'var(--border-light)',
          color: 'var(--ink)',
          backgroundColor: 'var(--cream)',
        }}
      />
      {value.trim() && (
        <button
          type="submit"
          className="p-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          <Send size={14} />
        </button>
      )}
    </form>
  )
}

// ── Quick Stat Pill ──────────────────────────────────────────

const quickStatTooltips: Record<string, string> = {
  'Active Tasks': 'Tasks assigned to you that are not yet completed',
  'Overdue': 'Tasks past their due date that still need attention',
  'High Priority': 'Tasks marked as high or urgent priority',
  'Unread': 'Notifications you haven\'t read yet (@mentions, assignments)',
}

function QuickStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof CheckSquare }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-default"
      style={{ borderColor: color + '33', backgroundColor: color + '0a' }}
      title={quickStatTooltips[label] || label}
    >
      <Icon size={13} style={{ color }} />
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color }}>{value}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--slate)', opacity: 0.6 }}>{label}</span>
    </div>
  )
}

// ── My Tasks Card ────────────────────────────────────────────

function MyTasksCard({ tasks, onStatusChange }: { tasks: TaskRow[]; onStatusChange: (id: string, status: string) => void }) {
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...tasks]
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    .slice(0, 6)

  return (
    <BentoCard title="My Tasks" subtitle={`${tasks.length} active`} size="span-2" icon={CheckSquare}>
      <div className="flex flex-col gap-1.5">
        {sorted.map((task) => {
          const isOverdue = task.due_date && new Date(task.due_date + 'T23:59:59') < new Date()
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1.5 px-1 rounded-md transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer"
              onClick={() => onStatusChange(task.id, task.status === 'todo' ? 'in_progress' : 'done')}
            >
              <Circle size={14} style={{ color: task.status === 'in_progress' ? 'var(--teal)' : 'var(--slate)', opacity: 0.5, flexShrink: 0 }} />
              <span className="flex-1 text-sm truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                {task.title || task.description}
              </span>
              {task.priority === 'urgent' || task.priority === 'high' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ fontFamily: 'var(--font-sans)', color: task.priority === 'urgent' ? 'var(--maroon)' : 'var(--orange)', backgroundColor: task.priority === 'urgent' ? 'rgba(122,0,25,0.08)' : 'rgba(194,65,12,0.08)' }}>
                  {task.priority}
                </span>
              ) : null}
              {task.due_date && (
                <span className="text-[10px] flex-shrink-0" style={{ fontFamily: 'var(--font-sans)', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', fontWeight: isOverdue ? 600 : 400, opacity: isOverdue ? 1 : 0.5 }}>
                  {isOverdue ? 'Overdue' : formatShortDate(task.due_date)}
                </span>
              )}
            </div>
          )
        })}
        {tasks.length === 0 && (
          <p className="text-center py-6 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>All caught up</p>
        )}
      </div>
      <Link to="/my-tasks" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        View all tasks <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Deadlines Card ───────────────────────────────────────────

function DeadlinesCard({ deadlines, overdue }: { deadlines: TaskRow[]; overdue: TaskRow[] }) {
  return (
    <BentoCard title="Deadlines" subtitle={`${deadlines.length} upcoming · ${overdue.length} overdue`} icon={Calendar}>
      <div className="flex flex-col gap-1.5">
        {overdue.slice(0, 2).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <AlertTriangle size={12} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
            <span className="flex-1 text-xs truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--maroon)' }}>
              {t.title || t.description}
            </span>
            <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--maroon)', fontWeight: 600 }}>
              {formatShortDate(t.due_date!)}
            </span>
          </div>
        ))}
        {deadlines.slice(0, 4).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <Clock size={12} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.6 }} />
            <span className="flex-1 text-xs truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {t.title || t.description}
            </span>
            <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
              {formatShortDate(t.due_date!)}
            </span>
          </div>
        ))}
        {deadlines.length === 0 && overdue.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>No upcoming deadlines</p>
        )}
      </div>
      <Link to="/deadlines" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        All deadlines <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Notifications Card ───────────────────────────────────────

function NotificationsCard({ notifications }: { notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string }[] }) {
  return (
    <BentoCard title="Notifications" subtitle={`${notifications.length} unread`} icon={Bell}>
      <div className="flex flex-col gap-1.5">
        {notifications.slice(0, 4).map((n) => (
          <div key={n.id} className="py-1">
            <p className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{n.title}</p>
            {n.body && (
              <p className="text-[10px] mt-0.5 truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{n.body}</p>
            )}
            <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
              {formatRelativeTime(n.created_at)}
            </span>
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>All caught up</p>
        )}
      </div>
      <Link to="/my-items" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        View all items <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Assigned By Me Card ──────────────────────────────────────

function AssignedByMeCard({ tasks }: { tasks: TaskRow[] }) {
  return (
    <BentoCard title="Assigned by Me" subtitle={`${tasks.length} pending`} icon={Users}>
      <div className="flex flex-col gap-1.5">
        {tasks.slice(0, 5).map((t) => {
          const person = getPersonInfo(t.assignee)
          return (
            <div key={t.id} className="flex items-center gap-2 py-1">
              <div style={{ width: 18, height: 18 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-[18px] !h-[18px] !min-w-0 !min-h-0 !text-[6px]" />
              </div>
              <span className="flex-1 text-xs truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                {t.title || t.description}
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded" style={{ fontFamily: 'var(--font-sans)', color: t.status === 'in_progress' ? 'var(--teal)' : t.status === 'blocked' ? 'var(--maroon)' : 'var(--slate)', backgroundColor: t.status === 'in_progress' ? 'rgba(45,138,138,0.08)' : t.status === 'blocked' ? 'rgba(122,0,25,0.08)' : 'transparent', opacity: 0.7 }}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
          )
        })}
      </div>
      <Link to="/tasks" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        All tasks <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Commitments Card ─────────────────────────────────────────

function CommitmentsCard({ commitments }: { commitments: { id: string; commitment: string; to_whom: string; due_date: string | null; status: string }[] }) {
  return (
    <BentoCard title="Commitments" subtitle={`${commitments.length} pending`} icon={Handshake}>
      <div className="flex flex-col gap-1.5">
        {commitments.slice(0, 4).map((c) => {
          const isOverdue = c.due_date && new Date(c.due_date + 'T23:59:59') < new Date()
          return (
            <div key={c.id} className="py-1" style={{ borderLeft: isOverdue ? '2px solid var(--maroon)' : '2px solid var(--gold)', paddingLeft: '8px' }}>
              <p className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{c.commitment}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--gold)', opacity: 0.7 }}>to {c.to_whom}</span>
                {c.due_date && (
                  <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', fontWeight: isOverdue ? 600 : 400, opacity: isOverdue ? 1 : 0.5 }}>
                    {isOverdue ? 'Overdue' : formatShortDate(c.due_date)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </BentoCard>
  )
}

// ── Activity Card ────────────────────────────────────────────

function ActivityCard({ activity }: { activity: { id: string; type: string; description: string; actor: string | null; timestamp: string }[] }) {
  return (
    <BentoCard title="Recent Activity" subtitle="Lab-wide" icon={Activity}>
      <div className="flex flex-col gap-1.5">
        {activity.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-start gap-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--teal)', opacity: 0.4 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{a.description}</p>
              <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>
                {formatRelativeTime(a.timestamp)}
              </span>
            </div>
          </div>
        ))}
        {activity.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>No recent activity</p>
        )}
      </div>
    </BentoCard>
  )
}

// ── PI-only: Lab Health Card ─────────────────────────────────

function LabHealthCard({ health }: { health: { total: number; green: number; yellow: number; red: number } }) {
  return (
    <BentoCard title="Lab Health" subtitle={`${health.total} projects`} icon={TrendingUp}>
      <div className="flex items-center gap-4 py-2">
        <HealthDot color="var(--green-light)" label="Healthy" count={health.green} />
        <HealthDot color="var(--gold)" label="Needs Attention" count={health.yellow} />
        <HealthDot color="var(--maroon)" label="Stale" count={health.red} />
      </div>
      <Link to="/projects" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        View projects <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

function HealthDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{count}</span>
        <span className="text-[9px] ml-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>{label}</span>
      </div>
    </div>
  )
}

// ── PI-only: Grant Mini Card ─────────────────────────────────

function GrantMiniCard({ grants }: { grants: { title: string; mechanism: string; pi: string; proposed: number; start_date: string | null; end_date: string | null }[] }) {
  const active = grants.filter((g) => !g.proposed)
  const pending = grants.filter((g) => g.proposed)

  return (
    <BentoCard title="Grants" subtitle={`${active.length} active · ${pending.length} pending`} icon={FolderKanban}>
      <div className="flex flex-col gap-1.5">
        {grants.slice(0, 4).map((g, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: g.proposed ? 'var(--gold)' : 'var(--teal)' }}
            />
            <span className="text-xs font-medium flex-shrink-0" style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)' }}>
              {g.mechanism}
            </span>
            <span className="flex-1 text-xs truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {g.title}
            </span>
          </div>
        ))}
      </div>
      <Link to="/grants" className="flex items-center gap-1 mt-2 pt-2" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        Grant timeline <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Watching Card ───────────────────────────────────────────

function getWatchTypeIcon(type: WatchItem['type']) {
  switch (type) {
    case 'project': return <FlaskConical size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
    case 'task': return <CheckSquare size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
    case 'person': return <UserCircle size={12} style={{ color: 'var(--slate)', flexShrink: 0 }} />
    case 'meeting': return <CalendarDays size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
  }
}

function getWatchItemUrl(item: WatchItem): string {
  switch (item.type) {
    case 'project': return `/projects/${item.slug || item.id}`
    case 'task': return `/my-tasks`
    case 'person': return `/team/${item.slug || item.id}`
    case 'meeting': return `/meetings/${item.id}`
  }
}

function WatchingCard({ items, onUnwatch }: { items: WatchItem[]; onUnwatch: (id: string, type: string) => void }) {
  return (
    <BentoCard title="Watching" subtitle={`${items.length} item${items.length !== 1 ? 's' : ''}`} icon={Eye}>
      <div className="flex flex-col gap-0.5">
        {items.map(item => (
          <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
            {getWatchTypeIcon(item.type)}
            <Link to={getWatchItemUrl(item)} style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', textDecoration: 'none' }}>
              {item.label}
            </Link>
            <button onClick={() => onUnwatch(item.id, item.type)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.3, padding: 2 }}>
              <EyeOff size={12} />
            </button>
          </div>
        ))}
      </div>
    </BentoCard>
  )
}
