import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, ChevronUp } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { AnimatePresence } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import ThemeMenu from './ThemeMenu'
import { useAuth } from '../hooks/useAuth'
import PageTransition from './PageTransition'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, PANEL_BG, withAlpha } from '../lib/taskGrouping'
import { PATHS, PUBLIC_PATHS } from '../constants/paths'
import { memberHubTarget } from '../lib/memberHubTarget'

// Public nav (2026-10-09): Home, Team, Publications, Member Hub, Contact.
// "Member Hub" replaced the "Research" dropdown (Nick: "it should be after
// publications and before contact ... like with university websites where
// there's ... tabs where it takes you to a login page"). Where it goes
// depends on who is looking: memberHubTarget().
const navLinks: { to: string; label: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/publications', label: 'Publications' },
  { to: '/contact', label: 'Contact' },
]

// Footer "Member Hub" column — the Hub's main pages (redirect-free paths).
const footerHubLinks = [
  { to: PATHS.dashboard, label: 'Today' },
  { to: PATHS.myTasks, label: 'Tasks' },
  { to: PATHS.projects, label: 'Projects' },
  { to: PATHS.meetings, label: 'Meetings' },
  { to: PATHS.library, label: 'Library' },
]

const footerQuickLinks = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/nick', label: 'Ingraham Lab' },
  { to: '/nate', label: 'Mesfin Lab' },
  { to: '/publications', label: 'Publications' },
  { to: '/network', label: 'Network' },
  { to: '/contact', label: 'Contact' },
]

export default function Layout() {
  const { isDark } = useDarkMode()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const location = useLocation()
  const hub = memberHubTarget({ isLoading: authLoading, isAuthenticated, isMember: user?.isMember ?? false })
  const hubActive = location.pathname === PUBLIC_PATHS.join

  // Close menus on route change, adjusted during render (React's "adjusting
  // state when a prop changes" pattern) rather than an effect.
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    // Delay scroll to avoid conflict with IntersectionObserver initialization
    const timer = setTimeout(() => window.scrollTo(0, 0), 50)
    return () => clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
      setShowScrollTop(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Homepage hero is full-bleed, so no top padding needed there
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded"
        style={{ background: 'var(--gold)', color: 'var(--cream)' }}
      >
        Skip to content
      </a>

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled
            ? isDark
              ? withAlpha(PANEL_BG, 85)
              : 'rgba(255, 255, 255, 0.85)'
            : isHome
              ? 'rgba(0, 0, 0, 0.3)'
              : 'transparent',
          backdropFilter: scrolled || isHome ? 'blur(8px)' : 'none',
          WebkitBackdropFilter: scrolled || isHome ? 'blur(8px)' : 'none',
          borderBottom: scrolled ? `1px solid ${withAlpha(ACCENT_GOLD, 20)}` : isHome ? '1px solid var(--border-subtle)' : 'none',
          padding: scrolled ? '10px 0' : '16px 0',
        }}
      >
        <div className="content-container flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3 cursor-pointer"
            style={{ textDecoration: 'none' }}
          >
            {/* Desktop: full SVG logo */}
            <img
              src={isDark ? '/logos/mnccore-logo-dark.svg' : '/logos/mnccore-logo-primary.svg'}
              alt="MN-CCORE"
              className="hidden sm:block transition-all duration-300"
              style={{
                height: scrolled ? '32px' : '38px',
              }}
            />
            {/* Mobile: compact mark */}
            <img
              src="/logos/mnccore-logo-mark.svg"
              alt="MN-CCORE"
              className="block sm:hidden transition-all duration-300"
              style={{
                height: scrolled ? '32px' : '36px',
                filter: isDark ? 'invert(1) brightness(1.5)' : 'none',
              }}
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-6">
            {/* Home */}
            <Link
              to="/"
              className="cursor-pointer py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap"
              style={{
                color: location.pathname === '/' ? 'var(--gold)' : 'var(--slate)',
                borderBottom: location.pathname === '/' ? '2px solid var(--gold)' : '2px solid transparent',
              }}
            >
              Home
            </Link>

            {/* Remaining top-level links, Member Hub before Contact */}
            {navLinks.filter((link) => link.to !== '/').map((link) => {
              const style = (active: boolean) => ({
                color: active ? 'var(--gold)' : 'var(--slate)',
                borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
              })
              const cls = 'cursor-pointer py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap'
              return (
                <span key={`${link.to}-${link.label}`} className="contents">
                  {link.to === '/contact' && (
                    hub.external
                      ? <a href={hub.href} className={cls} style={style(false)} data-testid="member-hub-link">Member Hub</a>
                      : <Link to={hub.href} className={cls} style={style(hubActive)} data-testid="member-hub-link">Member Hub</Link>
                  )}
                  <Link to={link.to} className={cls} style={style(location.pathname === link.to)}>
                    {link.label}
                  </Link>
                </span>
              )
            })}
            <NotificationBell />
            <ThemeMenu />
          </div>

          {/* Mobile menu button */}
          <div className="flex lg:hidden items-center gap-2">
            <NotificationBell />
            <ThemeMenu />
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-md cursor-pointer"
              style={{ color: 'var(--ink)' }}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className="lg:hidden overflow-hidden transition-all duration-300"
          style={{
            maxHeight: menuOpen ? '600px' : '0',
            opacity: menuOpen ? 1 : 0,
            background: isDark
              ? withAlpha(PANEL_BG, 95)
              : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="px-4 py-4 space-y-1">
            {/* Home */}
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 rounded-md cursor-pointer text-base font-medium transition-colors duration-200"
              style={{
                color: location.pathname === '/' ? 'var(--gold)' : 'var(--ink)',
                background: location.pathname === '/' ? 'var(--gold-active)' : 'transparent',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Home
            </Link>

            {/* Remaining top-level links, Member Hub before Contact */}
            {navLinks.filter((link) => link.to !== '/').map((link) => {
              const style = (active: boolean) => ({
                color: active ? 'var(--gold)' : 'var(--ink)',
                background: active ? 'var(--gold-active)' : 'transparent',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              })
              const cls = 'block px-4 py-3 rounded-md cursor-pointer text-base font-medium transition-colors duration-200'
              return (
                <span key={`mobile-${link.to}-${link.label}`} className="contents">
                  {link.to === '/contact' && (
                    hub.external
                      ? <a href={hub.href} className={cls} style={style(false)}>Member Hub</a>
                      : <Link to={hub.href} onClick={() => setMenuOpen(false)} className={cls} style={style(hubActive)}>Member Hub</Link>
                  )}
                  <Link to={link.to} onClick={() => setMenuOpen(false)} className={cls} style={style(location.pathname === link.to)}>
                    {link.label}
                  </Link>
                </span>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main content — add top padding for non-home pages to clear sticky nav */}
      <main id="main-content" className="flex-1" style={isHome ? undefined : { paddingTop: '64px' }}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: isDark ? '#0a1118' : 'var(--ink)',
          color: 'var(--cream)',
          borderTop: '2px solid var(--gold)',
        }}
      >
        <div className="content-container py-8 md:py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
            {/* Column 1: About */}
            <div className="lg:col-span-2">
              <h3
                className="text-lg font-normal mb-4 tracking-wider"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-bright, #fff)',
                }}
              >
                MN-CCORE
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'rgba(255, 255, 255, 0.7)' }}
              >
                Minnesota Critical Care Outcomes & Research Effort
              </p>
              <p
                className="text-sm mt-2"
                style={{ color: 'rgba(255, 255, 255, 0.5)' }}
              >
                University of Minnesota
                <br />
                Department of Medicine
                <br />
                Division of Pulmonary, Allergy, Critical Care & Sleep Medicine
              </p>
              <p
                className="text-sm mt-2"
                style={{ color: 'rgba(255, 255, 255, 0.5)' }}
              >
                Mayo Memorial Building
                <br />
                420 Delaware St SE
                <br />
                Minneapolis, MN 55455
              </p>
            </div>

            {/* Column 2: Member Hub (the Hub's main pages) */}
            <div>
              <h3
                className="text-lg font-normal mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-bright, #fff)',
                }}
              >
                Member Hub
              </h3>
              <ul className="space-y-3">
                {footerHubLinks.map((link) => (
                  <li key={`footer-hub-${link.to}`}>
                    <Link
                      to={link.to}
                      className="text-sm cursor-pointer transition-colors duration-200 hov-color"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', '--hov-color': 'var(--gold)' } as React.CSSProperties}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Quick Links */}
            <div>
              <h3
                className="text-lg font-normal mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-bright, #fff)',
                }}
              >
                Quick Links
              </h3>
              <ul className="space-y-3">
                {footerQuickLinks.map((link) => (
                  <li key={`footer-${link.to}-${link.label}`}>
                    <Link
                      to={link.to}
                      className="text-sm cursor-pointer transition-colors duration-200 hov-color"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', '--hov-color': 'var(--gold)' } as React.CSSProperties}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4: Affiliates & Social */}
            <div>
              <h3
                className="text-lg font-normal mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-bright, #fff)',
                }}
              >
                Affiliates
              </h3>
              <ul className="space-y-3">
                {[
                  { label: 'CLIF Consortium', href: 'https://clif-icu.com/' },
                  {
                    label: 'CLIF GitHub',
                    href: 'https://github.com/Common-Longitudinal-ICU-data-Format',
                  },
                  {
                    label: 'UMN Department of Medicine',
                    href: 'https://med.umn.edu/dom',
                  },
                  {
                    label: 'Parker Healthcare Allocation Lab',
                    href: 'https://healthcare-allocation-lab.github.io/',
                  },
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm cursor-pointer transition-colors duration-200 hov-color"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', '--hov-color': 'var(--gold)' } as React.CSSProperties}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <h3
                className="text-lg font-normal mb-4 mt-6"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--ink-bright, #fff)',
                }}
              >
                Social
              </h3>
              <ul className="space-y-3">
                {[
                  { label: 'Google Scholar', href: 'https://scholar.google.com/citations?user=ZKMVVHkAAAAJ&hl=en' },
                  { label: 'GitHub', href: 'https://github.com/ingra107' },
                  { label: 'CLIF GitHub', href: 'https://github.com/Common-Longitudinal-ICU-data-Format' },
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm cursor-pointer transition-colors duration-200 hov-color"
                      style={{ color: 'rgba(255, 255, 255, 0.7)', '--hov-color': 'var(--gold)' } as React.CSSProperties}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="mt-8 md:mt-12 pt-6 md:pt-8 text-center text-xs"
            style={{
              borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
              color: 'rgba(255, 255, 255, 0.75)',
            }}
          >
            &copy; {new Date().getFullYear()} MN-CCORE Lab, University of
            Minnesota. All rights reserved.
            <div
              style={{
                fontSize: '10px',
                opacity: 0.75,
                marginTop: '6px',
              }}
            >
              Built with React, Cloudflare, and Claude
            </div>
          </div>
        </div>
      </footer>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 rounded-full cursor-pointer transition-all duration-200 z-40"
          style={{
            background: 'var(--gold)',
            color: 'var(--cream)',
            boxShadow: 'var(--shadow-card)',
          }}
          aria-label="Scroll to top"
        >
          <ChevronUp {...ICON_PROPS} size={20} />
        </button>
      )}
    </div>
  )
}
