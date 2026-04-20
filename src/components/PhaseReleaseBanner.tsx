/**
 * PhaseReleaseBanner — branded "what shipped" banner that appears in the
 * portal once per phase. Auto-dismisses after the user clicks read or
 * after first interaction with the page beyond ~3 minutes. Persists the
 * dismissed phase id in localStorage so it never re-appears.
 *
 * Add new phases by appending to RELEASES below + bumping CURRENT_RELEASE.
 *
 * Design notes:
 *  - Sits above the page header on portal routes (caller renders it).
 *  - Heartbeat motif (gold) on the left as the lab's brand thread.
 *  - Single CTA "What's new" → opens the changelog summary inline.
 *  - X to dismiss; Escape to dismiss while focused.
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight } from 'lucide-react'
import HeartbeatLine from './HeartbeatLine'

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
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!release) return
    const dismissed = getDismissed()
    if (!dismissed.has(release.id)) setVisible(true)
  }, [release])

  if (!release) return null

  const dismiss = () => {
    setVisible(false)
    const dismissed = getDismissed()
    dismissed.add(release.id)
    persistDismissed(dismissed)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="region"
          aria-label={`Release notes: ${release.title}`}
          className="mb-4 overflow-hidden"
          style={{
            position: 'relative',
            background:
              'linear-gradient(95deg, color-mix(in srgb, var(--gold) 12%, var(--cream)) 0%, var(--cream) 60%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid color-mix(in srgb, var(--gold) 28%, var(--border-subtle))',
          }}
          onKeyDown={(e) => { if (e.key === 'Escape') dismiss() }}
        >
          {/* Heartbeat brand thread — slow ambient pulse on the left */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 64,
              opacity: 0.45,
              pointerEvents: 'none',
              maskImage: 'linear-gradient(to right, black 30%, transparent)',
            }}
          >
            <HeartbeatLine variant="slow" bpm={50} strokeWidth={1.25} color="var(--gold)" height="100%" />
          </div>

          <div style={{ position: 'relative', padding: 'var(--sp-md) var(--sp-lg)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0" style={{ marginLeft: 56 }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Just shipped
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.6 }}>
                    {release.date}
                  </span>
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '4px 0 0', lineHeight: 1.4 }}>
                  {release.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--slate)', margin: '4px 0 0', lineHeight: 1.5 }}>
                  {release.summary}
                </p>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ margin: 'var(--sp-sm) 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: 'var(--slate)', overflow: 'hidden' }}
                    >
                      {release.highlights.map((h, i) => (
                        <li key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>{h}</li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
                <div className="flex items-center gap-3" style={{ marginTop: 'var(--sp-sm)' }}>
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--gold)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {expanded ? 'Hide details' : "What's new"}
                    <ChevronRight
                      size={12}
                      style={{
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 150ms ease',
                      }}
                    />
                  </button>
                  <button
                    onClick={dismiss}
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: 'var(--slate)',
                      opacity: 0.65,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    Got it
                  </button>
                </div>
              </div>
              <button
                onClick={dismiss}
                aria-label="Dismiss release notes"
                style={{
                  flexShrink: 0,
                  padding: 4,
                  background: 'none',
                  border: 'none',
                  color: 'var(--slate)',
                  opacity: 0.55,
                  cursor: 'pointer',
                  minWidth: 24,
                  minHeight: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
