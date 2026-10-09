import { Link, useLocation } from 'react-router-dom'
import EmptyStateArt from '../components/EmptyStateArt'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { usePageMeta } from '../hooks/usePageMeta'

/**
 * The page for a path no route owns (2026-10-08). It replaced a catch-all
 * redirect to /portal/dashboard, which sent a mistyped public URL into the
 * sign-in wall and a signed-in non-member into a portal they cannot use.
 * Same anatomy as EntityNotFound (art, a plain line, two onward actions).
 */
export default function NotFound() {
  const { pathname } = useLocation()
  const { isAuthenticated, isLoading, user } = useAuth()
  usePageMeta('Page not found | MN-CCORE Lab', 'This page does not exist.')

  // A member gets a way into the Hub; anyone else gets sign-in (CF Access
  // gates /portal/*, so the link IS the sign-in for a logged-out visitor).
  const inHub = !isLoading && isAuthenticated && user.isMember

  return (
    <section className="content-container" data-testid="not-found" style={{ paddingTop: '3rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: 440 }}>
        <EmptyStateArt variant="generic" style={{ marginBottom: '1.25rem', opacity: 0.6 }} />
        <h1
          className="text-2xl sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.5rem' }}
        >
          Page not found
        </h1>
        <p style={{ color: 'var(--slate)', marginBottom: '1.5rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          Nothing lives at <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{pathname}</span>. The link may be
          old or mistyped.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            as={Link}
            to="/"
            variant="primary"
            style={{ padding: '8px 14px', fontSize: '0.875rem', fontWeight: 500, borderRadius: 'var(--radius-lg)', textDecoration: 'none' }}
          >
            Go to the home page
          </Button>
          {/* A full page load, not a router push: Cloudflare Access only sees
              a real navigation to /portal/*. */}
          <Button
            as="a"
            href="/portal/dashboard"
            data-testid="not-found-hub"
            variant="secondary"
            style={{ padding: '8px 14px', fontSize: '0.875rem', fontWeight: 400, borderRadius: 'var(--radius-lg)', color: 'var(--ink)', textDecoration: 'none' }}
          >
            {inHub ? 'Open the Hub' : 'Sign in'}
          </Button>
        </div>
      </div>
    </section>
  )
}
