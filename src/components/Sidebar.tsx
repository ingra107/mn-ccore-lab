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
} from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
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
    ],
  },
  {
    title: 'Lab',
    items: [
      { to: '/team', label: 'Team', icon: UsersIcon },
      { to: '/activity', label: 'Activity', icon: Activity },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()

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
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-3">
            {!collapsed && (
              <div
                className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--slate)', fontFamily: 'var(--font-sans)' }}
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
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                    active ? 'font-medium' : ''
                  }`}
                  style={{
                    backgroundColor: active ? 'var(--teal-light, rgba(45,138,138,0.1))' : 'transparent',
                    color: active ? 'var(--teal)' : 'var(--ink-light, #4a5568)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} />
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
        {/* Back to website */}
        <Link
          to="/"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
          style={{ color: 'var(--slate)', fontFamily: 'var(--font-sans)' }}
          title={collapsed ? 'Back to Website' : undefined}
        >
          <ExternalLink size={16} />
          {!collapsed && <span>Back to Website</span>}
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm w-full transition-colors"
          style={{ color: 'var(--slate)' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span style={{ fontFamily: 'var(--font-sans)' }}>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
