import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import type { PBHealthData } from '../../hooks/useApiData'

function StatusDot({ timestamp }: { timestamp: string | null }) {
  const color = useMemo(() => {
    if (!timestamp) return 'var(--maroon)'
    const age = Date.now() - new Date(timestamp).getTime()
    const hours = age / (1000 * 60 * 60)
    if (hours < 1) return 'var(--green-light)'     // green — fresh
    if (hours < 6) return 'var(--gold)' // gold — stale
    return 'var(--maroon)'              // red — very stale
  }, [timestamp])

  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 'var(--radius-circle)',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'never'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'invalid'
  const now = Date.now()
  const diffMin = Math.floor((now - d.getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

interface Props {
  data: PBHealthData | null | undefined
  isLoading: boolean
}

export default function SystemHealthCard({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div
        className="rounded-lg overflow-hidden animate-pulse"
        style={{
          border: '1px solid rgba(201,168,76,0.1)',
          background: 'var(--gold-hover)',
          height: 120,
        }}
      />
    )
  }

  if (!data) return null

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid rgba(201,168,76,0.1)',
        background: 'var(--gold-hover)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Activity size={12} style={{ color: 'var(--teal)', opacity: 0.7 }} />
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--teal)',
        }}>
          System Health
        </span>
      </div>

      {/* Body */}
      <div className="px-3 pb-2.5 flex flex-col gap-1.5">
        {/* Sync rows */}
        <div className="flex items-center gap-2">
          <StatusDot timestamp={data.lastTaskSync} />
          <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7 }}>
            Task sync
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--ink)',
            fontFamily: 'JetBrains Mono, monospace',
            marginLeft: 'auto',
          }}>
            {formatTimestamp(data.lastTaskSync)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot timestamp={data.lastActivityTimestamp} />
          <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7 }}>
            D1 activity
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--ink)',
            fontFamily: 'JetBrains Mono, monospace',
            marginLeft: 'auto',
          }}>
            {formatTimestamp(data.lastActivityTimestamp)}
          </span>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.08)', margin: '2px 0' }} />

        {/* Counts row */}
        <div className="flex items-center gap-3" style={{ fontSize: '10px' }}>
          <span style={{ color: 'var(--slate)', opacity: 0.7 }}>
            Tasks{' '}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)' }}>
              {data.tasks.active}
            </span>
            <span style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>/</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--slate)' }}>
              {data.tasks.total}
            </span>
          </span>
          <span style={{ color: 'var(--slate)', opacity: 0.7 }}>
            Projects{' '}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)' }}>
              {data.projects.active}
            </span>
          </span>
          <span style={{ color: 'var(--slate)', opacity: 0.7 }}>
            Tables{' '}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)' }}>
              {data.d1TableCount}
            </span>
          </span>
        </div>

        {/* Recent activity */}
        {data.recentActivityCount > 0 && (
          <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--teal)' }}>
              {data.recentActivityCount}
            </span>{' '}
            actions in last 24h
          </div>
        )}
      </div>
    </div>
  )
}
