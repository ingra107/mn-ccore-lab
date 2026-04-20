import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import HeartbeatLine from './HeartbeatLine'

/**
 * RequireAuth — route guard + branded sign-in wall.
 *
 * Renders {children} when authenticated. When VITE_REQUIRE_AUTH=1 OR
 * `?strict=1` is in the URL and the user has no Cloudflare Access cookie,
 * shows a full-bleed branded splash (deep neutral bg, gold heartbeat motif,
 * single CF Access CTA). Until the team launch flag is flipped, this guard
 * is effectively a no-op for portal traffic.
 *
 * The splash always renders against a fixed dark surface regardless of the
 * viewer's chosen theme — the sign-in gate is treated as the front door of
 * the lab, not a themed page.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  const enforce =
    import.meta.env.VITE_REQUIRE_AUTH === '1' ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('strict') === '1')

  if (!enforce) return <>{children}</>

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1017',
          color: '#e2e8f0',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
        }}
      >
        <span style={{ opacity: 0.55 }}>Checking your session…</span>
      </div>
    )
  }

  if (!isAuthenticated) return <SignInWall />

  return <>{children}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in wall

function SignInWall() {
  // Preserve the deep-link the user was trying to reach so CF Access can
  // bounce them back after auth. CF Access reads `redirect_url` on the
  // login endpoint.
  const returnTo =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/dashboard'
  const loginHref = `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(returnTo)}`

  return (
    <main
      role="main"
      aria-labelledby="signin-title"
      style={{
        minHeight: '100vh',
        background: '#0b1017',
        // Subtle radial vignette — pulls the eye to center without competing
        // with the logo. Layered on top of the flat #0b1017 base.
        backgroundImage:
          'radial-gradient(ellipse 60% 50% at 50% 35%, rgba(201, 168, 76, 0.08), transparent 70%), radial-gradient(ellipse 80% 60% at 50% 100%, rgba(13, 111, 104, 0.06), transparent 70%)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Wordmark — inline SVG so we control fill against the dark bg */}
        <Wordmark />

        {/* Tagline */}
        <p
          style={{
            marginTop: 20,
            marginBottom: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: '#e2e8f0',
            opacity: 0.7,
            letterSpacing: '0.01em',
            maxWidth: 360,
          }}
        >
          Research operations for the Minnesota Critical Care Outcomes &amp; Research Effort.
          Where studies get managed, meetings get run, and the lab moves together.
        </p>

        {/* Heartbeat motif — ambient, ~30bpm (slow variant doubles duration) */}
        <div
          aria-hidden="true"
          style={{
            marginTop: 24,
            marginBottom: 32,
            width: '100%',
            maxWidth: 360,
            height: 48,
            opacity: 0.85,
          }}
        >
          <HeartbeatLine
            variant="slow"
            color="#c9a84c"
            strokeWidth={1.5}
            width="100%"
            height={48}
          />
        </div>

        {/* Primary CTA */}
        <a
          href={loginHref}
          data-testid="signin-cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            maxWidth: 320,
            padding: '14px 24px',
            borderRadius: 'var(--radius-lg, 8px)',
            background: '#c9a84c',
            color: '#1a1a1a',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.01em',
            textDecoration: 'none',
            border: '1px solid rgba(201, 168, 76, 0.6)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(201,168,76,0.18)',
            transition: 'transform 150ms var(--ease-out, ease-out), box-shadow 150ms var(--ease-out, ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow =
              '0 1px 0 rgba(255,255,255,0.12) inset, 0 12px 28px rgba(201,168,76,0.28)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow =
              '0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(201,168,76,0.18)'
          }}
        >
          <ShieldIcon />
          Sign in with your @umn.edu account
        </a>

        {/* What you'll get — calm 3-bullet list */}
        <div
          style={{
            marginTop: 36,
            paddingTop: 24,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            textAlign: 'left',
            maxWidth: 360,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#e2e8f0',
              opacity: 0.55,
            }}
          >
            What you&rsquo;ll get
          </p>
          <FeatureRow
            label="Tasks"
            detail="Your queue, your meetings, your deadlines — in one place."
          />
          <FeatureRow
            label="Meetings"
            detail="Agendas, action items, and notes flowing back to the team."
          />
          <FeatureRow
            label="Lab knowledge"
            detail="Projects, manuscripts, and decisions — searchable and shared."
          />
        </div>

        {/* Back to public */}
        <div style={{ marginTop: 28 }}>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: '#5cbcb4',
              opacity: 0.85,
              textDecoration: 'none',
              borderBottom: '1px solid transparent',
              transition: 'opacity 150ms ease-out, border-color 150ms ease-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.borderBottomColor = 'currentColor'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.85'
              e.currentTarget.style.borderBottomColor = 'transparent'
            }}
          >
            ← Back to the public site
          </a>
        </div>
      </div>

      {/* Footer attribution */}
      <footer
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 11,
          letterSpacing: '0.04em',
          color: '#e2e8f0',
          opacity: 0.4,
          padding: '0 24px',
        }}
      >
        PI: Nicholas Ingraham, MD &middot; UMN Pulmonary &amp; Critical Care
      </footer>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components

/**
 * Wordmark — inline copy of public/logos/mnccore-logo-dark.svg, rebuilt as
 * inline JSX so the fill colors live alongside the splash and don't depend
 * on a network fetch + CSS color-inversion at first paint.
 */
function Wordmark() {
  return (
    <svg
      viewBox="0 0 600 120"
      fill="none"
      role="img"
      aria-labelledby="signin-title"
      style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block' }}
    >
      <title id="signin-title">MN-CCORE Lab Hub</title>
      <defs>
        <linearGradient id="signin-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c9a84c" />
          <stop offset="50%" stopColor="#dbb960" />
          <stop offset="100%" stopColor="#c9a84c" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="82"
        fontFamily="'Fraunces', Georgia, serif"
        fontWeight="800"
        fontSize="72"
        fill="#e2e8f0"
        letterSpacing="-1"
      >
        MN
      </text>
      <path
        d="M 118 60 L 135 60 L 142 35 L 149 85 L 156 45 L 163 65 L 170 55 L 185 55"
        stroke="url(#signin-shimmer)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <text
        x="190"
        y="82"
        fontFamily="'Fraunces', Georgia, serif"
        fontWeight="800"
        fontSize="72"
        fill="#e2e8f0"
        letterSpacing="-1"
      >
        CCORE
      </text>
      <text
        x="0"
        y="112"
        fontFamily="'DM Sans', Helvetica, sans-serif"
        fontWeight="400"
        fontSize="14"
        fill="#b0b5b9"
        letterSpacing="3.5"
      >
        MINNESOTA CRITICAL CARE OUTCOMES &amp; RESEARCH EFFORT
      </text>
    </svg>
  )
}

function FeatureRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          marginTop: 7,
          width: 4,
          height: 4,
          borderRadius: 'var(--radius-circle, 50%)',
          background: '#c9a84c',
          opacity: 0.7,
          flexShrink: 0,
        }}
      />
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#e2e8f0' }}>
        <span style={{ fontWeight: 500 }}>{label}.</span>{' '}
        <span style={{ opacity: 0.7 }}>{detail}</span>
      </p>
    </div>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
