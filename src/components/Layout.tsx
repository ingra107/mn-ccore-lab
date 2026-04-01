import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Sun, Moon, ChevronUp, ChevronDown } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { AnimatePresence } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import { useTasks, useMeetingsApi } from '../hooks/useApiData'
import PageTransition from './PageTransition'

const navLinks: { to: string; label: string; isJoin?: boolean }[] = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/publications', label: 'Publications' },
  { to: '/contact', label: 'Join', isJoin: true },
  { to: '/contact', label: 'Contact' },
]

const researchDropdownLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/my-items', label: 'My Items' },
  { to: '/projects', label: 'Projects' },
  { to: '/grants', label: 'Grants' },
  { to: '/network', label: 'Network' },
  { to: '/meetings', label: 'Meetings' },
  { to: '/digest', label: 'Digest' },
]

// Footer link groups
const footerResearchLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/projects', label: 'Projects' },
  { to: '/grants', label: 'Grants' },
  { to: '/meetings', label: 'Meetings' },
  { to: '/digest', label: 'Digest' },
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
  const { isDark, toggle } = useDarkMode()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [mobileResearchOpen, setMobileResearchOpen] = useState(false)
  const researchRef = useRef<HTMLDivElement>(null)
  const researchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  // Task badge count (pending only, already deduped by useTasks hook)
  const { data: tasks = [] } = useTasks()
  const pendingCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks])

  // Next upcoming meeting
  const { data: meetings = [] } = useMeetingsApi()
  const nextMeetingLabel = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = meetings
      .filter((m) => m.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (upcoming.length === 0) return null
    const d = new Date(upcoming[0].date + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }, [meetings])

  const isResearchActive = researchDropdownLinks.some(
    (link) => location.pathname === link.to
  )

  const handleResearchEnter = useCallback(() => {
    if (researchTimeoutRef.current) {
      clearTimeout(researchTimeoutRef.current)
      researchTimeoutRef.current = null
    }
    setResearchOpen(true)
  }, [])

  const handleResearchLeave = useCallback(() => {
    researchTimeoutRef.current = setTimeout(() => {
      setResearchOpen(false)
    }, 150)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setResearchOpen(false)
    setMobileResearchOpen(false)
    // Delay scroll to avoid conflict with IntersectionObserver initialization
    const timer = setTimeout(() => window.scrollTo(0, 0), 50)
    return () => clearTimeout(timer)
  }, [location.pathname])

  // Close desktop dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (researchRef.current && !researchRef.current.contains(e.target as Node)) {
        setResearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
              ? 'rgba(15, 25, 35, 0.85)'
              : 'rgba(255, 255, 255, 0.85)'
            : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(201, 168, 76, 0.2)' : 'none',
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
                fontFamily: 'var(--font-body)',
                color: location.pathname === '/' ? 'var(--gold)' : 'var(--slate)',
                borderBottom: location.pathname === '/' ? '2px solid var(--gold)' : '2px solid transparent',
              }}
            >
              Home
            </Link>

            {/* Research Dropdown */}
            <div
              ref={researchRef}
              className="relative"
              onMouseEnter={handleResearchEnter}
              onMouseLeave={handleResearchLeave}
            >
              <button
                onClick={() => setResearchOpen(!researchOpen)}
                className="cursor-pointer py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap flex items-center gap-1"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: isResearchActive ? 'var(--gold)' : 'var(--slate)',
                  borderBottom: isResearchActive ? '2px solid var(--gold)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  borderBottomStyle: 'solid',
                  borderBottomWidth: '2px',
                  padding: '8px 0',
                }}
              >
                Research
                <ChevronDown
                  size={14}
                  className="transition-transform duration-200"
                  style={{
                    transform: researchOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>

              {/* Dropdown panel */}
              <div
                className="absolute top-full left-0 mt-1 py-2 rounded-lg"
                style={{
                  minWidth: '180px',
                  background: isDark ? 'rgba(15, 25, 35, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(201, 168, 76, 0.2)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                  opacity: researchOpen ? 1 : 0,
                  transform: researchOpen ? 'translateY(0)' : 'translateY(-4px)',
                  pointerEvents: researchOpen ? 'auto' : 'none',
                  transition: 'opacity 200ms ease, transform 200ms ease',
                }}
              >
                {researchDropdownLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-150"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: location.pathname === link.to ? 'var(--gold)' : 'var(--ink)',
                      borderLeft: location.pathname === link.to
                        ? '3px solid var(--gold)'
                        : '3px solid transparent',
                      background: location.pathname === link.to
                        ? 'rgba(201, 168, 76, 0.08)'
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                    onMouseEnter={(e) => {
                      if (location.pathname !== link.to) {
                        e.currentTarget.style.background = 'rgba(201, 168, 76, 0.06)'
                        e.currentTarget.style.borderLeftColor = 'rgba(201, 168, 76, 0.4)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (location.pathname !== link.to) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderLeftColor = 'transparent'
                      }
                    }}
                  >
                    <span>{link.label}</span>
                    {link.label === 'Dashboard' && pendingCount > 0 && (
                      <span
                        style={{
                          background: 'var(--maroon)',
                          color: '#fff',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          lineHeight: '16px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          animation: 'badge-pop 200ms ease-out',
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                    {link.label === 'Meetings' && nextMeetingLabel && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          color: 'var(--gold)',
                          opacity: 0.8,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nextMeetingLabel}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Remaining top-level links */}
            {navLinks.filter((link) => link.to !== '/').map((link) => (
              <Link
                key={`${link.to}-${link.label}`}
                to={link.to}
                className="cursor-pointer py-2 text-sm font-medium transition-colors duration-200 whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-body)',
                  color:
                    location.pathname === link.to && !link.isJoin
                      ? 'var(--gold)'
                      : 'var(--slate)',
                  borderBottom:
                    location.pathname === link.to && !link.isJoin
                      ? '2px solid var(--gold)'
                      : '2px solid transparent',
                }}
              >
                {link.label}
              </Link>
            ))}
            <NotificationBell />
            <button
              onClick={toggle}
              className="ml-2 p-2 rounded-md cursor-pointer transition-colors duration-200"
              style={{ color: 'var(--slate)' }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex lg:hidden items-center gap-2">
            <NotificationBell />
            <button
              onClick={toggle}
              className="p-2 rounded-md cursor-pointer"
              style={{ color: 'var(--slate)' }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
              ? 'rgba(15, 25, 35, 0.95)'
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
                fontFamily: 'var(--font-body)',
                color: location.pathname === '/' ? 'var(--gold)' : 'var(--ink)',
                background: location.pathname === '/' ? 'rgba(201, 168, 76, 0.1)' : 'transparent',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Home
            </Link>

            {/* Research section (collapsible) */}
            <button
              onClick={() => setMobileResearchOpen(!mobileResearchOpen)}
              className="w-full px-4 py-3 rounded-md cursor-pointer text-base font-medium transition-colors duration-200"
              style={{
                fontFamily: 'var(--font-body)',
                color: isResearchActive ? 'var(--gold)' : 'var(--ink)',
                background: isResearchActive ? 'rgba(201, 168, 76, 0.1)' : 'transparent',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
                textAlign: 'left',
              }}
            >
              Research
              <ChevronDown
                size={16}
                className="transition-transform duration-200"
                style={{
                  transform: mobileResearchOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  color: 'var(--slate)',
                }}
              />
            </button>

            {/* Research sub-items */}
            <div
              className="overflow-hidden transition-all duration-300"
              style={{
                maxHeight: mobileResearchOpen ? '300px' : '0',
                opacity: mobileResearchOpen ? 1 : 0,
              }}
            >
              {researchDropdownLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className="block py-2.5 rounded-md cursor-pointer text-sm font-medium transition-colors duration-200"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: location.pathname === link.to ? 'var(--gold)' : 'var(--ink)',
                    background: location.pathname === link.to ? 'rgba(201, 168, 76, 0.08)' : 'transparent',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingLeft: '24px',
                    paddingRight: '16px',
                    marginLeft: '16px',
                    borderLeft: location.pathname === link.to
                      ? '3px solid var(--gold)'
                      : '3px solid rgba(201, 168, 76, 0.2)',
                  }}
                >
                  <span>{link.label}</span>
                  {link.label === 'Dashboard' && pendingCount > 0 && (
                    <span
                      style={{
                        background: 'var(--maroon)',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        lineHeight: '16px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        animation: 'badge-pop 200ms ease-out',
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                  {link.label === 'Meetings' && nextMeetingLabel && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: 'var(--gold)',
                        opacity: 0.8,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nextMeetingLabel}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Remaining top-level links */}
            {navLinks.filter((link) => link.to !== '/').map((link) => (
              <Link
                key={`mobile-${link.to}-${link.label}`}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 rounded-md cursor-pointer text-base font-medium transition-colors duration-200"
                style={{
                  fontFamily: 'var(--font-body)',
                  color:
                    location.pathname === link.to && !link.isJoin
                      ? 'var(--gold)'
                      : 'var(--ink)',
                  background:
                    location.pathname === link.to && !link.isJoin
                      ? 'rgba(201, 168, 76, 0.1)'
                      : 'transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {link.label}
              </Link>
            ))}
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
                className="text-lg font-bold mb-4 tracking-wider"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#ffffff',
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

            {/* Column 2: Research Portal */}
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#ffffff',
                }}
              >
                Research Portal
              </h3>
              <ul className="space-y-3">
                {footerResearchLinks.map((link) => (
                  <li key={`footer-research-${link.to}`}>
                    <Link
                      to={link.to}
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)')
                      }
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
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#ffffff',
                }}
              >
                Quick Links
              </h3>
              <ul className="space-y-3">
                {footerQuickLinks.map((link) => (
                  <li key={`footer-${link.to}-${link.label}`}>
                    <Link
                      to={link.to}
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)')
                      }
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
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#ffffff',
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
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)')
                      }
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <h3
                className="text-lg font-bold mb-4 mt-6"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#ffffff',
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
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)')
                      }
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
              borderTop: '1px solid rgba(201, 168, 76, 0.2)',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            &copy; {new Date().getFullYear()} MN-CCORE Lab, University of
            Minnesota. All rights reserved.
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                opacity: 0.3,
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          aria-label="Scroll to top"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  )
}
