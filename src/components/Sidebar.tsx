import { useMemo, useState, lazy, Suspense } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
const BugReportModal = lazy(() => import('./BugReportModal'))
import {
  LayoutDashboard,
  User,
  SquareCheck,
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
import NotificationBell from './NotificationBell'
import { useNextMeeting } from '../hooks/useApiData'
import { useUnseenActivity } from '../hooks/useEntitySeen'
import { todayKey } from '../lib/taskGrouping'
import { PATHS } from '../constants/paths'
import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'
import { emailToSlug } from '../lib/emailSlug'
import { ICON_PROPS } from '../lib/iconProps'

// Premium icon weight (Nick 2026-06-11): lucide's default stroke (2 on a 24
// grid) scales fuzzy at small sizes; a true 1.5px absolute stroke is crisper
// and optically lighter. ONE const so a future weight tweak is one line.

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNavigate?: () => void
}

/** Appearance of a nav badge pill (ROW 84 / #509). ONE shape for how the
 *  badge looks, regardless of whether it's also a separate click target —
 *  replaces the old badgeBg/badgeColor/badgeTitle trio + BadgeAction's own
 *  copy of the same three fields. Callers pre-resolve `title` to a string
 *  at construction time (the count is already known in navWithBadges). */
interface BadgeStyle {
  bg: string
  color: string
  title: string
}

/** Data-driven click BEHAVIOR for a nav badge (ROW 84) when the badge is
 *  its own separate click target (navigates elsewhere than the row).
 *  Appearance lives in NavItem.badgeStyle regardless of badgeAction. */
interface BadgeAction {
  /** Route to navigate to when the badge is clicked / activated. */
  navigateTo: string
  /** aria-label for the badge element (pre-resolved with the count). */
  ariaLabel: string
}

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; absoluteStrokeWidth?: boolean }>
  badge?: number
  /** Badge pill appearance (bg/color/tooltip). Set for ANY badge, whether or
   *  not it's also a badgeAction click target. Falls back to the default
   *  maroon "overdue" look when unset. */
  badgeStyle?: BadgeStyle
  hint?: string // small secondary text (e.g. "Today")
  /** Present when the badge is its own click target (navigates elsewhere). */
  badgeAction?: BadgeAction
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
      // SquareCheck (check contained INSIDE the square) over the old
      // CheckSquare whose check overflowed the frame — reads cleaner at 18px.
      { to: PATHS.myTasks, label: 'Tasks', icon: SquareCheck },
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
      { to: PATHS.profile, label: 'My Profile', icon: User },
      { to: PATHS.settings, label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isDark } = useDarkMode()
  const userSlug = emailToSlug(user?.email)
  const [showBugReport, setShowBugReport] = useState(false)
  const person = userSlug ? getPersonInfo(userSlug) : null
  const isPi = user?.isPi ?? false

  // Badge counts — lightweight queries, NOT full task list.
  // (Unread NOTIFICATIONS moved off the My Hub nav item to the bell in the
  // header row — the nav badge implied My Hub held a clickable updates list,
  // which it doesn't. Nick 2026-06-11.)
  const { data: overdueData } = useQuery({
    queryKey: ['overdue-count', userSlug],
    queryFn: async () => {
      const params = userSlug ? `?assignee=${userSlug}` : ''
      const res = await fetch(`/api/tasks/overdue-count${params}`)
      const json = await res.json() as { data: { count: number; unseen: number } }
      return json.data
    },
    staleTime: 60_000,
  })
  // My Tasks badge = UNSEEN (tasks you haven't opened yet), not overdue
  // (Nick 2026-06-11: a badge that doesn't drain when you interact is noise —
  // overdue lives inside the page via OverdueBanner + the ⚠ quick filter).
  // Drains via auto-acknowledge as tasks are opened.
  const myUnseen = overdueData?.unseen ?? 0

  // Next meeting countdown — uses lightweight /api/meetings/next (not full meetings list)
  const { data: nextMeeting } = useNextMeeting()

  // New-notes badge — T12: server-backed seen (schema v81) via
  // GET /api/seen/unseen's meeting arm (T11) directly gives the unseen set,
  // so this no longer needs its own ['meetings'] list fetch just to count.
  const { data: unseen } = useUnseenActivity()
  const newMeetingsCount = unseen?.meetings.size ?? 0
  // §9.5.1 — Today nav badge: unseen private Hermes answers on today's
  // Today-bar thread (entity_type='day', keyed by civil date). Drains via
  // useMarkSeen('day', todayKey()) when TodayPage mounts (Rule 73 honesty).
  const dayUnseen = unseen?.days.get(todayKey())?.new_count ?? 0
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
  // ROW 84 / #509: badge appearance+behavior defined once here, not in JSX
  // conditionals. badgeStyle is the pill's look (shared shape, whether or
  // not the badge is also a click target); badgeAction is pure behavior.
  const navWithBadges = useMemo(() => allGroups.map(group => ({
    ...group,
    items: group.items.map(item => {
      // §9.5.1 — Today badge: gold (Rule 59: gold = "...Hermes...") matches
      // the My Tasks/Meetings unseen idiom below. Row already navigates to
      // Today (PATHS.dashboard), so no separate badgeAction — visiting the
      // page + TodayPage's markSeen('day', ...) drains it, same shape as
      // ProjectDetail/MeetingDetail's own mark-seen-on-open.
      if (item.to === PATHS.dashboard && dayUnseen > 0)
        return {
          ...item,
          badge: dayUnseen,
          badgeStyle: {
            bg: 'var(--gold)',
            color: '#1a1a1a',
            title: `${dayUnseen} Hermes ${dayUnseen === 1 ? 'answer' : 'answers'} on Today`,
          },
        }
      if (item.to === PATHS.myTasks && myUnseen > 0)
        return {
          ...item,
          badge: myUnseen,
          badgeStyle: {
            bg: 'var(--gold)',
            // Gold bg takes a fixed dark literal, not var(--ink) (CLAUDE.md gold rule).
            color: '#1a1a1a',
            title: `${myUnseen} task${myUnseen === 1 ? '' : 's'} you haven't opened yet — click to triage in My Items`,
          },
          badgeAction: {
            navigateTo: PATHS.myItems,
            ariaLabel: `${myUnseen} new task${myUnseen === 1 ? '' : 's'} — open My Items`,
          },
        }
      if (item.to === PATHS.meetings) {
        let next = item
        if (nextMeetingLabel) next = { ...next, hint: nextMeetingLabel }
        // Gold = "unseen, not urgent" (matches My Tasks idiom) — meetings
        // badge and row share one destination, so no badgeAction needed;
        // it drains on visit like My Tasks, never a manual dismiss (Nick
        // 2026-06-11: a badge that doesn't drain when you interact is noise).
        if (newMeetingsCount > 0) {
          next = {
            ...next,
            badge: newMeetingsCount,
            badgeStyle: {
              bg: 'var(--gold)',
              color: '#1a1a1a',
              title: `${newMeetingsCount} meeting${newMeetingsCount === 1 ? '' : 's'} with new notes`,
            },
          }
        }
        return next
      }
      return item
    }),
  })), [allGroups, myUnseen, nextMeetingLabel, newMeetingsCount, dayUnseen])

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
      {/* Logo area + notification bell. The bell is THE portal notification
          surface (Nick 2026-06-11): badge = unread, click = the pointed list
          of updates (deep-links per item), close = everything marked read
          (Slack semantics, inside NotificationBell). align="left" so the
          dropdown opens rightward over the content instead of off-screen. */}
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
        {!collapsed && (
          <span className="ml-auto">
            <NotificationBell align="left" />
          </span>
        )}
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
                  {/* Premium icon weight (Nick 2026-06-11): default lucide
                      stroke (2 on a 24 grid) scales to a fuzzy 1.5px at
                      size 18. absoluteStrokeWidth pins a true 1.5px stroke —
                      optically lighter and crisper at this size. */}
                  <span style={{ opacity: active ? 1 : 0.85, display: 'flex' }}><Icon size={18} {...ICON_PROPS} /></span>
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
                      // ROW 84 / #509: appearance reads badgeStyle directly (one
                      // shape, whether or not the badge is also a click target);
                      // only the click BEHAVIOR still forks on badgeAction. The
                      // My Tasks badge is its OWN click target (Nick 2026-06-11):
                      // the count → My Items "New for You" triage list, while the
                      // rest of the row still goes to My Tasks.
                      title={item.badgeStyle?.title}
                      role={item.badgeAction ? 'link' : undefined}
                      tabIndex={item.badgeAction ? 0 : undefined}
                      aria-label={item.badgeAction?.ariaLabel}
                      onClick={item.badgeAction ? (e) => { e.preventDefault(); e.stopPropagation(); navigate(item.badgeAction!.navigateTo); onNavigate?.() } : undefined}
                      onKeyDown={item.badgeAction ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(item.badgeAction!.navigateTo); onNavigate?.() } } : undefined}
                      style={{
                        backgroundColor: item.badgeStyle?.bg ?? 'var(--maroon-solid)',
                        color: item.badgeStyle?.color ?? 'var(--ink-bright, #fff)',
                        cursor: item.badgeAction ? 'pointer' : undefined,
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
            <Bug size={16} {...ICON_PROPS} />
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
            <Search size={16} {...ICON_PROPS} />
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
          <ExternalLink size={16} {...ICON_PROPS} />
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
          {collapsed ? <ChevronRight size={16} {...ICON_PROPS} /> : <ChevronLeft size={16} {...ICON_PROPS} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
