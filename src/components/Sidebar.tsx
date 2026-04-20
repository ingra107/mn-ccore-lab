import { useMemo, useState, lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
const BugReportModal = lazy(() => import('./BugReportModal'))
import {
  LayoutDashboard,
  User,
  CheckSquare,
  Calendar,
  Clock,
  FolderKanban,
  FileText,
  Lightbulb,
  BookOpen,
  Search,
  DollarSign,
  Users as UsersIcon,
  Activity,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Bug,
  Shield,
  Terminal,
  History,
  TrendingUp,
  GraduationCap,
  GitBranch,
  ClipboardList,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import { useUnreadCount } from '../hooks/useNotifications'
import { useNextMeeting } from '../hooks/useApiData'
import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNavigate?: () => void
}

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  badge?: number
  hint?: string // small secondary text (e.g. "Today")
}

// Feature flags — flip to expose deferred surfaces in the sidebar nav.
// Routes still resolve via App.tsx for direct-link access.
const FEATURE_FLAGS = {
  peripheralBrain: false, // /pb (Daily Plan) — empty state until PB integration ships
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: '',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/personal', label: 'My Hub', icon: User },
      { to: '/my-tasks', label: 'Tasks', icon: CheckSquare },
      { to: '/calendar', label: 'Calendar', icon: Calendar },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban },
      { to: '/manuscripts', label: 'Manuscripts', icon: FileText },
      { to: '/grants', label: 'Grants', icon: DollarSign },
      { to: '/deadlines', label: 'Deadlines', icon: Clock },
      { to: '/ideas', label: 'Ideas', icon: Lightbulb },
      { to: '/digest', label: 'Research Digest', icon: BookOpen },
    ],
  },
  {
    title: 'Lab',
    items: [
      { to: '/meetings', label: 'Meetings', icon: UsersIcon },
      { to: '/meeting-notes', label: 'Transcripts', icon: FileText },
      { to: '/team', label: 'Team', icon: UsersIcon },
      { to: '/activity', label: 'Activity', icon: Activity },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const { isDark } = useDarkMode()
  const userSlug = user?.email?.split('@')[0]?.toLowerCase()
  const [showBugReport, setShowBugReport] = useState(false)
  const person = userSlug ? getPersonInfo(userSlug) : null
  const isPi = user?.isPi ?? false

  // Badge counts — lightweight queries, NOT full task list
  const { data: unreadCount = 0 } = useUnreadCount(userSlug || '')
  const { data: overdueData } = useQuery({
    queryKey: ['overdue-count', userSlug],
    queryFn: async () => {
      const params = userSlug ? `?assignee=${userSlug}` : ''
      const res = await fetch(`/api/tasks/overdue-count${params}`)
      const json = await res.json() as { data: { count: number } }
      return json.data
    },
    staleTime: 60_000,
  })
  const myOverdue = overdueData?.count ?? 0

  // Next meeting countdown — uses lightweight /api/meetings/next (not full meetings list)
  const { data: nextMeeting } = useNextMeeting()
  const nextMeetingLabel = useMemo(() => {
    if (!nextMeeting?.date) return null
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nextDate = new Date(nextMeeting.date + 'T12:00:00')
    if (nextDate < today) return null
    const diffDays = Math.round((nextDate.getTime() - today.getTime()) / 86400000)
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays > 90) return null
    return `in ${diffDays}d`
  }, [nextMeeting])

  // Conditionally include PI Tools section
  const allGroups: NavGroup[] = isPi
    ? [
        ...navGroups,
        {
          title: 'PI View',
          items: [
            { to: '/pi-analytics', label: 'PI Analytics', icon: TrendingUp },
            { to: '/mentee-milestones', label: 'Mentee Milestones', icon: GraduationCap },
            { to: '/deadline-cascade', label: 'Deadline Cascade', icon: GitBranch },
            { to: '/meeting-prep', label: 'Meeting Prep', icon: ClipboardList },
          ],
        },
        {
          title: 'PI Tools',
          items: [
            // PB Sector hidden until Peripheral Brain integration ships (P2-07).
            // Route /pb still resolves for direct-link access.
            ...(FEATURE_FLAGS.peripheralBrain ? [{ to: '/pb', label: 'Daily Plan', icon: Terminal }] : []),
            { to: '/sessions', label: 'Session History', icon: History },
            { to: '/pi/analytics', label: 'PI Dashboard', icon: Shield },
          ],
        },
      ]
    : navGroups

  // Inject badge counts into nav items
  const navWithBadges = useMemo(() => allGroups.map(group => ({
    ...group,
    items: group.items.map(item => {
      if (item.to === '/personal' && unreadCount > 0) return { ...item, badge: unreadCount }
      if (item.to === '/my-tasks' && myOverdue > 0) return { ...item, badge: myOverdue }
      if (item.to === '/meetings' && nextMeetingLabel) return { ...item, hint: nextMeetingLabel }
      return item
    }),
  })), [allGroups, unreadCount, myOverdue])

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      data-testid="sidebar"
      className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-200 border-r ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Logo area */}
      <div className="flex items-center h-14 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <img
            src="/logos/mnccore-logo-mark.svg"
            alt="MN-CCORE"
            className="flex-shrink-0"
            style={{ width: 32, height: 32, filter: isDark ? 'invert(1) brightness(1.5)' : 'none' }}
          />
          {!collapsed && (
            <img
              src={isDark ? '/logos/mnccore-logo-dark.svg' : '/logos/mnccore-logo-primary.svg'}
              alt="MN-CCORE"
              style={{ height: 24 }}
            />
          )}
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navWithBadges.map((group, groupIndex) => (
          <div key={group.title} style={{ marginBottom: '4px' }}>
            {/* Section divider (not before first group) */}
            {groupIndex > 0 && (
              <div
                style={{
                  height: '1px',
                  background: 'var(--border-subtle)',
                  margin: collapsed ? '6px 4px 8px' : '6px 8px 8px',
                }}
              />
            )}
            {!collapsed && group.title && (
              <div
                className="px-2 py-1 text-[10px] font-normal uppercase tracking-wider"
                style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', letterSpacing: '0.08em' }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const active = isActive(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  prefetch="intent"
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] transition-colors duration-[150ms] mb-0.5"
                  style={{
                    backgroundColor: active ? 'color-mix(in srgb, var(--teal-subtle) 12%, transparent)' : 'transparent',
                    color: active ? 'var(--teal)' : 'var(--slate)',
                    fontWeight: active ? 500 : 400,
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span style={{ opacity: active ? 1 : 0.85, display: 'flex' }}><Icon size={18} /></span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.hint && (
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: item.hint === 'Today' ? 'var(--teal-active)' : 'var(--gold-active)',
                        color: item.hint === 'Today' ? 'var(--teal)' : 'var(--gold)',
                      }}
                    >
                      {item.hint}
                    </span>
                  )}
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--maroon-solid)',
                        color: 'var(--ink-bright, #fff)',
                        animation: item.to === '/my-tasks' ? 'badge-pulse 2s ease-in-out infinite' : undefined,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t px-2 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* Report a Bug */}
        {!collapsed && (
          <button
            onClick={() => setShowBugReport(true)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 w-full cursor-pointer"
            style={{ color: 'var(--slate)', textDecoration: 'none', opacity: 0.85, background: 'none', border: 'none', textAlign: 'left' }}
          >
            <Bug size={16} />
            <span>Report a Bug</span>
          </button>
        )}
        <Suspense fallback={null}>
          <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />
        </Suspense>

        {/* Search hint */}
        {!collapsed && (
          <Link
            to="/search"
            prefetch="intent"
            className="flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-md text-sm transition-colors"
            style={{ color: 'var(--slate)', opacity: 0.75 }}
          >
            <Search size={16} />
            <span className="flex-1">Search</span>
            <kbd
              className="text-[10px] px-1.5 py-0.5 rounded border"
              style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-subtle)', color: 'var(--slate)', opacity: 1 }}
            >
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
            </kbd>
          </Link>
        )}

        {/* Back to website */}
        <Link
          to="/"
          prefetch="intent"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
          style={{ color: 'var(--slate)' }}
          title={collapsed ? 'Back to Website' : undefined}
        >
          <ExternalLink size={16} />
          {!collapsed && <span>Back to Website</span>}
        </Link>

        {/* User profile */}
        {person && !collapsed && (
          <Link
            to={`/portal/team/${userSlug}`}
            prefetch="intent"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--ink)', textDecoration: 'none' }}
          >
            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="tight" variant="gold" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{person.name}</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--slate)', opacity: 0.75 }}>{user?.email}</div>
            </div>
          </Link>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm w-full transition-colors"
          style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
