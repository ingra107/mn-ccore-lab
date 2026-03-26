import { useCountUp } from '../hooks/useCountUp'
import { usePublications, useTeam, useGrants } from '../hooks/useApiData'

function useImpactMetrics() {
  const { data: publications = [] } = usePublications()
  const { data: team = [] } = useTeam()
  const { data: grants = [] } = useGrants()

  const activeGrants = grants.filter((g) => !g.proposed).length || 2
  const pubCount = publications.length || 63
  const trainees = team.filter((m) => m.role?.toLowerCase().includes('fellow') || m.role?.toLowerCase().includes('trainee') || m.role?.toLowerCase().includes('coordinator') || m.role?.toLowerCase().includes('student')).length || 6

  return [
    { value: activeGrants, suffix: '', label: 'Active Grants' },
    { value: pubCount, suffix: '+', label: 'Publications' },
    { value: 13, suffix: '+', label: 'Research Sites' },
    { value: trainees, suffix: '', label: 'MNCCORE Trainees' },
  ]
}

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
          color: 'rgba(250, 248, 243, 0.8)',
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
  const metrics = useImpactMetrics()

  return (
    <section
      className="section-ink relative py-10 sm:py-14"
    >
      {/* Top gold accent line */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '1px',
          background: 'var(--gold)',
          opacity: 0.5,
        }}
      />

      <div className="content-container">
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
          opacity: 0.5,
        }}
      />
    </section>
  )
}
