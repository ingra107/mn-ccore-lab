import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import HeartbeatLine from './HeartbeatLine'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'
import JoinSteps from './JoinSteps'

/**
 * RequireAuth — route guard + branded sign-in wall + members-only wall.
 *
 * Renders {children} when authenticated. When VITE_REQUIRE_AUTH=1 OR
 * `?strict=1` is in the URL and the user has no Cloudflare Access cookie,
 * shows a full-bleed branded splash (deep neutral bg, gold heartbeat motif,
 * single CF Access CTA). Until the team launch flag is flipped, this guard
 * is effectively a no-op for portal traffic.
 *
 * A signed-in non-member (2026-10-08: CF Access admits any @umn.edu account,
 * and the Worker answered isMember: false) gets the members-only wall
 * instead of the portal, flag or no flag: every member API answers them 403,
 * so the portal would only be a page of errors.
 *
 * The splash always renders against a fixed dark surface regardless of the
 * viewer's chosen theme — the sign-in gate is treated as the front door of
 * the lab, not a themed page.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth()

  const enforce =
    import.meta.env.VITE_REQUIRE_AUTH === '1' ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('strict') === '1')

  if (!isLoading && isAuthenticated && !user.isMember) {
    return <MembersOnlyWall email={user.email} name={user.name ?? ''} />
  }

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
        <span style={{ opacity: 0.85 }}>Checking your session…</span>
      </div>
    )
  }

  if (!isAuthenticated) return <SignInWall />

  return <>{children}</>
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in wall

function SignInWall() {
  // Sign in = a FULL page load (GoldCta is a plain <a>) of the page the user
  // was trying to reach. The Cloudflare Access policy on /portal/* answers it
  // with a 302 to the Access login, which returns them to that same page.
  // It used to link /cdn-cgi/access/login?redirect_url=... on our own host,
  // which is a live 404 (measured 2026-10-09). Bare /portal (and anything
  // else outside /portal/*) is NOT under the policy (live 200), so it falls
  // back to Today, which is.
  const here =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : ''
  const loginHref = here.startsWith('/portal/') ? here : '/portal/dashboard'

  return (
    <GateShell>
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
      <GoldCta href={loginHref} testId="signin-cta">
        <ShieldIcon />
        Sign in with your @umn.edu account
      </GoldCta>

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
            opacity: 0.85,
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

      <BackToPublic />
    </GateShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Members-only wall (2026-10-08)

function MembersOnlyWall({ email, name }: { email: string; name: string }) {
  return (
    <GateShell testId="members-only">
      <p
        style={{
          marginTop: 28,
          marginBottom: 0,
          fontSize: 15,
          lineHeight: 1.6,
          color: '#e2e8f0',
          maxWidth: 380,
        }}
      >
        This is a place for MN-CCORE members only. Here is how to join.
      </p>

      {/* The same join instructions as the public /join page (one copy:
          JoinSteps). Nick: a signed-in non-member is kindly told how to join. */}
      <div style={{ marginTop: 28, width: '100%' }}>
        <JoinSteps email={email} name={name} tone="dark" />
      </div>

      {email && (
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: '#e2e8f0', opacity: 0.75, overflowWrap: 'anywhere' }}>
          Signed in as {email}.{' '}
          <a href="/cdn-cgi/access/logout" style={{ color: '#5cbcb4', textDecoration: 'none' }}>
            Use a different account
          </a>
        </p>
      )}

      <BackToPublic />
    </GateShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell + controls

/** The full-bleed dark front door both walls stand in: wordmark on top, the
 *  wall's own content, the PI attribution at the foot. */
function GateShell({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <main
      role="main"
      aria-labelledby="signin-title"
      data-testid={testId}
      style={{
        minHeight: '100vh',
        background: '#0b1017',
        // Subtle radial vignette — pulls the eye to center without competing
        // with the logo. Layered on top of the flat #0b1017 base.
        backgroundImage:
          `radial-gradient(ellipse 60% 50% at 50% 35%, ${withAlpha(ACCENT_GOLD, 8)}, transparent 70%), radial-gradient(ellipse 80% 60% at 50% 100%, rgba(13, 111, 104, 0.06), transparent 70%)`,
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
        {children}
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
          opacity: 0.8,
          padding: '0 24px',
        }}
      >
        PI: Nicholas Ingraham, MD &middot; UMN Pulmonary &amp; Critical Care
      </footer>
    </main>
  )
}

function GoldCta({ href, testId, children }: { href: string; testId: string; children: ReactNode }) {
  return (
    <a
      href={href}
      data-testid={testId}
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
        border: `1px solid ${withAlpha(ACCENT_GOLD, 60)}`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px ${withAlpha(ACCENT_GOLD, 18)}`,
        transition: 'transform 150ms var(--ease-out, ease-out), box-shadow 150ms var(--ease-out, ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow =
          `0 1px 0 rgba(255,255,255,0.12) inset, 0 12px 28px ${withAlpha(ACCENT_GOLD, 28)}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow =
          `0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px ${withAlpha(ACCENT_GOLD, 18)}`
      }}
    >
      {children}
    </a>
  )
}

function BackToPublic() {
  return (
    <div style={{ marginTop: 28 }}>
      <a
        href="/"
        className="hov-opacity hov-border"
        style={{
          fontSize: 13,
          color: '#5cbcb4',
          opacity: 0.85,
          textDecoration: 'none',
          borderBottom: '1px solid transparent',
          transition: 'opacity 150ms ease-out, border-color 150ms ease-out',
          '--hov-opacity': '1',
          '--hov-border': 'currentColor',
        } as React.CSSProperties}
      >
        ← Back to the public site
      </a>
    </div>
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
