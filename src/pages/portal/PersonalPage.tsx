import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SquareCheck, Clock, Calendar,
  Activity, ArrowRight, AlertTriangle, TrendingUp,
  Lightbulb, User, History,
  ChevronDown,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import OnboardingChecklist from '../../components/OnboardingChecklist'
import { useOnboarding } from '../../hooks/useOnboarding'
import { useTasks, useActivity, useExpiringRegulatory } from '../../hooks/useApiData'
import { useProjects } from '../../hooks/useApiData'
import { useUpdateTaskStatus, useUpdateTask } from '../../hooks/useMutations'
import { openGlobalQuickAdd } from '../../components/GlobalQuickAddModal'
import { useTaskKeyboardShortcuts } from '../../hooks/useTaskKeyboardShortcuts'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { useUserRole } from '../../hooks/useUserRole'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, formatRelativeTime, isOverdue } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import { isProductionVisible, isProductionVisibleActivity } from '../../lib/isProductionVisible'
import TaskTitle from '../../components/tasks/TaskTitle'
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed'
import { ROLE_LABELS } from '../../lib/roleDefaults'
import type { UserRole } from '../../lib/roleDefaults'
import { PATHS } from '../../constants/paths'
import TaskDetailPanel from '../../components/tasks/TaskDetailPanel'
import { TaskRow as SharedTaskRow } from '../../components/tasks/TaskRow'
import { isTaskDone } from '../../lib/taskGrouping'
import { useDensity } from '../../components/DensityToggle'
import { useUndoToast } from '../../components/UndoToast'
import type { TaskRow } from '../../lib/api'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { ICON_PROPS } from '../../lib/iconProps'

// ── Onboarding completion check ─────────────────────────────
function isOnboardingDismissed(): boolean {
  try {
    const raw = localStorage.getItem('mnccore-onboarding-v1')
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return parsed.dismissed === true || parsed.allComplete === true
  } catch {
    return false
  }
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
        className="hov-border"
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
          '--hov-border': open ? 'transparent' : 'var(--border-subtle)',
        } as React.CSSProperties}
      >
        <span style={{ color: 'var(--teal)', fontSize: 'var(--label-size)' }}>{ROLE_LABELS[role]}</span>
        <ChevronDown {...ICON_PROPS} size={10} style={{ opacity: 0.85 }} />
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
            zIndex: 'var(--z-dropdown)' as any,
            overflow: 'hidden',
          }}
        >
          {roleOptions.map((opt) => {
            const isActive = opt.value === role || (opt.value === 'auto' && role === 'default')
            return (
              <button
                key={opt.value}
                onClick={() => { onSelect(opt.value); setOpen(false) }}
                className="hov-bg"
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
                  '--hov-bg': isActive ? 'transparent' : 'var(--teal-hover)',
                } as React.CSSProperties}
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
// P2-10: Personal's capture is no longer a separate idea-input with its own
// submit path. Per Decision #5 the quick-add modal is the single canonical
// capture, so this is a trigger that opens that one modal (one component, one
// submit path, one optimistic toast). The documented shortcut is `q` (S11).

function QuickCapture() {
  return (
    <button
      type="button"
      onClick={openGlobalQuickAdd}
      aria-label="Quick add task (press q)"
      className="flex items-center gap-2 w-full text-left rounded-lg border px-3 py-1.5 transition-colors hov-border"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--cream)',
        cursor: 'pointer',
        '--hov-border': 'var(--teal)',
      } as React.CSSProperties}
    >
      <Lightbulb {...ICON_PROPS} size={14} style={{ color: 'var(--gold)', opacity: 0.85, flexShrink: 0 }} />
      <span
        className="flex-1 text-xs"
        style={{ color: 'var(--slate)', opacity: 0.85, fontSize: 'var(--text-label)' }}
      >
        Quick capture — task, idea, thought…
      </span>
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.75 }}>
        q
      </span>
    </button>
  )
}

// ── Task urgency grouping helpers ────────────────────────────

type UrgencyGroup = 'overdue' | 'today' | 'this-week' | 'later'

function getUrgencyGroup(task: TaskRow): UrgencyGroup {
  if (!task.due_date) return 'later'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(task.due_date + 'T00:00:00')
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
  const endOfWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (due < today) return 'overdue'
  if (due <= endOfToday) return 'today'
  if (due <= endOfWeek) return 'this-week'
  return 'later'
}

const URGENCY_LABELS: Record<UrgencyGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  'this-week': 'This Week',
  later: 'Later',
}

const URGENCY_ORDER: UrgencyGroup[] = ['overdue', 'today', 'this-week', 'later']

// ── My Tasks Left Column ─────────────────────────────────────

function MyTasksColumn({
  tasks,
  overdueTasks,
  onStatusChange,
  onOpenDetail,
}: {
  tasks: TaskRow[]
  overdueTasks: TaskRow[]
  onStatusChange: (id: string, status: string) => void
  onOpenDetail: (task: TaskRow) => void
}) {
  const MAX_TASKS = 18

  // Group by urgency
  const grouped = useMemo(() => {
    const limited = tasks.slice(0, MAX_TASKS)
    const groups: Record<UrgencyGroup, TaskRow[]> = {
      overdue: [],
      today: [],
      'this-week': [],
      later: [],
    }
    for (const task of limited) {
      groups[getUrgencyGroup(task)].push(task)
    }
    return groups
  }, [tasks])

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: 'var(--cream)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SquareCheck {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />
          <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-heading)' as any, color: 'var(--ink)' }}>
            My Tasks
          </span>
          {overdueTasks.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{ color: 'var(--maroon)', backgroundColor: 'var(--maroon-hover)' }}
            >
              {overdueTasks.length} overdue
            </span>
          )}
        </div>
        <Link
          to={PATHS.myTasks}
          className="flex items-center gap-1 portal-footer-link"
          style={{ fontSize: 'var(--text-label)', color: 'var(--gold)', textDecoration: 'none' }}
        >
          View all <ArrowRight {...ICON_PROPS} size={11} />
        </Link>
      </div>

      {tasks.length === 0 && (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--slate)', opacity: 0.75 }}>
          All caught up
        </p>
      )}

      {/* Groups */}
      {URGENCY_ORDER.map((group) => {
        const groupTasks = grouped[group]
        if (groupTasks.length === 0) return null
        return (
          <div key={group} className="mb-3">
            {/* Group label */}
            <div className="flex items-center gap-2 mb-1">
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em',
                  color: group === 'overdue' ? 'var(--maroon)' : 'var(--slate)',
                  opacity: group === 'overdue' ? 1 : 0.85,
                }}
              >
                {URGENCY_LABELS[group]}
              </span>
              <div style={{ flex: 1, height: 1, background: group === 'overdue' ? 'var(--maroon-solid)' : 'var(--border-subtle)', opacity: group === 'overdue' ? 0.2 : 1 }} />
            </div>

            {/* Task rows */}
            <div className="flex flex-col">
              {groupTasks.map((task) => (
                <HubTaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </div>
          </div>
        )
      })}

      {tasks.length > MAX_TASKS && (
        <Link
          to={PATHS.myTasks}
          className="flex items-center gap-1 pt-2 mt-1 portal-footer-link"
          style={{
            fontSize: 'var(--text-label)',
            color: 'var(--slate)',
            textDecoration: 'none',
            borderTop: '1px solid var(--border-subtle)',
            opacity: 0.85,
          }}
        >
          +{tasks.length - MAX_TASKS} more tasks <ArrowRight {...ICON_PROPS} size={10} />
        </Link>
      )}
    </div>
  )
}

// ── Single Task Row ──────────────────────────────────────────
// Now a thin adapter over the shared src/components/tasks/TaskRow.tsx. My Hub's
// status-circle becomes the canonical Done square (handoff §1 — "the only
// change here: the status circle becomes the same Done checkbox used
// everywhere"). Body click still opens the full TaskDetailPanel (My Hub has no
// inline expand), so the shared row's caret is hidden and the click routes to
// onOpenDetail. in-progress is now conveyed by the shared teal reserved dot.

function HubTaskRow({
  task,
  onStatusChange,
  onOpenDetail,
}: {
  task: TaskRow
  onStatusChange: (id: string, status: string) => void
  onOpenDetail: (task: TaskRow) => void
}) {
  const isDone = isTaskDone(task)
  const [density] = useDensity()
  return (
    <SharedTaskRow
      task={task}
      project={null}
      dense={density === 'compact'}
      hideCaret
      isDone={isDone}
      onToggleDone={() => onStatusChange(task.id, isDone ? 'todo' : 'done')}
      isExpanded={false}
      onToggleExpand={() => onOpenDetail(task)}
    />
  )
}

// ── Compact card wrapper ─────────────────────────────────────

function CompactCard({
  title,
  icon: Icon,
  iconColor = 'var(--teal)',
  viewAllTo,
  viewAllLabel = 'View all',
  children,
}: {
  title: string
  icon: typeof SquareCheck
  iconColor?: string
  viewAllTo?: string
  viewAllLabel?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-lg)',
        background: 'var(--cream)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon {...ICON_PROPS} size={13} style={{ color: iconColor }} />
          <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-heading)' as any, color: 'var(--ink)' }}>
            {title}
          </span>
        </div>
        {viewAllTo && (
          <Link
            to={viewAllTo}
            className="flex items-center gap-1 portal-footer-link"
            style={{ fontSize: 'var(--text-label)', color: 'var(--gold)', textDecoration: 'none' }}
          >
            {viewAllLabel} <ArrowRight {...ICON_PROPS} size={10} />
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Upcoming Card ────────────────────────────────────────────

function UpcomingCard({ deadlines, overdue }: { deadlines: TaskRow[]; overdue: TaskRow[] }) {
  const items = [
    ...overdue.slice(0, 2).map((t) => ({ ...t, _isOverdue: true })),
    ...deadlines.slice(0, 5),
  ].slice(0, 5)

  return (
    <CompactCard title="Upcoming" icon={Calendar} viewAllTo={PATHS.deadlines} viewAllLabel="All deadlines">
      {items.length === 0 ? (
        <p style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', opacity: 0.75, textAlign: 'center', padding: '12px 0' }}>
          No upcoming deadlines
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const isOverdue = '_isOverdue' in item && (item as any)._isOverdue
            return (
              <div key={item.id} className="flex items-center gap-2" style={{ minHeight: 28 }}>
                {isOverdue
                  ? <AlertTriangle {...ICON_PROPS} size={11} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
                  : <Clock {...ICON_PROPS} size={11} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.85 }} />
                }
                <span
                  className="flex-1 truncate"
                  style={{ fontSize: 'var(--text-label)', color: isOverdue ? 'var(--maroon)' : 'var(--ink)' }}
                >
                  <TaskTitle title={item.title as string | null} fallback={item.description} showChip={false} />
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                    fontWeight: isOverdue ? 600 : 400,
                    opacity: isOverdue ? 1 : 0.85,
                    flexShrink: 0,
                  }}
                >
                  {item.due_date ? formatShortDate(item.due_date) : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </CompactCard>
  )
}

// ── Recent Activity Card ─────────────────────────────────────

function RecentActivityCard({ activity }: { activity: { id: string; type: string; description: string; actor: string | null; timestamp: string }[] }) {
  return (
    <CompactCard title="Recent Activity" icon={Activity} iconColor="var(--gold)">
      {activity.length === 0 ? (
        <p style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', opacity: 0.75, textAlign: 'center', padding: '12px 0' }}>
          No recent activity
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {activity.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-start gap-2" style={{ minHeight: 28 }}>
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--teal)', opacity: 0.85, marginTop: 4 }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="truncate"
                  style={{ fontSize: 'var(--text-label)', color: 'var(--ink)', lineHeight: 1.4 }}
                >
                  {a.description}
                </p>
                <span style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.75 }}>
                  {formatRelativeTime(a.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CompactCard>
  )
}

// ── Quick Stats Card ─────────────────────────────────────────

function QuickStatsCard({
  completedThisWeek,
  overdueCount,
  projectsCount,
  pendingCount,
}: {
  completedThisWeek: number
  overdueCount: number
  projectsCount: number
  pendingCount: number
}) {
  const stats = [
    { label: 'Done this week', value: completedThisWeek, color: 'var(--teal)' },
    { label: 'Active tasks', value: pendingCount, color: 'var(--slate)' },
    { label: 'Overdue', value: overdueCount, color: overdueCount > 0 ? 'var(--maroon)' : 'var(--slate)' },
    { label: 'Projects', value: projectsCount, color: 'var(--gold)' },
  ]

  return (
    <CompactCard title="Quick Stats" icon={TrendingUp} iconColor="var(--slate)">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              background: `color-mix(in srgb, ${stat.color} 6%, transparent)`,
              border: `1px solid color-mix(in srgb, ${stat.color} 15%, transparent)`,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--slate)', opacity: 0.75, marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </CompactCard>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function PersonalPage() {
  const { recent } = useRecentlyViewed()
  const { user: authUser, isAuthenticated } = useAuth()
  const currentUser = useMemo(() => {
    if (!authUser.email) return null
    return emailToSlug(authUser.email)
  }, [authUser.email])
  const person = currentUser ? getPersonInfo(currentUser) : null
  const { role, setRoleOverride, clearRoleOverride } = useUserRole()

  const { data: allTasks = [], isLoading: tasksLoading } = useTasks()
  const { data: rawActivity = [] } = useActivity(10)
  const activity = useMemo(
    () => rawActivity.filter((a) => isProductionVisibleActivity({ description: a.description })),
    [rawActivity],
  )
  const { data: projects = [] } = useProjects()
  // M-25: Regulatory alerts -- visible at top of Personal, not buried
  const { data: rawRegulatory = [] } = useExpiringRegulatory(60)
  const expiringRegulatory = useMemo(
    () => rawRegulatory.filter((r: any) => isProductionVisible(r.title)),
    [rawRegulatory],
  )

  const updateStatus = useUpdateTaskStatus()
  const updateTask = useUpdateTask()
  const { showUndo } = useUndoToast()
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)

  // Onboarding dismissed state (re-check on mount)
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => isOnboardingDismissed())
  // Onboarding section collapsed by default — expanded only on explicit user action
  const [onboardingExpanded, setOnboardingExpanded] = useState(false)

  // T-32 onboarding pinned card: show when progress < 80 AND day < 30 AND not dismissed
  const onboarding = useOnboarding()
  const shouldPinOnboarding = !onboarding.dismissed && onboarding.progress < 80 && onboarding.currentDay < 30

  useEffect(() => {
    // Re-check after mount in case localStorage wasn't ready
    setOnboardingDismissed(isOnboardingDismissed())
  }, [])

  // ── Derived data ────────────────────────────────────────────

  const myTasks = useMemo(() => {
    if (!currentUser) return allTasks
    return allTasks.filter((t) => t.assignee === currentUser)
  }, [allTasks, currentUser])

  const pendingTasks = useMemo(() => myTasks.filter((t) => !t.completed), [myTasks])

  const overdueTasks = useMemo(
    () => pendingTasks.filter((t) => isOverdue(t.due_date)),
    [pendingTasks]
  )

  // T-31 Today hero — mirrors MyTasks TodayHero pattern so Personal's
  // first-glance is operational, not editorial.
  const todayHeroLists = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const overdue = pendingTasks.filter(t => isOverdue(t.due_date))
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    const dueToday = pendingTasks.filter(t => t.due_date
      && new Date(t.due_date + 'T12:00:00') >= today
      && new Date(t.due_date + 'T12:00:00') < tomorrow)
    return { overdue, dueToday }
  }, [pendingTasks])

  // Upcoming deadlines (next 14 days)
  const upcomingDeadlines = useMemo(() => {
    const now = new Date()
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    return pendingTasks
      .filter((t) => t.due_date && new Date(t.due_date + 'T23:59:59') >= now && new Date(t.due_date + 'T00:00:00') <= twoWeeks)
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [pendingTasks])

  // Completions this week
  const completedThisWeek = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    return myTasks.filter((t) => t.completed && t.completed_at && parseDbUtc(t.completed_at) >= weekStart).length
  }, [myTasks])

  // Sort pending tasks: overdue first, then by due_date, then by priority
  const sortedPendingTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    return [...pendingTasks].sort((a, b) => {
      const aGroup = getUrgencyGroup(a)
      const bGroup = getUrgencyGroup(b)
      const groupOrder: UrgencyGroup[] = ['overdue', 'today', 'this-week', 'later']
      const gDiff = groupOrder.indexOf(aGroup) - groupOrder.indexOf(bGroup)
      if (gDiff !== 0) return gDiff
      // Within group: sort by priority then due_date
      const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
      if (pDiff !== 0) return pDiff
      return (a.due_date || 'zzz').localeCompare(b.due_date || 'zzz')
    })
  }, [pendingTasks])

  const showRoleSelector = isAuthenticated || import.meta.env.DEV

  const handleStatusChange = useCallback((id: string, status: string) => {
    const task = pendingTasks.find((t) => t.id === id)
    const prev = task?.status || 'todo'
    updateStatus.mutate({ id, status })
    const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
    showUndo(`Status → ${labels[status] || status}`, () => updateStatus.mutate({ id, status: prev }))
  }, [pendingTasks, updateStatus, showUndo])

  // ── Keyboard shortcut state (C-02) ────────────────────────────
  const [focusedTaskIndex, setFocusedTaskIndex] = useState(-1)

  // Focused task derived from index into sortedPendingTasks (flat list)
  const focusedTask = useMemo(() => {
    if (focusedTaskIndex < 0 || focusedTaskIndex >= sortedPendingTasks.length) return null
    return sortedPendingTasks[focusedTaskIndex]
  }, [focusedTaskIndex, sortedPendingTasks])

  const STATUS_CYCLE: Record<string, string> = { todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'todo', waiting_external: 'todo' }

  const cycleStatus = useCallback(() => {
    if (!focusedTask) return
    const next = STATUS_CYCLE[focusedTask.status] ?? 'in_progress'
    handleStatusChange(focusedTask.id, next)
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelectFocused = useCallback(() => {
    // Personal page has no bulk selection UI — no-op to satisfy hook interface
  }, [])

  const openDetailForFocused = useCallback(() => {
    if (focusedTask) setSelectedTask(focusedTask)
  }, [focusedTask])

  const closeOverlay = useCallback(() => {
    setSelectedTask(null)
  }, [])

  const snoozeFocused = useCallback(() => {
    if (!focusedTask || !focusedTask.due_date) return
    const d = new Date(focusedTask.due_date + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    updateTask.mutate({ id: focusedTask.id, fields: { due_date: newDate } })
    showUndo(`Snoozed to ${newDate}`, () => updateTask.mutate({ id: focusedTask.id, fields: { due_date: focusedTask.due_date } }))
  }, [focusedTask]) // eslint-disable-line react-hooks/exhaustive-deps

  const assignFocused = useCallback(() => {
    const row = document.querySelector('.task-row-focused .inline-assignee-btn')
    if (row) (row as HTMLButtonElement).click()
  }, [])

  // Only activate shortcuts when tasks are visible (currentUser set, list non-empty)
  useTaskKeyboardShortcuts({
    taskCount: currentUser ? sortedPendingTasks.length : 0,
    focusedIndex: focusedTaskIndex,
    setFocusedIndex: setFocusedTaskIndex,
    peekOpen: false,
    togglePeek: openDetailForFocused,
    openDetail: openDetailForFocused,
    cycleStatus,
    toggleSelect: toggleSelectFocused,
    isBlocked: !!selectedTask,
    closeOverlay,
    snoozeFocused,
    assignFocused,
  })

  if (tasksLoading) return <CardSkeleton count={4} />

  return (
    // P1-1 (Nick 2026-06-10): My Hub shares the universal anchored band + left
    // edge. Wrapping in .content-container lands the primary column's left edge
    // at the same pixel as the data pages (Projects/Manuscripts/Grants) and the
    // other operating surfaces (Today / My Tasks / Calendar). No page-wide tint
    // — cards keep their own --surface-* surfaces.
    <div className="content-container">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          icon={<User {...ICON_PROPS} size={20} />}
          title={person ? `${person.name.split(' ')[0]}'s Hub` : 'My Hub'}
          subtitle={
            overdueTasks.length > 0
              ? `${overdueTasks.length} overdue · ${completedThisWeek} done this week`
              : pendingTasks.length > 0
              ? `${pendingTasks.length} active · ${completedThisWeek} done this week`
              : 'All caught up'
          }
        />
        {/* T-32 pinned onboarding progress (first 30d, <80% done) */}
        {shouldPinOnboarding && (
          <button
            type="button"
            onClick={() => {
              setOnboardingExpanded(true)
              document.getElementById('onboarding-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
            style={{
              background: 'var(--teal-hover)', color: 'var(--teal)',
              border: '1px solid rgba(45,138,138,0.3)', cursor: 'pointer',
            }}
            title="Jump to onboarding checklist"
          >
            <span style={{ fontWeight: 600 }}>{onboarding.completedCount}/{onboarding.totalSteps}</span>
            <span style={{ opacity: 0.75 }}>· {onboarding.currentDay}d in</span>
          </button>
        )}
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

      {/* Unauthenticated: compact sign-in banner (H-04 -- replaced EmptyState that took 280px+) */}
      {!currentUser && (
        <div
          className="flex items-center gap-3 mt-3 px-4 rounded-lg"
          style={{
            height: 44,
            background: 'var(--teal-hover)',
            border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)',
          }}
        >
          <User {...ICON_PROPS} size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-label)', color: 'var(--ink)', flex: 1 }}>
            Sign in with @umn.edu to see your tasks, notifications, and watchlist.
          </span>
          <a
            href="/api/auth/login"
            style={{
              fontSize: 'var(--text-label)',
              fontWeight: 500,
              color: 'var(--teal)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Sign in &rarr;
          </a>
        </div>
      )}

      {/* T-31 TodayHero — operational first-glance, matches MyTasks pattern */}
      {currentUser && (todayHeroLists.overdue.length > 0 || todayHeroLists.dueToday.length > 0) && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ color: '#fff', background: 'var(--maroon-solid)' }}>
                OVERDUE
              </span>
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                {todayHeroLists.overdue.length}
              </span>
            </div>
            {todayHeroLists.overdue.length === 0 ? (
              <p className="text-[11px] py-1" style={{ color: 'var(--slate)', opacity: 0.7, margin: 0 }}>Nothing overdue — nice.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {todayHeroLists.overdue.slice(0, 5).map(t => {
                  const proj = t.project_id ? projects.find(p => p.slug === t.project_id) : null
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className="flex items-center gap-2 text-xs rounded px-1.5 py-1 cursor-pointer hov-bg"
                      style={{ color: 'var(--ink)', '--hov-bg': 'var(--hover-subtle)' } as React.CSSProperties}
                    >
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--maroon)', fontWeight: 500, minWidth: 40 }}>
                        {t.due_date ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                      <span className="truncate flex-1" style={{ minWidth: 0 }}>{t.title || t.description}</span>
                      {proj && <span className="text-[10px] truncate flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.7, maxWidth: 80 }}>{proj.title}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ color: '#fff', background: 'var(--teal-solid)' }}>
                DUE TODAY
              </span>
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                {todayHeroLists.dueToday.length}
              </span>
            </div>
            {todayHeroLists.dueToday.length === 0 ? (
              <p className="text-[11px] py-1" style={{ color: 'var(--slate)', opacity: 0.7, margin: 0 }}>Nothing due today.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {todayHeroLists.dueToday.slice(0, 5).map(t => {
                  const proj = t.project_id ? projects.find(p => p.slug === t.project_id) : null
                  const pColor = t.priority === 'urgent' ? 'var(--maroon)' : t.priority === 'high' ? 'var(--orange)' : 'var(--slate)'
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTask(t)}
                      className="flex items-center gap-2 text-xs rounded px-1.5 py-1 cursor-pointer hov-bg"
                      style={{ color: 'var(--ink)', '--hov-bg': 'var(--hover-subtle)' } as React.CSSProperties}
                    >
                      <span className="text-[10px] flex-shrink-0 capitalize font-medium" style={{ color: pColor, minWidth: 40 }}>
                        {t.priority || 'med'}
                      </span>
                      <span className="truncate flex-1" style={{ minWidth: 0 }}>{t.title || t.description}</span>
                      {proj && <span className="text-[10px] truncate flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.7, maxWidth: 80 }}>{proj.title}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regulatory Alert Strip -- M-25: visible near top of Personal, not buried */}
      {expiringRegulatory.length > 0 && (
        <div
          className="mt-3 rounded-xl"
          style={{
            background: 'var(--maroon-hover)',
            border: '1px solid color-mix(in srgb, var(--maroon) 20%, transparent)',
          }}
        >
          {/* Summary row */}
          <Link
            to={PATHS.projects}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ textDecoration: 'none', borderRadius: 'var(--radius-xl)' }}
          >
            <AlertTriangle {...ICON_PROPS} size={14} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-label)', fontWeight: 500, color: 'var(--maroon)', flex: 1 }}>
              {expiringRegulatory.length} regulatory item{expiringRegulatory.length > 1 ? 's' : ''} expiring within 60 days
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>View details &rarr;</span>
          </Link>
          {/* Per-item rows with .ics download */}
          <div
            style={{
              borderTop: '1px solid color-mix(in srgb, var(--maroon) 12%, transparent)',
              padding: 'var(--sp-xs) var(--sp-lg) var(--sp-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-xs)',
            }}
          >
            {expiringRegulatory.slice(0, 5).map((reg: any) => (
              <div
                key={reg.id}
                className="flex items-center gap-2"
                style={{ fontSize: 'var(--text-small)', color: 'var(--muted)' }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {reg.title}
                  {reg.days_remaining != null && (
                    <span style={{ marginLeft: 6, color: reg.days_remaining <= 14 ? 'var(--maroon)' : 'var(--muted)', fontWeight: 500 }}>
                      ({reg.days_remaining}d)
                    </span>
                  )}
                </span>
                <a
                  href={`/api/regulatory/${reg.id}/ics`}
                  download={`regulatory-${reg.id}.ics`}
                  title="Download calendar reminder (60-day alert)"
                  onClick={(e) => e.stopPropagation()}
                  className="hov-opacity"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 44,
                    minWidth: 44,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid color-mix(in srgb, var(--maroon) 25%, transparent)',
                    color: 'var(--maroon)',
                    opacity: 0.85,
                    textDecoration: 'none',
                    flexShrink: 0,
                    transition: 'opacity var(--duration-fast) ease',
                    '--hov-opacity': '1',
                  } as React.CSSProperties}
                >
                  <Calendar {...ICON_PROPS} size={12} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions + Recently Viewed */}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        {([
          { label: 'New Task', to: `${PATHS.myTasks}?create=true`, icon: SquareCheck, color: 'var(--teal)' },
          { label: 'Submit Idea', to: `${PATHS.ideas}?create=true`, icon: Lightbulb, color: 'var(--gold)' },
          { label: 'Ask a Question', to: `${PATHS.ask}?create=true`, icon: User, color: 'var(--slate)' },
        ]).map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.label}
              to={a.to}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border portal-footer-link"
              style={{
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                color: a.color,
                borderColor: `color-mix(in srgb, ${a.color} 20%, transparent)`,
                background: `color-mix(in srgb, ${a.color} 4%, transparent)`,
                textDecoration: 'none',
                transition: 'background 150ms ease',
              }}
            >
              <Icon {...ICON_PROPS} size={11} />
              {a.label}
            </Link>
          )
        })}

        {recent.length > 1 && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
            <History {...ICON_PROPS} size={11} style={{ color: 'var(--slate)', opacity: 0.75 }} />
            {recent.slice(0, 4).map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="text-[11px] px-2.5 py-1 rounded-full border"
                style={{
                  color: 'var(--slate)',
                  borderColor: 'var(--border-subtle)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-label)',
                }}
              >
                {page.label}
              </Link>
            ))}
          </>
        )}
      </div>

      {/* Quick Capture */}
      <div className="mt-4">
        <QuickCapture />
      </div>

      {/* Two-column command center -- C-08: .personal-grid from index.css stacks on mobile <=768px */}
      <motion.div
        className="personal-grid mt-6"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Left: My Tasks */}
        <motion.div variants={staggerItem}>
          <MyTasksColumn
            tasks={sortedPendingTasks}
            overdueTasks={overdueTasks}
            onStatusChange={handleStatusChange}
            onOpenDetail={setSelectedTask}
          />
        </motion.div>

        {/* Right: 3 compact cards */}
        <motion.div variants={staggerItem}>
          <div className="flex flex-col gap-4">
            <UpcomingCard deadlines={upcomingDeadlines} overdue={overdueTasks} />
            <RecentActivityCard activity={activity} />
            <QuickStatsCard
              completedThisWeek={completedThisWeek}
              overdueCount={overdueTasks.length}
              projectsCount={projects.length}
              pendingCount={pendingTasks.length}
            />
          </div>
        </motion.div>
      </motion.div>

      {/* Onboarding Checklist — collapsed by default, below the command center */}
      {!onboardingDismissed && (
        <div id="onboarding-section" className="mt-6" style={{ scrollMarginTop: '16px' }}>
          <button
            onClick={() => setOnboardingExpanded((v) => !v)}
            className="flex items-center gap-2 w-full text-left px-0 py-0 mb-0"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}
            aria-expanded={onboardingExpanded}
          >
            <ChevronDown {...ICON_PROPS}
              size={14}
              style={{
                color: 'var(--slate)',
                opacity: 0.75,
                transform: onboardingExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms ease',
              }}
            />
            <span style={{ fontSize: 'var(--text-label)', fontWeight: 500, opacity: 0.85 }}>
              30-Day Onboarding
            </span>
            {!onboardingExpanded && (
              <span style={{ fontSize: '11px', opacity: 0.85, marginLeft: 4 }}>
                Show checklist
              </span>
            )}
          </button>
          <AnimatePresence initial={false}>
            {onboardingExpanded && (
              <motion.div
                key="onboarding"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-3">
                  <OnboardingChecklist />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}


    </div>
  )
}
