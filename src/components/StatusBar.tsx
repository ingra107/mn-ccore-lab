import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface StatusBarProps {
  onOpenShortcuts: () => void
}

function useLastSynced() {
  const queryClient = useQueryClient()
  const [lastSynced, setLastSynced] = useState<Date>(() => new Date())

  useEffect(() => {
    const cache = queryClient.getQueryCache()
    const unsub = cache.subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') {
        setLastSynced(new Date())
      }
    })
    return unsub
  }, [queryClient])

  return lastSynced
}

function formatRelative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export default function StatusBar({ onOpenShortcuts }: StatusBarProps) {
  const lastSynced = useLastSynced()
  const [, setTick] = useState(0)

  // Re-render every 15s so relative time stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

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
      <span>Last synced: {formatRelative(lastSynced)}</span>

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
