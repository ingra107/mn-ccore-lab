import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { lazyRoute } from '../lib/lazyRoute'
import { Link, useLocation, useNavigate } from 'react-router-dom'
const BugReportModal = lazyRoute(() => import('./BugReportModal'))
import {
  LayoutDashboard,
  User,
  SquareCheck,
  Calendar,
  Clock,
  FolderKanban,
  FileText,
  Search,
  DollarSign,
  Users as UsersIcon,
  Activity,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Bug,
  History,
  TrendingUp,
  LayoutGrid,
  Library,
  Star,
  LogOut,
  Target,
  Zap,
  Video,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import NotificationBell from './NotificationBell'
import { useNextMeeting, useProjects } from '../hooks/useApiData'
import { civilDaysUntil } from '../lib/dateUtils'
import { useUnseenActivity } from '../hooks/useEntitySeen'
import { useProjectPins } from '../hooks/useProjectPins'
import { projectsForSidebar } from '../lib/sidebarProjects'
import { todayKey } from '../lib/taskGrouping'
import { PATHS } from '../constants/paths'
import { PORTAL_PAGE_LABELS } from '../constants/pageLabels'
import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'
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

// Nav redesign (2026-10-09, Nick's mockup answers): ten main items in this
// order, then Lab Overview for a PI, then the person's own projects. Pages
// that left the sidebar live inside these (Library tabs, Projects > Ideas,
// Meetings > Transcripts, Lab Overview tabs) or in the avatar menu below.
// The "nothing lost" map is in the commit that made this change.
const MAIN_NAV: NavItem[] = [
  // "Today" replaces "Dashboard" as the primary landing label after the
  // Today B2 cutover (see CLAUDE.md Rule 52). Route stays /portal/dashboard.
  { to: PATHS.dashboard, label: PORTAL_PAGE_LABELS[PATHS.dashboard], icon: LayoutDashboard },
  // SquareCheck (check contained INSIDE the square) over the old
  // CheckSquare whose check overflowed the frame — reads cleaner at 18px.
  { to: PATHS.myTasks, label: PORTAL_PAGE_LABELS[PATHS.myTasks], icon: SquareCheck },
  { to: PATHS.calendar, label: PORTAL_PAGE_LABELS[PATHS.calendar], icon: Calendar },
  { to: PATHS.deadlines, label: PORTAL_PAGE_LABELS[PATHS.deadlines], icon: Clock },
  { to: PATHS.meetings, label: PORTAL_PAGE_LABELS[PATHS.meetings], icon: Video },
  { to: PATHS.projects, label: PORTAL_PAGE_LABELS[PATHS.projects], icon: FolderKanban },
  { to: PATHS.manuscripts, label: PORTAL_PAGE_LABELS[PATHS.manuscripts], icon: FileText },
  { to: PATHS.grants, label: PORTAL_PAGE_LABELS[PATHS.grants], icon: DollarSign },
  { to: PATHS.library, label: PORTAL_PAGE_LABELS[PATHS.library], icon: Library },
  { to: PATHS.team, label: PORTAL_PAGE_LABELS[PATHS.team], icon: UsersIcon },
]

const PI_NAV: NavItem[] = [
  { to: PATHS.overview, label: PORTAL_PAGE_LABELS[PATHS.overview], icon: LayoutGrid },
]

interface MenuLink { to: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; absoluteStrokeWidth?: boolean }> }

/** The avatar menu, everyone (Nick's list, plus My Items, which the old
 *  avatar link opened and which has no other sidebar entry). */
const AVATAR_MENU: MenuLink[] = [
  { to: PATHS.profile, label: 'My Profile', icon: User },
  { to: PATHS.myItems, label: 'My Items', icon: Target },
  { to: PATHS.settings, label: 'Settings', icon: Settings },
  { to: PATHS.activity, label: 'Activity', icon: Activity },
  { to: PATHS.analytics, label: 'Analytics', icon: BarChart3 },
  { to: PATHS.insights, label: 'Insights', icon: TrendingUp },
]

/** The avatar menu's PI tools group. */
const AVATAR_PI_TOOLS: MenuLink[] = [
  { to: PATHS.sessions, label: 'Session History', icon: History },
  { to: PATHS.launches, label: 'My Launches', icon: Zap },
]

const SIGN_OUT_HREF = '/cdn-cgi/access/logout'

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isDark } = useDarkMode()
  const userSlug = user?.slug ?? ''
  const [showBugReport, setShowBugReport] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const person = userSlug ? getPersonInfo(userSlug) : null
  const isPi = user?.isPi ?? false

  // Close the avatar menu on outside click, Escape, or navigation.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname)
    setMenuOpen(false)
  }

  // Badge counts — lightweight queries, NOT full task list.
  // (Unread NOTIFICATIONS live on the bell in the header row.)
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
  // Tasks badge = UNSEEN (tasks you haven't opened yet), not overdue
  // (Nick 2026-06-11: a badge that doesn't drain when you interact is noise).
  const myUnseen = overdueData?.unseen ?? 0

  // Next meeting countdown — uses lightweight /api/meetings/next.
  const { data: nextMeeting } = useNextMeeting()

  // T12: server-backed seen (schema v81). Meetings with new notes, today's
  // private Hermes answers, and per-project new activity (the "My projects"
  // badges) all come from one GET /api/seen/unseen.
  const { data: unseen } = useUnseenActivity()
  const newMeetingsCount = unseen?.meetings.size ?? 0
  const dayUnseen = unseen?.days.get(todayKey())?.new_count ?? 0
  const nextMeetingLabel = useMemo(() => {
    if (!nextMeeting?.date) return null
    const diffDays = civilDaysUntil(nextMeeting.date)
    if (diffDays < 0) return null
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays > 90) return null
    return `in ${diffDays}d`
  }, [nextMeeting])

  // "My projects": pinned first, then active in the last 14 days.
  const { data: projects = [] } = useProjects()
  const { pins } = useProjectPins()
  const myProjects = useMemo(
    () => projectsForSidebar(
      projects.map((p) => ({ id: p.id, slug: p.slug ?? '', title: p.title, short_name: p.short_name, status: p.status, stage: p.stage, lastActivity: p.lastActivity })).filter((p) => p.slug),
      pins.map((p) => p.slug).filter((s): s is string => !!s),
      // eslint-disable-next-line react-hooks/purity -- the 14-day window is a snapshot at memoize time; it recomputes when projects or pins change
      Date.now(),
    ),
    [projects, pins],
  )

  // Inject badge counts into nav items (ROW 84 / #509: appearance+behavior
  // defined once here, not in JSX conditionals).
  const mainWithBadges = useMemo(() => MAIN_NAV.map((item) => {
    // §9.5.1 — Today badge: gold = Hermes answers waiting on Today; drains when
    // TodayPage marks the day seen.
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
      let next: NavItem = item
      if (nextMeetingLabel) next = { ...next, hint: nextMeetingLabel }
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
  }), [myUnseen, nextMeetingLabel, newMeetingsCount, dayUnseen])

  const isActive = (path: string) => {
    if (path === PATHS.dashboard) return location.pathname === PATHS.dashboard
    return location.pathname.startsWith(path)
  }

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isActive(item.to)
    return (
      <Link
        key={item.to}
        to={item.to}
        prefetch="intent"
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="relative flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] transition-colors duration-[150ms] mb-0.5"
        style={{
          backgroundColor: active ? 'color-mix(in srgb, var(--teal-subtle) 12%, transparent)' : 'transparent',
          color: active ? 'var(--teal)' : 'var(--slate)',
          fontWeight: active ? 500 : 400,
        }}
        title={collapsed ? item.label : undefined}
      >
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
            // The My Tasks badge is its OWN click target (Nick 2026-06-11): the
            // count opens My Items "New for You", the row opens Tasks.
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
        {/* Collapsed: a dot in place of the count, so the signal survives. */}
        {collapsed && item.badge !== undefined && item.badge > 0 && (
          <span aria-hidden="true" className="sb-dot" style={{ background: item.badgeStyle?.bg ?? 'var(--maroon-solid)' }} />
        )}
      </Link>
    )
  }

  const divider = (
    <div style={{ height: '1px', background: 'var(--border-subtle)', margin: collapsed ? '6px 4px 8px' : '6px 8px 8px' }} />
  )

  const menuLink = (l: MenuLink) => {
    const Icon = l.icon
    return (
      <Link
        key={l.to}
        to={l.to}
        role="menuitem"
        onClick={() => { setMenuOpen(false); onNavigate?.() }}
        className="sb-menu-item"
      >
        <Icon size={15} {...ICON_PROPS} />
        <span>{l.label}</span>
      </Link>
    )
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
      <style>{`
        .sb-dot { position: absolute; left: 30px; top: 6px; width: 7px; height: 7px; border-radius: 999px; }
        .sb-menu-item { display: flex; align-items: center; gap: 10px; padding: 7px 12px; font-size: 12px; color: var(--ink); text-decoration: none; border-radius: 6px; background: none; border: none; width: 100%; text-align: left; cursor: pointer; }
        .sb-menu-item:hover, .sb-menu-item:focus-visible { background: var(--hover-subtle); outline: none; }
        .sb-menu-label { padding: 8px 12px 4px; font-size: 10px; color: var(--slate); opacity: 0.85; }
        .sb-proj { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 14px; border-radius: 8px; font-size: 12px; text-decoration: none; margin-bottom: 1px; }
        .sb-proj:hover { background: var(--hover-subtle); }
      `}</style>

      {/* Logo area + notification bell. The bell is THE portal notification
          surface (Nick 2026-06-11). align="left" so the dropdown opens
          rightward over the content instead of off-screen. */}
      <div className="flex items-center h-14 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <Link to={PATHS.dashboard} className="flex items-center gap-2 min-w-0" aria-label="MN-CCORE Hub — Today">
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

      <nav className="flex-1 overflow-y-auto py-3 px-2" aria-label="Hub navigation">
        {/* Search stays at the top (Ctrl+K opens the palette anywhere). */}
        <Link
          to={PATHS.search}
          prefetch="intent"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg text-[12px] transition-colors border"
          style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)' }}
          title={collapsed ? 'Search (Ctrl+K)' : undefined}
          aria-label="Search"
        >
          <Search size={16} {...ICON_PROPS} />
          {!collapsed && <span className="flex-1">Search</span>}
          {!collapsed && (
            <kbd
              className="text-[10px] px-1.5 py-0.5 rounded border"
              style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-subtle)', color: 'var(--slate)' }}
            >
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
            </kbd>
          )}
        </Link>

        {mainWithBadges.map(renderItem)}

        {isPi && (
          <>
            {divider}
            {PI_NAV.map(renderItem)}
          </>
        )}

        {/* My projects: pinned, then active in the last two weeks. Short
            names, no "#". Hidden when collapsed (Projects above still opens
            the full list). */}
        {!collapsed && (
          <div data-testid="sidebar-my-projects" style={{ marginTop: 4 }}>
            {divider}
            <div className="px-3 pb-1 text-[11px]" style={{ color: 'var(--slate)', opacity: 0.85 }}>My projects</div>
            {myProjects.length === 0 && (
              <div className="px-3 py-1 text-[11px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                Star a project to keep it here.
              </div>
            )}
            {myProjects.map((p) => {
              const active = location.pathname === PATHS.project(p.slug)
              const unread = p.id ? unseen?.projects.get(p.id)?.new_count ?? 0 : 0
              return (
                <Link
                  key={p.slug}
                  to={PATHS.project(p.slug)}
                  onClick={onNavigate}
                  className="sb-proj"
                  aria-current={active ? 'page' : undefined}
                  style={{ color: active ? 'var(--teal)' : 'var(--ink)', fontWeight: active ? 500 : 400 }}
                >
                  {p.pinned
                    ? <Star size={11} {...ICON_PROPS} fill="var(--gold)" style={{ color: 'var(--gold)', flexShrink: 0 }} aria-label="Pinned" />
                    : <span aria-hidden="true" style={{ width: 11, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}><span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--slate)', opacity: 0.6 }} /></span>}
                  <span className="truncate flex-1">{p.name}</span>
                  {unread > 0 && (
                    <span
                      className="text-[10px] px-1.5 rounded-full"
                      title={`${unread} new update${unread === 1 ? '' : 's'}`}
                      style={{ background: 'var(--teal-active)', color: 'var(--teal)' }}
                    >
                      {unread}
                    </span>
                  )}
                </Link>
              )
            })}
            <Link
              to={PATHS.projects}
              onClick={onNavigate}
              className="sb-proj"
              style={{ color: 'var(--slate)' }}
            >
              <ChevronRight size={11} {...ICON_PROPS} style={{ flexShrink: 0 }} />
              <span>All projects</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Footer: Report a Bug stays visible (Nick), as an icon when collapsed;
          then the avatar menu and the collapse toggle. */}
      <div className="border-t px-2 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setShowBugReport(true)}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] transition-colors hover:bg-black/5 dark:hover:bg-white/5 w-full cursor-pointer"
          style={{ color: 'var(--slate)', opacity: 0.85, background: 'none', border: 'none', textAlign: 'left' }}
          title={collapsed ? 'Report a bug' : undefined}
          aria-label="Report a bug"
        >
          <Bug size={16} {...ICON_PROPS} />
          {!collapsed && <span>Report a bug</span>}
        </button>
        <Suspense fallback={null}>
          <BugReportModal open={showBugReport} onClose={() => setShowBugReport(false)} />
        </Suspense>

        {/* Avatar menu: My Profile, My Items, Settings, Activity, Analytics,
            Insights, PI tools (Session History, My Launches), Back to website,
            Sign out. Opens upward. */}
        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div
              role="menu"
              aria-label="Account"
              data-testid="avatar-menu"
              className="absolute bottom-full mb-1 rounded-lg border py-1"
              style={{
                left: 0,
                width: 220,
                background: 'var(--cream)',
                borderColor: 'var(--border-subtle)',
                boxShadow: 'var(--shadow-menu)',
                zIndex: 'var(--z-dropdown, 50)',
              }}
            >
              {AVATAR_MENU.map(menuLink)}
              {isPi && (
                <>
                  <div className="sb-menu-label">PI tools</div>
                  {AVATAR_PI_TOOLS.map(menuLink)}
                </>
              )}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              <Link to="/" role="menuitem" className="sb-menu-item" onClick={() => setMenuOpen(false)}>
                <ExternalLink size={15} {...ICON_PROPS} />
                <span>Back to website</span>
              </Link>
              <a href={SIGN_OUT_HREF} role="menuitem" className="sb-menu-item">
                <LogOut size={15} {...ICON_PROPS} />
                <span>Sign out</span>
              </a>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            data-testid="avatar-menu-button"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] transition-colors hover:bg-black/5 dark:hover:bg-white/5 w-full"
            style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            title={collapsed ? (person?.name ?? 'Account') : undefined}
          >
            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
              {person
                ? <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="tight" variant="gold" />
                : <User size={18} {...ICON_PROPS} />}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{person?.name ?? user?.name ?? 'Account'}</div>
                  {user?.email && <div className="text-[10px] truncate" style={{ color: 'var(--slate)', opacity: 0.75 }}>{user.email}</div>}
                </div>
                <ChevronUp size={14} {...ICON_PROPS} style={{ color: 'var(--slate)', transform: menuOpen ? 'none' : 'rotate(180deg)', transition: 'transform 150ms ease' }} />
              </>
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12px] w-full transition-colors"
          style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} {...ICON_PROPS} /> : <ChevronLeft size={16} {...ICON_PROPS} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
