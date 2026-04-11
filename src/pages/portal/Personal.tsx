import type { ReactElement } from 'react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckSquare, Clock, FolderKanban, Bell, Calendar, Handshake,
  Activity, ArrowRight, Circle, AlertTriangle, TrendingUp,
  Users, Send, Lightbulb, User, History,
  Eye, EyeOff, FlaskConical, CalendarDays, UserCircle,
  ChevronDown,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import OnboardingChecklist from '../../components/OnboardingChecklist'
import BentoCard from '../../components/dashboard/BentoCard'
import Avatar from '../../components/Avatar'
import { useTasks } from '../../hooks/useApiData'
import { useProjectHealth, useActivity } from '../../hooks/useApiData'
import { useNotifications } from '../../hooks/useNotifications'
import { useCommitments } from '../../hooks/useCommitments'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import { useUpdateTaskStatus, useCreateIdea } from '../../hooks/useMutations'
import { useAuth } from '../../hooks/useAuth'
import { useUserRole } from '../../hooks/useUserRole'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, formatRelativeTime } from '../../lib/dateUtils'
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed'
import { useWatchlist } from '../../hooks/useWatchlist'
import { ROLE_CARD_CONFIGS, ROLE_LABELS } from '../../lib/roleDefaults'
import type { PersonalCardId, UserRole } from '../../lib/roleDefaults'
import type { WatchItem } from '../../hooks/useWatchlist'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import { useUndoToast } from '../../components/UndoToast'
import type { TaskRow } from '../../lib/api'
import { staggerContainer, staggerItem } from '../../lib/animations'

// ── Card ordering per role ──────────────────────────────────

// Defines the render order of cards per role. Cards not in the list are appended at the end.
const ROLE_CARD_ORDER: Record<UserRole, PersonalCardId[]> = {
  pi: [
    'lab-health', 'my-tasks', 'assigned-by-me',
    'activity', 'deadlines',
    'grants', 'commitments', 'notifications', 'watching', 'quick-capture',
  ],
  fellow: [
    'my-tasks', 'deadlines',
    'notifications', 'watching',
    'quick-capture', 'activity',
  ],
  coordinator: [
    'my-tasks', 'deadlines',
    'activity', 'notifications',
    'assigned-by-me', 'commitments', 'watching', 'quick-capture',
  ],
  default: [
    'my-tasks', 'deadlines',
    'notifications', 'assigned-by-me',
    'commitments', 'activity', 'watching', 'lab-health', 'grants', 'quick-capture',
  ],
}

// ── Visibility storage key ──────────────────────────────────

const VISIBLE_CARDS_KEY = 'dashboard-visible-cards'

function getStoredVisibleCards(): Set<PersonalCardId> | null {
  try {
    const stored = localStorage.getItem(VISIBLE_CARDS_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* use defaults */ }
  return null
}

function storeVisibleCards(cards: Set<PersonalCardId>) {
  localStorage.setItem(VISIBLE_CARDS_KEY, JSON.stringify([...cards]))
}

export default function Personal() {
  const { recent } = useRecentlyViewed()
  const watchlist = useWatchlist()
  const { user: authUser, isAuthenticated } = useAuth()
  const currentUser = useMemo(() => {
    if (!authUser.email) return null
    return authUser.email.split('@')[0].toLowerCase()
  }, [authUser.email])
  const person = currentUser ? getPersonInfo(currentUser) : null
  const { role, setRoleOverride, clearRoleOverride, isRoleInitialized, markRoleInitialized } = useUserRole()

  const { data: allTasks = [], isLoading: tasksLoading } = useTasks()
  const { data: healthData } = useProjectHealth()
  const { data: activity = [] } = useActivity(10)
  const { data: notifications = [] } = useNotifications(currentUser || '')
  const { data: commitments = [] } = useCommitments(currentUser || undefined)
  const { data: grants = [] } = useGrantTimeline()
  const updateStatus = useUpdateTaskStatus()
  const { showUndo } = useUndoToast()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)

  // Filter tasks for current user (or show all if no auth)
  const myTasks = useMemo(() => {
    if (!currentUser) return allTasks
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser])

  const pendingTasks = useMemo(() => myTasks.filter((t) => !t.completed), [myTasks])
  const urgentTasks = useMemo(() => pendingTasks.filter((t) => t.priority === 'urgent' || t.priority === 'high'), [pendingTasks])
  const overdueTasks = useMemo(() => pendingTasks.filter(
    (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()
  ), [pendingTasks])

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
  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read), [notifications])

  // Completions this week
  const completedThisWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    return myTasks.filter(t => t.completed && t.completed_at && new Date(t.completed_at) >= weekStart).length
  }, [myTasks])

  // Pending commitments
  const pendingCommitments = useMemo(() => commitments.filter((c) => c.status !== 'completed'), [commitments])

  // Health summary
  const health = healthData?.summary

  // ── Role-based card visibility ──────────────────────────────

  const [visibleCards, setVisibleCards] = useState<Set<PersonalCardId>>(() => {
    const stored = getStoredVisibleCards()
    if (stored) return stored
    return new Set(ROLE_CARD_CONFIGS[role].visible)
  })

  // When role changes and hasn't been initialized yet, apply role defaults
  useEffect(() => {
    if (!isRoleInitialized(role)) {
      const defaults = new Set(ROLE_CARD_CONFIGS[role].visible)
      setVisibleCards(defaults)
      storeVisibleCards(defaults)
      markRoleInitialized(role)
    }
  }, [role, isRoleInitialized, markRoleInitialized])

  const primaryCards = useMemo(() => new Set(ROLE_CARD_CONFIGS[role].primary), [role])
  const cardOrder = useMemo(() => ROLE_CARD_ORDER[role], [role])

  const isCardVisible = (id: PersonalCardId) => visibleCards.has(id)
  const isPrimary = (id: PersonalCardId) => primaryCards.has(id)

  // Build the card render list: each card as { id, render() }
  // This maps card IDs to their rendered components, respecting data availability
  const cardRenderers: Record<PersonalCardId, (() => ReactElement | null) | null> = {
    'my-tasks': () => (
      <MyTasksCard
        tasks={pendingTasks}
        onStatusChange={(id, s) => {
          const task = pendingTasks.find(t => t.id === id)
          const prev = task?.status || 'todo'
          updateStatus.mutate({ id, status: s })
          const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
          showUndo(`Status → ${labels[s] || s}`, () => updateStatus.mutate({ id, status: prev }))
        }}
        onOpenDetail={setSelectedTask}
        large={isPrimary('my-tasks')}
      />
    ),
    'deadlines': () => (
      <DeadlinesCard
        deadlines={upcomingDeadlines}
        overdue={overdueTasks}
        large={isPrimary('deadlines')}
      />
    ),
    'notifications': () => <NotificationsCard notifications={unreadNotifications} />,
    'assigned-by-me': assignedByMe.length > 0 ? () => <AssignedByMeCard tasks={assignedByMe} /> : null,
    'commitments': pendingCommitments.length > 0 ? () => <CommitmentsCard commitments={pendingCommitments} /> : null,
    'activity': () => <ActivityCard activity={activity} />,
    'watching': watchlist.items.length > 0 ? () => <WatchingCard items={watchlist.items} onUnwatch={watchlist.unwatch} /> : null,
    'lab-health': health ? () => <LabHealthCard health={health} /> : null,
    'grants': grants.length > 0 ? () => <GrantMiniCard grants={grants} /> : null,
    'quick-capture': null, // Quick capture is rendered separately above the grid
  }

  // Ordered, visible, renderable cards
  const orderedCards = useMemo(() => {
    return cardOrder
      .filter((id) => isCardVisible(id) && cardRenderers[id] != null)
      .map((id) => ({ id, render: cardRenderers[id]! }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardOrder, visibleCards, pendingTasks, upcomingDeadlines, overdueTasks, unreadNotifications, assignedByMe, pendingCommitments, activity, watchlist.items, health, grants, role])

  // Show role selector when authenticated OR in dev mode
  const showRoleSelector = isAuthenticated || import.meta.env.DEV

  if (tasksLoading) return <CardSkeleton count={4} />

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          icon={<User size={20} />}
          title={person ? `${person.name.split(' ')[0]}'s Hub` : 'My Hub'}
          subtitle={overdueTasks.length > 0
            ? `${overdueTasks.length} overdue · ${completedThisWeek} done this week`
            : pendingTasks.length > 0
              ? `${pendingTasks.length} active · ${completedThisWeek} done this week`
              : 'All caught up'}
        />
        {showRoleSelector && (
          <RoleSelector
            role={role}
            onSelect={(r) => {
              if (r === 'auto') clearRoleOverride()
              else setRoleOverride(r)
            }}
          />
        )}
      </div>

      {!currentUser && (
        <div className="mt-3">
          <EmptyState
            icon={<User size={32} />}
            title="Your hub is ready"
            subtitle={<>
              <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> with @umn.edu to see your tasks, notifications, and watchlist.
            </>}
          />
        </div>
      )}

      {/* Onboarding Checklist */}
      <div className="mt-5">
        <OnboardingChecklist />
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        {([
          { label: 'New Task', to: '/tasks?create=true', icon: CheckSquare, color: 'var(--teal)' },
          { label: 'Submit Idea', to: '/ideas?create=true', icon: Lightbulb, color: 'var(--gold)' },
          { label: 'Ask a Question', to: '/ask?create=true', icon: User, color: 'var(--slate)' },
        ]).map(a => {
          const Icon = a.icon
          return (
            <Link
              key={a.label}
              to={a.to}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border"
              style={{ color: a.color, borderColor: `color-mix(in srgb, ${a.color} 20%, transparent)`, textDecoration: 'none', background: `color-mix(in srgb, ${a.color} 4%, transparent)` }}
            >
              <Icon size={12} />
              {a.label}
            </Link>
          )
        })}
      </div>

      {/* Quick Stats Bar */}
      <motion.div
        className="flex items-center gap-4 mt-5 flex-wrap"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem}>
          <QuickStat
            label="Active Tasks"
            value={pendingTasks.length}
            color="var(--teal)"
            icon={CheckSquare}
          />
        </motion.div>
        {overdueTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <QuickStat
              label="Overdue"
              value={overdueTasks.length}
              color="var(--maroon)"
              icon={AlertTriangle}
            />
          </motion.div>
        )}
        {urgentTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <QuickStat
              label="High Priority"
              value={urgentTasks.length}
              color="var(--orange)"
              icon={TrendingUp}
            />
          </motion.div>
        )}
        {unreadNotifications.length > 0 && (
          <motion.div variants={staggerItem}>
            <QuickStat
              label="Unread"
              value={unreadNotifications.length}
              color="var(--gold)"
              icon={Bell}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Priority distribution mini-bar */}
      {pendingTasks.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.4 }}>Priority</span>
          <div className="flex-1 flex rounded-full overflow-hidden" style={{ height: 4, maxWidth: 200 }}>
            {(['urgent', 'high', 'medium', 'low'] as const).map(p => {
              const count = pendingTasks.filter(t => t.priority === p).length
              if (count === 0) return null
              const colors: Record<string, string> = { urgent: 'var(--maroon)', high: 'var(--orange)', medium: 'var(--gold)', low: 'var(--slate)' }
              return <div key={p} style={{ width: `${(count / pendingTasks.length) * 100}%`, background: colors[p], opacity: p === 'low' ? 0.3 : 0.7 }} />
            })}
          </div>
        </div>
      )}

      {/* Recently Viewed */}
      {recent.length > 1 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <History size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
          {recent.slice(0, 5).map((page) => (
            <Link
              key={page.path}
              to={page.path}
              className="text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:bg-[var(--teal-hover)]"
              style={{
                color: 'var(--slate)',
                borderColor: 'var(--border-subtle)',
                textDecoration: 'none',
              }}
            >
              {page.label}
            </Link>
          ))}
        </div>
      )}

      {/* Quick Capture */}
      {isCardVisible('quick-capture') && <QuickCapture />}

      {/* Bento Grid — role-ordered */}
      <motion.div
        className="bento-grid mt-8"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {orderedCards.map(({ id, render }) => (
          <motion.div
            key={id}
            variants={staggerItem}
            className={isPrimary(id) ? 'bento-span-2' : undefined}
          >
            {render()}
          </motion.div>
        ))}
      </motion.div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

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

// ── Role Selector ──────────────────────────────────────────

const roleOptions: { value: UserRole | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'pi', label: 'PI View' },
  { value: 'fellow', label: 'Fellow View' },
  { value: 'coordinator', label: 'Coordinator View' },
  { value: 'default', label: 'Default' },
]

function RoleSelector({ role, onSelect }: { role: UserRole; onSelect: (role: UserRole | 'auto') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, marginTop: 'var(--sp-xs)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-xs)',
          padding: 'var(--sp-xs) var(--sp-sm)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: 'var(--label-size)',
          fontWeight: 400,
          color: 'var(--slate)',
          transition: 'border-color 150ms ease, color 150ms ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        <span style={{ color: 'var(--teal)', fontSize: 'var(--label-size)' }}>{ROLE_LABELS[role]}</span>
        <ChevronDown size={10} style={{ opacity: 'var(--ink-label)' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 'var(--sp-xs)',
            minWidth: 140,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--cream)',
            boxShadow: 'var(--shadow-card)',
            zIndex: 'var(--z-dropdown)',
            overflow: 'hidden',
          }}
        >
          {roleOptions.map((opt) => {
            const isActive = opt.value === role || (opt.value === 'auto' && role === 'default')
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  border: 'none',
                  background: isActive ? 'var(--teal-hover)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--label-size)',
                  fontWeight: 400,
                  color: isActive ? 'var(--teal)' : 'var(--slate)',
                  textAlign: 'left',
                  transition: 'background 150ms ease, color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--teal-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Quick Capture ────────────────────────────────────────────

function QuickCapture() {
  const [value, setValue] = useState('')
  const createIdea = useCreateIdea()
  const { showSuccess } = useUndoToast()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    createIdea.mutate({ title: value.trim() }, {
      onSuccess: () => showSuccess('Idea captured'),
    })
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
          borderColor: 'var(--border-subtle)',
          color: 'var(--ink)',
          backgroundColor: 'var(--cream)',
        }}
      />
      {value.trim() && (
        <button
          type="submit"
          className="p-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--teal)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer' }}
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
      <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6 }}>{label}</span>
    </div>
  )
}

// ── My Tasks Card ────────────────────────────────────────────

function MyTasksCard({ tasks, onStatusChange, onOpenDetail, large }: { tasks: TaskRow[]; onStatusChange: (id: string, status: string) => void; onOpenDetail?: (task: TaskRow) => void; large?: boolean }) {
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...tasks]
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
    .slice(0, large ? 8 : 6)

  return (
    <BentoCard title="My Tasks" subtitle={`${tasks.length} active`} size={large ? 'span-2' : 'span-1'} icon={CheckSquare} badge="TASKS">
      <div className="flex flex-col gap-1.5">
        {sorted.map((task) => {
          const isOverdue = task.due_date && new Date(task.due_date + 'T23:59:59') < new Date()
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1.5 px-1 rounded-md transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer"
              onClick={() => onOpenDetail?.(task)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, task.status === 'todo' ? 'in_progress' : 'done') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
                title="Cycle status"
              >
                <Circle size={14} style={{ color: task.status === 'in_progress' ? 'var(--teal)' : 'var(--slate)', opacity: 'var(--ink-label)' }} />
              </button>
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--ink)' }}>
                {task.title || task.description}
              </span>
              {task.priority === 'urgent' || task.priority === 'high' ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: task.priority === 'urgent' ? 'var(--maroon)' : 'var(--orange)', backgroundColor: task.priority === 'urgent' ? 'var(--maroon-hover)' : 'var(--orange-hover)' }}>
                  {task.priority}
                </span>
              ) : null}
              {task.due_date && (
                <span className="text-[10px] flex-shrink-0" style={{ color: isOverdue ? 'var(--maroon)' : 'var(--slate)', fontWeight: isOverdue ? 600 : 400, opacity: isOverdue ? 1 : 0.5 }}>
                  {isOverdue ? 'Overdue' : formatShortDate(task.due_date)}
                </span>
              )}
            </div>
          )
        })}
        {tasks.length === 0 && (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>All caught up</p>
        )}
      </div>
      <Link to="/my-tasks" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        View all tasks <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Deadlines Card ───────────────────────────────────────────

function DeadlinesCard({ deadlines, overdue, large }: { deadlines: TaskRow[]; overdue: TaskRow[]; large?: boolean }) {
  return (
    <BentoCard title="Deadlines" subtitle={`${deadlines.length} upcoming · ${overdue.length} overdue`} size={large ? 'span-2' : 'span-1'} icon={Calendar} badge="UPCOMING">
      <div className="flex flex-col gap-1.5">
        {overdue.slice(0, 2).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <AlertTriangle size={12} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--maroon)' }}>
              {t.title || t.description}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--maroon)', fontWeight: 600 }}>
              {formatShortDate(t.due_date!)}
            </span>
          </div>
        ))}
        {deadlines.slice(0, large ? 6 : 4).map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1">
            <Clock size={12} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.6 }} />
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--ink)' }}>
              {t.title || t.description}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {formatShortDate(t.due_date!)}
            </span>
          </div>
        ))}
        {deadlines.length === 0 && overdue.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No upcoming deadlines</p>
        )}
      </div>
      <Link to="/deadlines" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        All deadlines <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Notifications Card ───────────────────────────────────────

function NotificationsCard({ notifications }: { notifications: { id: string; title: string; body: string | null; link: string | null; created_at: string }[] }) {
  return (
    <BentoCard title="Notifications" subtitle={`${notifications.length} unread`} icon={Bell} badge="ALERTS">
      <div className="flex flex-col gap-1.5">
        {notifications.slice(0, 4).map((n) => (
          <div key={n.id} className="py-1">
            <p className="text-xs" style={{ color: 'var(--ink)' }}>{n.title}</p>
            {n.body && (
              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--slate)', opacity: 0.6 }}>{n.body}</p>
            )}
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
              {formatRelativeTime(n.created_at)}
            </span>
          </div>
        ))}
        {notifications.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>All caught up</p>
        )}
      </div>
      <Link to="/my-items" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        View all items <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Assigned By Me Card ──────────────────────────────────────

function AssignedByMeCard({ tasks }: { tasks: TaskRow[] }) {
  return (
    <BentoCard title="Assigned by Me" subtitle={`${tasks.length} pending`} icon={Users} badge="DELEGATED">
      <div className="flex flex-col gap-1.5">
        {tasks.slice(0, 5).map((t) => {
          const person = getPersonInfo(t.assignee)
          return (
            <div key={t.id} className="flex items-center gap-2 py-1">
              <div style={{ width: 18, height: 18 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm-icon" variant="ice" />
              </div>
              <span className="flex-1 text-xs truncate" style={{ color: 'var(--ink)' }}>
                {t.title || t.description}
              </span>
              <span className="text-[10px] px-1 py-0.5 rounded" style={{ color: t.status === 'in_progress' ? 'var(--teal)' : t.status === 'blocked' ? 'var(--maroon)' : 'var(--slate)', backgroundColor: t.status === 'in_progress' ? 'var(--teal-active)' : t.status === 'blocked' ? 'var(--maroon-hover)' : 'transparent', opacity: 0.7 }}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
          )
        })}
      </div>
      <Link to="/tasks" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
        All tasks <ArrowRight size={11} />
      </Link>
    </BentoCard>
  )
}

// ── Commitments Card ─────────────────────────────────────────

function CommitmentsCard({ commitments }: { commitments: { id: string; commitment: string; to_whom: string; due_date: string | null; status: string }[] }) {
  return (
    <BentoCard title="Commitments" subtitle={`${commitments.length} pending`} icon={Handshake} badge="PROMISES">
      <div className="flex flex-col gap-1.5">
        {commitments.slice(0, 4).map((c) => {
          const isOverdue = c.due_date && new Date(c.due_date + 'T23:59:59') < new Date()
          return (
            <div key={c.id} className="py-1" style={{ borderLeft: isOverdue ? '2px solid var(--maroon)' : '2px solid var(--gold)', paddingLeft: '8px' }}>
              <p className="text-xs" style={{ color: 'var(--ink)' }}>{c.commitment}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px]" style={{ color: 'var(--gold)', opacity: 0.7 }}>to {c.to_whom}</span>
                {c.due_date && (
                  <span className="text-[10px]" style={{ color: isOverdue ? 'var(--maroon)' : 'var(--slate)', fontWeight: isOverdue ? 600 : 400, opacity: isOverdue ? 1 : 0.5 }}>
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
    <BentoCard title="Recent Activity" subtitle="Lab-wide" icon={Activity} badge="ACTIVITY">
      <div className="flex flex-col gap-1.5">
        {activity.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-start gap-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--teal)', opacity: 0.4 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ color: 'var(--ink)' }}>{a.description}</p>
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                {formatRelativeTime(a.timestamp)}
              </span>
            </div>
          </div>
        ))}
        {activity.length === 0 && (
          <p className="text-center py-4 text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No recent activity</p>
        )}
      </div>
    </BentoCard>
  )
}

// ── PI-only: Lab Health Card ─────────────────────────────────

function LabHealthCard({ health }: { health: { total: number; healthy: number; needs_attention: number; at_risk: number; critical: number; avg_score: number } }) {
  return (
    <BentoCard title="Lab Health" subtitle={`${health.total} projects`} icon={TrendingUp} badge="HEALTH">
      <div className="flex items-center gap-4 py-2">
        <HealthDot color="var(--green)" label="Healthy" count={health.healthy} />
        <HealthDot color="var(--gold)" label="Attention" count={health.needs_attention} />
        <HealthDot color="var(--orange)" label="At Risk" count={health.at_risk} />
        <HealthDot color="var(--maroon)" label="Critical" count={health.critical} />
      </div>
      <Link to="/projects" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
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
        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{count}</span>
        <span className="text-[10px] ml-1" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{label}</span>
      </div>
    </div>
  )
}

// ── PI-only: Grant Mini Card ─────────────────────────────────

function GrantMiniCard({ grants }: { grants: { title: string; mechanism: string; pi: string; proposed: number; start_date: string | null; end_date: string | null }[] }) {
  const active = grants.filter((g) => !g.proposed)
  const pending = grants.filter((g) => g.proposed)

  return (
    <BentoCard title="Grants" subtitle={`${active.length} active · ${pending.length} pending`} icon={FolderKanban} badge="GRANTS">
      <div className="flex flex-col gap-1.5">
        {grants.slice(0, 4).map((g, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: g.proposed ? 'var(--gold)' : 'var(--teal)' }}
            />
            <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--teal)' }}>
              {g.mechanism}
            </span>
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--ink)' }}>
              {g.title}
            </span>
          </div>
        ))}
      </div>
      <Link to="/grants" className="flex items-center gap-1 mt-2 pt-2" style={{ fontSize: 'var(--label-size)', color: 'var(--gold)', textDecoration: 'none', borderTop: '1px solid rgba(201,168,76,0.1)' }}>
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
    <BentoCard title="Watching" subtitle={`${items.length} item${items.length !== 1 ? 's' : ''}`} icon={Eye} badge="WATCHING">
      <div className="flex flex-col gap-0.5">
        {items.map(item => (
          <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
            {getWatchTypeIcon(item.type)}
            <Link to={getWatchItemUrl(item)} style={{ flex: 1, fontSize: 'var(--value-size)', color: 'var(--ink)', textDecoration: 'none' }}>
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
