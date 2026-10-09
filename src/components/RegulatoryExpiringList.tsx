// RegulatoryExpiringList — regulatory items (IRB approvals, DUAs, training)
// expiring within 60 days, each with a calendar reminder download. Moved from
// the retired My Hub page to Deadlines (nav redesign, 2026-10-09). Same data
// (useExpiringRegulatory(60), the production-visible filter) and the same
// per-item .ics link (GET /api/regulatory/:id/ics) My Hub used.
//
// Quiet by default: one panel, hairline border; maroon only on an item 14 days
// or less from expiry (color is spent, not sprinkled). Renders nothing when
// there is nothing expiring, so the Deadlines page does not grow an empty box.

import { useMemo } from 'react'
import { Calendar, ShieldAlert } from 'lucide-react'
import { useExpiringRegulatory } from '../hooks/useApiData'
import { isProductionVisible } from '../lib/isProductionVisible'
import { QueryErrorNote } from './QueryErrorNote'
import { ICON_PROPS } from '../lib/iconProps'

interface RegulatoryItem {
  id: string
  title: string
  days_remaining: number | null
}

export default function RegulatoryExpiringList() {
  const { data = [], isError, refetch } = useExpiringRegulatory(60)
  const items = useMemo(
    () => (data as RegulatoryItem[])
      .filter((r) => isProductionVisible(r.title))
      .sort((a, b) => (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999)),
    [data],
  )

  if (isError) return <QueryErrorNote label="regulatory deadlines" onRetry={() => refetch()} />
  if (items.length === 0) return null

  return (
    <section
      id="regulatory"
      data-testid="regulatory-expiring"
      aria-label="Regulatory items expiring within 60 days"
      className="rounded-xl border"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)', marginTop: 'var(--sp-md)', scrollMarginTop: 72 }}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <ShieldAlert {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', flexShrink: 0 }} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Regulatory expiring</h2>
        <span style={{ fontSize: 11, color: 'var(--slate)' }}>
          {items.length} within 60 days
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0 var(--sp-sm) var(--sp-sm)' }}>
        {items.map((reg) => {
          const soon = reg.days_remaining != null && reg.days_remaining <= 14
          return (
            <li
              key={reg.id}
              className="flex items-center gap-2 px-2 rounded-md"
              style={{ minHeight: 44, borderTop: '1px solid var(--border-subtle)' }}
            >
              <span className="flex-1 truncate" style={{ fontSize: 'var(--text-small)', color: 'var(--ink)' }}>
                {reg.title}
              </span>
              {reg.days_remaining != null && (
                <span style={{ fontSize: 11, fontWeight: 500, color: soon ? 'var(--maroon)' : 'var(--slate)', flexShrink: 0 }}>
                  {reg.days_remaining}d
                </span>
              )}
              <a
                href={`/api/regulatory/${reg.id}/ics`}
                download={`regulatory-${reg.id}.ics`}
                title="Download a calendar reminder (.ics)"
                aria-label={`Download a calendar reminder for ${reg.title}`}
                className="hov-opacity"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  minWidth: 44,
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--slate)',
                  opacity: 0.85,
                  textDecoration: 'none',
                  flexShrink: 0,
                  '--hov-opacity': '1',
                } as React.CSSProperties}
              >
                <Calendar {...ICON_PROPS} size={14} />
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
