import { useCountUp } from '../hooks/useCountUp'

const metrics = [
  { value: 4, suffix: '', label: 'Active Grants' },
  { value: 14, suffix: '+', label: 'Publications' },
  { value: 13, suffix: '+', label: 'Research Sites' },
  { value: 15, suffix: '', label: 'Team Members' },
]

function MetricCard({
  value,
  suffix,
  label,
  delay,
}: {
  value: number
  suffix: string
  label: string
  delay: number
}) {
  const { count, ref } = useCountUp(value, 2000 + delay)

  return (
    <div ref={ref} className="text-center">
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--gold)',
        }}
        className="text-4xl sm:text-5xl lg:text-6xl"
      >
        {count}
        {suffix}
      </div>
      <div
        className="mt-2 text-xs sm:text-sm"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'rgba(250, 248, 243, 0.6)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default function ImpactMetrics() {
  return (
    <section
      className="relative py-16 sm:py-20"
      style={{ background: 'var(--ink)' }}
    >
      {/* Top gold accent line */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '1px',
          background: 'var(--gold)',
          opacity: 0.3,
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {metrics.map((metric, i) => (
            <MetricCard
              key={metric.label}
              value={metric.value}
              suffix={metric.suffix}
              label={metric.label}
              delay={i * 150}
            />
          ))}
        </div>
      </div>

      {/* Bottom gold accent line */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '1px',
          background: 'var(--gold)',
          opacity: 0.3,
        }}
      />
    </section>
  )
}
