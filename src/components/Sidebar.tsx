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
  LayoutGrid,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import { useUnreadCount } from '../hooks/useNotifications'
import { useNextMeeting } from '../hooks/useApiData'
import { PATHS } from '../constants/paths'
import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'
import { emailToSlug } from '../lib/emailSlug'

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
      // "Today" replaces "Dashboard" as the primary landing label after the
      // Today B2 cutover (see CLAUDE.md Rule 52). Route stays /portal/dashboard
      // for URL compat during the alias window.
      { to: PATHS.dashboard, label: 'Today', icon: LayoutDashboard },
      { to: PATHS.personal, label: 'My Hub', icon: User },
      { to: PATHS.myTasks, label: 'Tasks', icon: CheckSquare },
      { to: PATHS.calendar, label: 'Calendar', icon: Calendar },
      { to: PATHS.overview, label: 'Lab Overview', icon: LayoutGrid },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: PATHS.projects, label: 'Projects', icon: FolderKanban },
      { to: PATHS.manuscripts, label: 'Manuscripts', icon: FileText },
      { to: PATHS.grants, label: 'Grants', icon: DollarSign },
      { to: PATHS.deadlines, label: 'Deadlines', icon: Clock },
      { to: PATHS.ideas, label: 'Ideas', icon: Lightbulb },
      { to: PATHS.digest, label: 'Research Digest', icon: BookOpen },
    ],
  },
  {
    title: 'Lab',
    items: [
      { to: PATHS.meetings, label: 'Meetings', icon: UsersIcon },
      { to: PATHS.meetingNotes, label: 'Transcripts', icon: FileText },
      { to: '/team', label: 'Team', icon: UsersIcon },
      { to: PATHS.activity, label: 'Activity', icon: Activity },
      { to: PATHS.analytics, label: 'Analytics', icon: BarChart3 },
      { to: PATHS.insights, label: 'Insights', icon: TrendingUp },
      { to: PATHS.settings, label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const { isDark } = useDarkMode()
  const userSlug = emailToSlug(user?.email)
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

  // Conditionally include PI Tools section. Memoize so `navWithBadges`
  // below doesn't thrash on every render due to a new array identity.
  const allGroups = useMemo<NavGroup[]>(() => (
    isPi
      ? [
          ...navGroups,
          {
            title: 'PI View',
            items: [
              { to: PATHS.piAnalytics, label: 'PI Analytics', icon: TrendingUp },
              { to: PATHS.menteeMilestones, label: 'Mentee Milestones', icon: GraduationCap },
              { to: PATHS.deadlineCascade, label: 'Deadline Cascade', icon: GitBranch },
              { to: PATHS.meetings, label: 'Meeting Prep', icon: ClipboardList },
            ],
          },
          {
            title: 'PI Tools',
            items: [
              // PB Sector hidden until Peripheral Brain integration ships (P2-07).
              // Route /pb still resolves for direct-link access.
              ...(FEATURE_FLAGS.peripheralBrain ? [{ to: PATHS.pb, label: 'Daily Plan', icon: Terminal }] : []),
              { to: PATHS.sessions, label: 'Session History', icon: History },
              { to: PATHS.piAnalytics, label: 'PI Dashboard', icon: Shield },
            ],
          },
        ]
      : navGroups
  ), [isPi])

  // Inject badge counts into nav items. nextMeetingLabel was missing from
  // the dep array previously — a stale "Today"/"Tomorrow" hint could
  // persist until another dep changed.
  const navWithBadges = useMemo(() => allGroups.map(group => ({
    ...group,
    items: group.items.map(item => {
      if (item.to === PATHS.personal && unreadCount > 0) return { ...item, badge: unreadCount }
      if (item.to === PATHS.myTasks && myOverdue > 0) return { ...item, badge: myOverdue }
      if (item.to === PATHS.meetings && nextMeetingLabel) return { ...item, hint: nextMeetingLabel }
      return item
    }),
  })), [allGroups, unreadCount, myOverdue, nextMeetingLabel])

  const isActive = (path: string) => {
    if (path === PATHS.dashboard) return location.pathname === PATHS.dashboard
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
            to={PATHS.search}
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

        {/* User profile — link to personal workspace (my-items) rather than
            public team-member page. GH #20: avatar click routed to team
            profile, but Nick expected his own working page. r7 2026-04-22. */}
        {person && !collapsed && (
          <Link
            to={PATHS.myItems}
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
