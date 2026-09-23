// TeamArtifactFrame — renders a content_type='html' artifact for
// /portal/artifacts/:id via the cookieless artifact origin's TEAM route
// (#2411, following #508's public-artifact origin split).
//
// Unlike HtmlArtifactFrame's blob:-url, opaque-origin embed (which stays the
// pattern for anything rendered directly on the Hub origin), this frame
// points `src` at a REAL url on a genuinely separate SITE:
//
//   https://mn-ccore-artifacts.pages.dev/a/team/:id
//
// `*.pages.dev` is on the Public Suffix List, so that host and
// mn-ccore-lab.pages.dev are different SITES — no Hub cookie (CF_Authorization)
// can ever reach it, by construction, regardless of the sandbox attribute
// below. That is what makes it safe to add `allow-same-origin` here (which
// would be a same-origin-stored-XSS-to-Hub-session bug on the Hub's own
// origin — see HtmlArtifactFrame.tsx, and its guard test, for why that
// component must NEVER get this token): `allow-same-origin` on a
// cross-SITE src grants the iframe access to ITS OWN origin's storage, not
// the Hub's. That is the one thing the old blob:-url embed could not give
// the working-desk kit (.claude/skills/working-desk-artifact/assets/deskkit.js)
// — real, persistent localStorage for marks/notes that survives a reload.
//
// `allow="clipboard-write"` on the iframe element delegates the Clipboard API
// permission across the cross-origin boundary, for deskkit's Copy-for-Claude
// button (clipboard access from a cross-origin iframe needs this Permissions
// Policy grant regardless of same-origin/opaque sandbox status).
//
// "Team-only" reachability is enforced by a Cloudflare Access application
// attached to /a/team/* on the artifacts origin (dashboard-side — see
// artifacts-site/functions/a/team/[id].ts) — this component does not (and
// cannot) enforce it; ArtifactPage only mounts it behind the Hub's own
// Access-gated /portal/* in the first place.
//
// Outbound-link retargeting (an <a href> inside the iframe navigating the
// frame away, eating the artifact) is handled SERVER-SIDE now — the served
// body carries the shim (api/routes/public-artifact.ts::OUTBOUND_LINK_SHIM)
// — so this component does not need HtmlArtifactFrame's client-side
// blob-prepend for that.
//
// ═══ THE LOGIN-LOOP FALLBACK (2026-09-23, following the 0e955794 deploy) ═══
//
// The Cloudflare Access application on /a/team/* (see the route handler's own
// comment) means this frame's `src` is behind a SEPARATE sign-in from the
// Hub's own /portal/* gate. A browser with no Access session for
// mn-ccore-artifacts.pages.dev navigates, inside the iframe, to Access's own
// login page — which sends `X-Frame-Options: DENY` / a framing CSP and
// refuses to render, leaving Chrome's broken-page icon in the artifact's
// place. One TOP-LEVEL visit to any /a/team/ URL completes Google SSO
// silently and the frame then works for the life of that Access session, but
// there is no way to tell "still signing in" from "signed in and broken" from
// inside this component without a signal FROM the loaded document.
//
// The server-side shim (READY_MESSAGE_SHIM in public-artifact.ts) supplies
// that signal: every successfully served team-artifact document posts
// TEAM_ARTIFACT_READY_MESSAGE once it loads. The Access login page is not
// that document — it never runs our script — so silence within a grace
// window after the iframe's own `load` event (or, if `load` never fires at
// all, within an absolute backstop) means the frame did NOT get the artifact.
// `event.origin` is checked exactly against the artifacts origin before the
// message is trusted, so nothing else on the page (or another embedded
// frame) can fake a ready signal.
//
// On that verdict a small notice + two affordances overlays the iframe
// (Nick's ask, verbatim): "Open to sign in" (a new tab at the same URL — Access
// happily renders top-level, and completes the SSO round trip) and "Retry"
// (reload the frame, which now carries whatever Access session that tab just
// established). The frame also retries on its own the moment the WINDOW
// regains focus (coming back from that sign-in tab), so the common path needs
// no click at all.
//
// The iframe itself is NEVER unmounted for this — only hidden (display:none)
// — so a ready message that arrives after the notice appears (a load that
// was merely slow, not actually stuck) still recovers automatically with no
// reload: the content was there the whole time.

import { useEffect, useRef, useState } from 'react'
import { PUBLIC_ARTIFACT_ORIGIN_FE, TEAM_ARTIFACT_READY_MESSAGE } from '../lib/artifactOrigin'

type Status = 'loading' | 'ready' | 'blocked'

const frameStyle = {
  width: '100%',
  minHeight: '70vh',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  background: '#fff',
} as const

export default function TeamArtifactFrame({
  id,
  title,
  // Test-only overrides — production callers never pass these. Real timers
  // (1.5s / 6s) would make every fallback-path test wait that long for no
  // benefit; the behavior under test is the STATE MACHINE, not the clock.
  readyGraceMs = 1500,
  absoluteTimeoutMs = 6000,
}: {
  id: string
  title: string
  readyGraceMs?: number
  absoluteTimeoutMs?: number
}) {
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const graceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const absoluteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Mirrors `status` for onFocus below, which needs to read the CURRENT value
  // from a plain event handler without putting a side effect (setAttempt)
  // inside a setStatus updater — React may invoke an updater twice (e.g.
  // StrictMode) to surface exactly that kind of impurity, which would double
  // the attempt bump.
  const statusRef = useRef<Status>(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])
  const src = `${PUBLIC_ARTIFACT_ORIGIN_FE}/a/team/${id}`

  // Listen for the ready message + run the absolute backstop timer. Re-armed
  // on every retry (attempt bump) and on an id change. Both callers that bump
  // `attempt` (retry() below, and the focus handler) already set status back
  // to 'loading' themselves before doing so — this effect only arms the
  // listener + timer for whatever status already is, it never resets it (a
  // synchronous setState here would cascade an extra render on every mount).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== PUBLIC_ARTIFACT_ORIGIN_FE) return
      // Origin alone does not identify THIS frame: two team desks on one page
      // share the artifacts origin, so each would accept the other's ready
      // message and could clear its own fallback while still at Access's
      // login page.
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data !== TEAM_ARTIFACT_READY_MESSAGE) return
      if (graceTimer.current) clearTimeout(graceTimer.current)
      if (absoluteTimer.current) clearTimeout(absoluteTimer.current)
      setStatus('ready')
    }
    window.addEventListener('message', onMessage)

    absoluteTimer.current = setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'blocked' : prev))
    }, absoluteTimeoutMs)

    return () => {
      window.removeEventListener('message', onMessage)
      if (graceTimer.current) clearTimeout(graceTimer.current)
      if (absoluteTimer.current) clearTimeout(absoluteTimer.current)
    }
  }, [id, attempt, absoluteTimeoutMs])

  // Retry automatically once the tab regains focus (the user coming back
  // from the "Open to sign in" tab) — the common path needs no click.
  useEffect(() => {
    function onFocus() {
      if (statusRef.current !== 'blocked') return
      setStatus('loading')
      setAttempt((a) => a + 1)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function retry() {
    setStatus('loading')
    setAttempt((a) => a + 1)
  }

  // The iframe's own `load` event fires for the Access login page too (it IS
  // a page, it DOES load) — that is exactly the case this grace window
  // catches: no ready message arrives shortly after, so the frame declares
  // itself blocked rather than waiting out the full absolute timeout.
  function handleIframeLoad() {
    if (graceTimer.current) clearTimeout(graceTimer.current)
    graceTimer.current = setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'blocked' : prev))
    }, readyGraceMs)
  }

  // The iframe stays MOUNTED (display:none, never removed from the DOM) even
  // while the fallback notice shows on top of it. Unmounting it on 'blocked'
  // was the actual bug: it destroys the iframe's browsing context, so a load
  // that just happens to be slower than absoluteTimeoutMs — not stuck at all,
  // just not finished yet — can never deliver its ready message once the
  // backstop fires; the frame is stuck showing a false "Sign in" forever.
  // Keeping it alive means a late ready message still wins, no reload
  // required: display flips back to visible with the content already there.
  return (
    <div style={frameStyle}>
      <iframe
        key={attempt}
        ref={iframeRef}
        title={`${title} (interactive artifact)`}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-write"
        src={src}
        onLoad={handleIframeLoad}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 'inherit',
          border: 'none',
          display: status === 'blocked' ? 'none' : 'block',
        }}
      />
      {status === 'blocked' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: 'var(--ink-secondary, #666)' }}>
            Sign in to view this artifact.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
            >
              Open to sign in
            </button>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
