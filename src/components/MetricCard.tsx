import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  subtitle?: string
  sparklineData?: number[]
}

export default function MetricCard({ icon: Icon, label, value, color, subtitle, sparklineData }: MetricCardProps) {
  return (
    <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--slate)' }}>{label}</span>
        <Icon size={14} style={{ color, opacity: 0.6 }} />
      </div>
      <div className="text-lg sm:text-xl" style={{ fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      {subtitle && (
        <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{subtitle}</span>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <svg viewBox={`0 0 ${(sparklineData.length - 1) * 12} 32`} style={{ width: '100%', height: 32, marginTop: 4 }}>
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
