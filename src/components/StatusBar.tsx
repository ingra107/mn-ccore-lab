import { useEffect, useState } from 'react'
import { hoursSinceLastSync } from './today/constants'

interface StatusBarProps {
  onOpenShortcuts: () => void
}

// P1-13: the honest sync clock. The old useLastSynced() reset "Last synced" to
// new Date() on ANY react-query cache success — i.e. it reflected the browser's
// last fetch from edge cache, NOT the real PB→Hub sync, so it showed a green
// "just now" even when the actual sync was days stale (decision #3: never a
// comforting fake). We now read the SAME real sync source Today uses
// (hoursSinceLastSync() from today/constants — single source of truth, not a
// duplicate) and tell the truth, including "unknown" when nothing has synced.

function formatSyncAge(hours: number): string {
  if (!isFinite(hours)) return 'Sync time unknown'
  if (hours < 1) return 'Last synced: under an hour ago'
  if (hours < 24) return `Last synced: ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Last synced: ${days}d ago`
}

export default function StatusBar({ onOpenShortcuts }: StatusBarProps) {
  const [hours, setHours] = useState<number>(() => hoursSinceLastSync())

  // Re-read the real sync age every 60s so the clock stays truthful without
  // ever being reset to "now" by a mere cache read.
  useEffect(() => {
    const id = setInterval(() => setHours(hoursSinceLastSync()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Coral past 24h, OR when we have no real timestamp at all (Rule 59 — coral =
  // warning/stale). A green clock now genuinely means fresh.
  const stale = !isFinite(hours) || hours >= 24
  const clockColor = stale ? 'var(--maroon)' : 'var(--slate)'

  return (
    <div
      role="status"
      aria-label="Status bar"
      style={{
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--sp-lg)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-ui)',
        color: 'var(--slate)',
        opacity: 0.85,
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span
        style={{ color: clockColor, opacity: stale ? 1 : 0.85 }}
        title={isFinite(hours)
          ? 'Time since the last PB → Hub sync'
          : 'No PB → Hub sync has been recorded on this device yet'}
      >
        {formatSyncAge(hours)}
      </span>

      <button
        onClick={onOpenShortcuts}
        aria-label="Open keyboard shortcuts (press ?)"
        title="Open keyboard shortcuts"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-ui)',
          color: 'var(--slate)',
          cursor: 'pointer',
          opacity: 1,
          lineHeight: 1,
        }}
      >
        ? for shortcuts
      </button>
    </div>
  )
}
