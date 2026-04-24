import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { spring } from '../lib/animations'

// Bump this and add an entry to RELEASES when shipping a meaningful feature
// set. Each release gets a one-line summary keyed to its version. The ribbon
// auto-dismisses 7 days after first view (per user, via localStorage) or on
// explicit close; a new version intentionally re-raises it.
const CURRENT_RELEASE = '2026-04-24-dd3-slack-parity' as const

interface ReleaseNote {
  version: string
  title: string
  body: string
  href?: string
}

const RELEASES: Record<string, ReleaseNote> = {
  '2026-04-24-dd3-slack-parity': {
    version: '2026-04-24-dd3-slack-parity',
    title: 'This week',
    body: 'Dashboard status line, Files tab on tasks + meetings, typing indicators, muted reactions, mobile swipe-to-dismiss.',
  },
}

const LS_PREFIX = 'mnccore-release-seen-'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export default function ReleaseRibbon() {
  const release = RELEASES[CURRENT_RELEASE]
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!release) return true
    try {
      const raw = localStorage.getItem(LS_PREFIX + release.version)
      if (!raw) return false
      const firstSeen = parseInt(raw, 10)
      if (Number.isNaN(firstSeen)) return false
      return Date.now() - firstSeen > TTL_MS
    } catch { return false }
  })

  useEffect(() => {
    if (!release || dismissed) return
    try {
      const key = LS_PREFIX + release.version
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, String(Date.now()))
      }
    } catch { /* localStorage unavailable */ }
  }, [release, dismissed])

  const dismiss = useMemo(
    () => () => {
      if (!release) return
      try {
        // Write a first-seen timestamp far enough in the past that the TTL
        // check on next mount already considers it stale.
        localStorage.setItem(LS_PREFIX + release.version, String(Date.now() - TTL_MS - 1))
      } catch { /* localStorage unavailable */ }
      setDismissed(true)
    },
    [release],
  )

  if (!release || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        data-testid="release-ribbon"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={spring.default}
        className="mb-4"
        style={{
          minHeight: 44,
          padding: 'var(--sp-sm) var(--sp-lg)',
          background: 'var(--gold-hover)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--sp-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flex: 1, minWidth: 0 }}>
          <Sparkles size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-small)', color: 'var(--ink)', fontWeight: 'var(--weight-ui)' as any }}>
            {release.title}:
          </span>
          <span style={{ fontSize: 'var(--text-small)', color: 'var(--ink)', opacity: 0.85, minWidth: 0 }}>
            {release.body}
          </span>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss release notes"
          className="p-1 rounded transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--ink-muted)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
