import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  User,
  CheckSquare,
  ListTodo,
  Calendar,
  Clock,
  FolderKanban,
  FileText,
  Lightbulb,
  HelpCircle,
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
  Scale,
  Shield,
  Terminal,
  Inbox,
  ScrollText,
  GraduationCap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useUnreadCount } from '../hooks/useNotifications'
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
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/personal', label: 'My Hub', icon: User },
    ],
  },
  {
    title: 'Planning',
    items: [
      { to: '/my-tasks', label: 'My Tasks', icon: CheckSquare },
      { to: '/my-items', label: 'My Items', icon: Inbox },
      { to: '/tasks', label: 'All Tasks', icon: ListTodo },
      { to: '/calendar', label: 'Calendar', icon: Calendar },
      { to: '/deadlines', label: 'Deadlines', icon: Clock },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban },
      { to: '/manuscripts', label: 'Manuscripts', icon: FileText },
      { to: '/ideas', label: 'Ideas', icon: Lightbulb },
      { to: '/ask', label: 'Ask the Lab', icon: HelpCircle },
      { to: '/decisions', label: 'Decisions', icon: Scale },
      { to: '/digest', label: 'Literature', icon: BookOpen },
      { to: '/search', label: 'Search', icon: Search },
      { to: '/grants', label: 'Grants', icon: DollarSign },
    ],
  },
  {
    title: 'Meetings',
    items: [
      { to: '/meetings', label: 'Meetings', icon: UsersIcon },
      { to: '/meeting-notes', label: 'AI Notes', icon: FileText },
      { to: '/narratives', label: 'Narratives', icon: ScrollText },
    ],
  },
  {
    title: 'Lab',
    items: [
      { to: '/team', label: 'Team', icon: UsersIcon },
      { to: '/mentee-milestones', label: 'Mentee Milestones', icon: GraduationCap },
      { to: '/activity', label: 'Activity', icon: Activity },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

export default function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation()
  const { user } = useAuth()
  const userSlug = user?.email?.split('@')[0]?.toLowerCase()
  const person = userSlug ? getPersonInfo(userSlug) : null
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false

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

  // Conditionally include PI Tools section
  const allGroups: NavGroup[] = isPi
    ? [...navGroups, { title: 'PI Tools', items: [{ to: '/pb', label: 'Daily Plan', icon: Terminal }, { to: '/pi/analytics', label: 'PI Dashboard', icon: Shield }] }]
    : navGroups

  // Inject badge counts into nav items
  const navWithBadges = allGroups.map(group => ({
    ...group,
    items: group.items.map(item => {
      if (item.to === '/personal' && unreadCount > 0) return { ...item, badge: unreadCount }
      if (item.to === '/my-tasks' && myOverdue > 0) return { ...item, badge: myOverdue }
      return item
    }),
  }))

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-200 border-r ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      style={{
        backgroundColor: 'var(--cream)',
        borderColor: 'var(--border-light)',
      }}
    >
      {/* Logo area */}
      <div className="flex items-center h-14 px-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <img
            src="/logos/mnccore-logo-mark.svg"
            alt="MN-CCORE"
            className="flex-shrink-0"
            style={{ width: 32, height: 32 }}
          />
          {!collapsed && (
            <img
              src="/logos/mnccore-logo-primary.svg"
              alt="MN-CCORE"
              style={{ height: 24 }}
            />
          )}
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navWithBadges.map((group, groupIndex) => (
          <div key={group.title} style={{ marginBottom: '8px' }}>
            {/* Section divider (not before first group) */}
            {groupIndex > 0 && (
              <div
                style={{
                  height: '1px',
                  background: 'var(--border-subtle)',
                  margin: collapsed ? '8px 4px 12px' : '8px 8px 12px',
                }}
              />
            )}
            {!collapsed && (
              <div
                className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--slate)', opacity: 0.5, letterSpacing: '0.08em' }}
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
                  onClick={onNavigate}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors mb-0.5"
                  style={{
                    backgroundColor: active ? 'rgba(45,138,138,0.12)' : 'transparent',
                    color: active ? 'var(--teal)' : 'var(--slate)',
                    fontWeight: active ? 500 : 400,
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span style={{ opacity: active ? 1 : 0.7, display: 'flex' }}><Icon size={18} /></span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--maroon)', color: 'white' }}
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
      <div className="border-t px-2 py-2" style={{ borderColor: 'var(--border-light)' }}>
        {/* Report a Bug */}
        {!collapsed && (
          <a
            href="mailto:ningraha@umn.edu?subject=MN-CCORE%20Hub%20Bug%20Report"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--slate)', textDecoration: 'none', opacity: 0.6 }}
          >
            <Bug size={16} />
            <span>Report a Bug</span>
          </a>
        )}

        {/* Search hint */}
        {!collapsed && (
          <Link
            to="/search"
            className="flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-md text-sm transition-colors"
            style={{ color: 'var(--slate)', opacity: 0.6 }}
          >
            <Search size={16} />
            <span className="flex-1">Search</span>
            <kbd
              className="text-[9px] px-1.5 py-0.5 rounded border"
              style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-light)', color: 'var(--slate)', opacity: 0.5 }}
            >
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
            </kbd>
          </Link>
        )}

        {/* Back to website */}
        <Link
          to="/"
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
            to={`/team/${userSlug}`}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--ink)', textDecoration: 'none' }}
          >
            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="gold" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[8px]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{person.name}</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--slate)', opacity: 0.6 }}>{user?.email}</div>
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
