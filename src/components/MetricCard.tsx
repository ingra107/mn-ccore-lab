import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  color: string
  subtitle?: string
}

export default function MetricCard({ icon: Icon, label, value, color, subtitle }: MetricCardProps) {
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
    </div>
  )
}
