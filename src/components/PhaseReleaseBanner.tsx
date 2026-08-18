/**
 * PhaseReleasePill — compact "what shipped" affordance in the portal top
 * bar. Downgraded from a full Dashboard banner (R4-10) — the banner
 * served us pre-launch but post-launch it read as noise on every portal
 * visit. The pill keeps the announcement, kills the vertical real
 * estate, and still persists dismissal via localStorage.
 *
 * Click → opens an inline highlight panel anchored below the pill.
 * X → dismisses permanently for that release id.
 *
 * Add new phases by appending to RELEASES below + bumping CURRENT_RELEASE.
 */
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

interface Release {
  id: string
  date: string
  title: string
  summary: string
  highlights: string[]
}

const RELEASES: Record<string, Release> = {
  'phase-36c': {
    id: 'phase-36c',
    date: '2026-04-20',
    title: 'Phase 36c — deep audit + 11 fixes',
    summary:
      'Four specialist auditors ran in parallel against live prod. Every P0 + P1 finding shipped in one sprint.',
    highlights: [
      'Routing fix — clicking a teammate from the portal keeps you in portal chrome',
      '/api/health 100ms → 64ms after schema-v46 added 7 missing indexes',
      '/api/version edge-cached (10s) — cuts 95% of polling traffic',
      'TaskDetailPanel focus trap snaps focus back from leaks; restores opener on close',
      'Mobile tab bar no longer covers content on calendar + project detail',
      'Hover-only badges hidden from screen readers (no more phantom announcements)',
    ],
  },
}

const CURRENT_RELEASE = 'phase-36c'
const STORAGE_KEY = 'mnccore-phase-banner-seen-v1'

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* localStorage unavailable */ }
  return new Set()
}

function persistDismissed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch { /* ignore */ }
}

export default function PhaseReleaseBanner() {
  const release = RELEASES[CURRENT_RELEASE]
  // `release` is a module-constant lookup (never changes post-mount) and
  // getDismissed() reads synchronously-available localStorage — decide
  // initial visibility via lazy init instead of an effect.
  const [visible, setVisible] = useState(() => {
    if (!release) return false
    return !getDismissed().has(release.id)
  })
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!expanded) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  if (!release || !visible) return null

  const dismiss = () => {
    setVisible(false)
    const dismissed = getDismissed()
    dismissed.add(release.id)
    persistDismissed(dismissed)
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Release notes — ${release.title}`}
        className="phase-pill"
      >
        <span className="phase-pill-dot" aria-hidden="true" />
        {/* #115: the pill used to read "Phase 36c shipped" — an internal phase
            number tells a reader nothing about what the control does. */}
        <span>What&rsquo;s new</span>
        <ChevronRight {...ICON_PROPS}
          size={12}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
            opacity: 0.7,
          }}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            role="dialog"
            aria-label="Release highlights"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              width: 340,
              padding: 'var(--sp-md)',
              // Rule 45: a floating panel must be FULLY OPAQUE. --surface-2 is
              // a tint meant to sit on top of an opaque surface — in dark mode
              // it is rgba(255,255,255,0.06), so the page showed straight
              // through this popover and the text was unreadable (#115). The
              // `var(--surface-2, var(--cream))` fallback never fired: the
              // token is always defined, so --cream was dead code.
              background: 'var(--cream)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-menu)',
              zIndex: 'var(--z-dropdown)',
              color: 'var(--ink)',
            }}
          >
            <div className="flex items-start justify-between gap-2" style={{ marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {/* Was "Just shipped ·" — the pill stays up until dismissed,
                      so it kept calling a months-old release brand new. */}
                  Released · {release.date}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>
                  {release.title}
                </div>
              </div>
              <button
                onClick={dismiss}
                aria-label="Dismiss release notes"
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X {...ICON_PROPS} size={14} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.5, margin: 0 }}>
              {release.summary}
            </p>
            <ul
              style={{
                margin: 'var(--sp-sm) 0 0',
                paddingLeft: 18,
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--slate)',
              }}
            >
              {release.highlights.map((h, i) => (
                <li key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>{h}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
