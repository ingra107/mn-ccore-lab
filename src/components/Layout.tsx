import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Sun, Moon, ChevronUp } from 'lucide-react'
import { useDarkMode } from '../hooks/useDarkMode'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/nick', label: 'Nick Ingraham' },
  { to: '/nate', label: 'Nathan Mesfin' },
  { to: '/publications', label: 'Publications' },
  { to: '/contact', label: 'Contact' },
]

export default function Layout() {
  const { isDark, toggle } = useDarkMode()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
      setShowScrollTop(window.scrollY > 600)
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
              : 'rgba(250, 248, 243, 0.85)'
            : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(201, 168, 76, 0.2)' : 'none',
          padding: scrolled ? '8px 0' : '16px 0',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
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
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="cursor-pointer px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                style={{
                  fontFamily: 'var(--font-body)',
                  color:
                    location.pathname === link.to
                      ? 'var(--gold)'
                      : 'var(--slate)',
                  borderBottom:
                    location.pathname === link.to
                      ? '2px solid var(--gold)'
                      : '2px solid transparent',
                }}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={toggle}
              className="ml-4 p-2 rounded-md cursor-pointer transition-colors duration-200"
              style={{ color: 'var(--slate)' }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex lg:hidden items-center gap-2">
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
            maxHeight: menuOpen ? '400px' : '0',
            opacity: menuOpen ? 1 : 0,
            background: isDark
              ? 'rgba(15, 25, 35, 0.95)'
              : 'rgba(250, 248, 243, 0.95)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-3 rounded-md cursor-pointer text-base font-medium transition-colors duration-200"
                style={{
                  fontFamily: 'var(--font-body)',
                  color:
                    location.pathname === link.to
                      ? 'var(--gold)'
                      : 'var(--ink)',
                  background:
                    location.pathname === link.to
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
      <main id="main-content" className={`flex-1 ${isHome ? '' : 'pt-20'}`}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        style={{
          background: isDark ? '#0a1118' : 'var(--ink)',
          color: 'var(--cream)',
          borderTop: '2px solid var(--gold)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Column 1: About */}
            <div>
              <h3
                className="text-lg font-bold mb-4 tracking-wider"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#faf8f3',
                }}
              >
                MN-CCORE
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'rgba(250, 248, 243, 0.7)' }}
              >
                Minnesota Critical Care Outcomes & Research Effort
              </p>
              <p
                className="text-sm mt-2"
                style={{ color: 'rgba(250, 248, 243, 0.5)' }}
              >
                University of Minnesota
                <br />
                Department of Medicine
                <br />
                Division of Pulmonary, Allergy, Critical Care & Sleep Medicine
              </p>
              <p
                className="text-sm mt-2"
                style={{ color: 'rgba(250, 248, 243, 0.5)' }}
              >
                Mayo Memorial Building
                <br />
                420 Delaware St SE
                <br />
                Minneapolis, MN 55455
              </p>
            </div>

            {/* Column 2: Quick Links */}
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#faf8f3',
                }}
              >
                Quick Links
              </h3>
              <ul className="space-y-2">
                {navLinks.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(250, 248, 243, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(250, 248, 243, 0.7)')
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Affiliates */}
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#faf8f3',
                }}
              >
                Affiliates
              </h3>
              <ul className="space-y-2">
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
                      style={{ color: 'rgba(250, 248, 243, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(250, 248, 243, 0.7)')
                      }
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4: Social */}
            <div>
              <h3
                className="text-lg font-bold mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: '#faf8f3',
                }}
              >
                Social
              </h3>
              <ul className="space-y-2">
                {[
                  { label: 'Google Scholar', href: 'https://scholar.google.com/' },
                  { label: 'ORCID', href: 'https://orcid.org/' },
                  { label: 'GitHub', href: 'https://github.com/' },
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm cursor-pointer transition-colors duration-200"
                      style={{ color: 'rgba(250, 248, 243, 0.7)' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = '#c9a84c')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(250, 248, 243, 0.7)')
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
              color: 'rgba(250, 248, 243, 0.4)',
            }}
          >
            &copy; {new Date().getFullYear()} MN-CCORE Lab, University of
            Minnesota. All rights reserved.
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
