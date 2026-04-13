import { Link, useLocation } from 'react-router-dom'
import { Home, ListChecks, FolderKanban, Search } from 'lucide-react'

/**
 * Mobile bottom tab bar — halves taps to the 4 most-used routes vs hamburger.
 * Hidden on tablet/desktop via `md:hidden`. Respects safe-area-inset-bottom
 * (effective once PWA viewport-fit=cover ships).
 */
export default function MobileTabBar() {
  const { pathname } = useLocation()
  const tabs = [
    { to: '/dashboard', icon: Home, label: 'Home' },
    { to: '/my-tasks', icon: ListChecks, label: 'Tasks' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/search', icon: Search, label: 'Search' },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch justify-around border-t"
      style={{
        zIndex: 'var(--z-sidebar)',
        backgroundColor: 'var(--surface-1)',
        borderColor: 'var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        backdropFilter: 'blur(8px)',
      }}
      aria-label="Primary navigation"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        // Reactive: pathname from useLocation() updates on every client-side nav (C7 audit)
        const active = pathname === tab.to || pathname.startsWith(tab.to + '/')
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-col items-center justify-center flex-1"
            style={{
              minHeight: 56,
              paddingTop: 'var(--sp-sm)',
              paddingBottom: 'var(--sp-sm)',
              color: active ? 'var(--teal)' : 'var(--ink-muted)',
              textDecoration: 'none',
              fontWeight: active ? 500 : 400,
            }}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <Icon size={20} aria-hidden="true" />
            <span style={{ fontSize: 'var(--text-micro)', marginTop: 2 }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
