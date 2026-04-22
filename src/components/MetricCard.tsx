import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  subtitle?: string
  sparklineData?: number[]
  /** P2-09: optional delta vs prior period. Renders a chip below the
   *  number. Pass `previous` (the prior period's value) and an optional
   *  `previousLabel` like "vs last week". Zero is contextualized as
   *  "no change" so empty hero cards stop reading as broken. */
  previous?: number
  previousLabel?: string
}

export default function MetricCard({ icon: Icon, label, value, color, subtitle, sparklineData, previous, previousLabel }: MetricCardProps) {
  // Compute delta only when both sides are numeric. We render a chip even
  // when delta === 0 so zero values get explicit context.
  const numericValue = typeof value === 'number' ? value : null
  const showDelta = numericValue !== null && previous !== undefined
  const delta = showDelta ? numericValue! - previous! : null

  return (
    <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--slate)' }}>{label}</span>
        <Icon size={14} style={{ color, opacity: 0.85 }} />
      </div>
      <div className="text-lg sm:text-xl tabular-nums" style={{ fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      {showDelta && delta !== null && (
        // Parent must not carry opacity — it multiplies with child green/
        // maroon span colors, dropping them below 4.5:1 on light-mode card
        // bg. Use --muted directly (passes AA without opacity). r7 2026-04-22.
        <div className="mt-1 flex items-center gap-1" style={{ fontSize: 'var(--text-micro)', color: 'var(--muted)' }}>
          {delta > 0 && <span style={{ color: 'var(--green)', fontWeight: 500 }}>▲ {delta}</span>}
          {delta < 0 && <span style={{ color: 'var(--maroon)', fontWeight: 500 }}>▼ {Math.abs(delta)}</span>}
          {delta === 0 && <span>→ no change</span>}
          <span>{previousLabel ?? 'vs prior'}</span>
        </div>
      )}
      {subtitle && (
        <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{subtitle}</span>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <svg viewBox={`0 0 ${(sparklineData.length - 1) * 12} 32`} style={{ width: '100%', height: 32, marginTop: 'var(--sp-xs)' }}>
          <polyline
            fill="none"
            stroke="var(--teal)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={sparklineData.map((v, i) => {
              const max = Math.max(...sparklineData)
              const min = Math.min(...sparklineData)
              const range = max - min || 1
              const x = i * 12
              const y = 30 - ((v - min) / range) * 28
              return `${x},${y}`
            }).join(' ')}
          />
        </svg>
      )}
    </div>
  )
}
