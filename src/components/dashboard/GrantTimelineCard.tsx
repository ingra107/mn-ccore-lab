import { Banknote } from 'lucide-react'
import BentoCard from './BentoCard'
import { useGrants } from '../../hooks/useApiData'

// Grant timeline data — supplement static grants with plausible year ranges
const grantTimelines = [
  { mechanism: 'K23', pi: 'Ingraham', agency: 'NHLBI', startYear: 2023, endYear: 2028, proposed: false },
  { mechanism: 'R03', pi: 'Ingraham', agency: 'NHLBI', startYear: 2024, endYear: 2026, proposed: false },
  { mechanism: 'R01', pi: 'Ingraham', agency: 'NHLBI', startYear: 2027, endYear: 2032, proposed: true, label: 'ADHERE-LPV' },
  { mechanism: 'R01', pi: 'Ingraham', agency: 'NHLBI', startYear: 2027, endYear: 2032, proposed: true, label: 'Provider Variation' },
  { mechanism: 'K23', pi: 'Mesfin', agency: 'NHLBI', startYear: 2027, endYear: 2032, proposed: true, label: 'IHCA Calculator' },
]

const MIN_YEAR = 2023
const MAX_YEAR = 2032
const CURRENT_YEAR = new Date().getFullYear()
const TOTAL_YEARS = MAX_YEAR - MIN_YEAR + 1

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'R01': return '#2d8a8a'
    case 'K23': return '#c9a84c'
    case 'R03': return '#7a0019'
    default: return '#64748b'
  }
}

export default function GrantTimelineCard() {
  const { data: grants = [] } = useGrants()
  const activeCount = grants.filter((g) => g.status === 'Active').length
  const pendingCount = grants.filter((g) => g.proposed).length

  return (
    <BentoCard title="Grant Portfolio" subtitle={`${activeCount} active, ${pendingCount} pending`} size="span-2" icon={Banknote}>
      <div className="flex flex-col h-full justify-between">
        {/* Timeline bars */}
        <div className="flex flex-col gap-2.5 mt-1">
          {grantTimelines.map((g, i) => {
            const startPct = ((g.startYear - MIN_YEAR) / TOTAL_YEARS) * 100
            const widthPct = ((g.endYear - g.startYear + 1) / TOTAL_YEARS) * 100
            const color = mechanismColor(g.mechanism)

            return (
              <div key={i} className="relative" style={{ height: '26px' }}>
                {/* Bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                    top: 0,
                    bottom: 0,
                    borderRadius: '6px',
                    background: g.proposed
                      ? 'transparent'
                      : color,
                    border: g.proposed
                      ? `1.5px dashed ${color}`
                      : 'none',
                    opacity: g.proposed ? 0.5 : 0.85,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '8px',
                    gap: '6px',
                    overflow: 'hidden',
                    transition: 'opacity 0.2s ease',
                  }}
                  className="hover:!opacity-100"
                >
                  {/* Mechanism badge */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: g.proposed ? color : '#fff',
                      flexShrink: 0,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {g.mechanism}
                  </span>
                  {/* PI name */}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '10px',
                      color: g.proposed ? 'var(--slate)' : 'rgba(255,255,255,0.8)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {g.pi}
                    {g.label ? ` — ${g.label}` : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Year scale */}
        <div className="flex items-end mt-3 relative" style={{ height: '20px' }}>
          {Array.from({ length: TOTAL_YEARS }, (_, i) => {
            const year = MIN_YEAR + i
            const isCurrent = year === CURRENT_YEAR
            return (
              <div
                key={year}
                className="flex-1 text-center relative"
              >
                {/* Current year marker */}
                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-120px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '1.5px',
                      height: '120px',
                      background: 'var(--gold)',
                      opacity: 0.4,
                    }}
                  />
                )}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: isCurrent ? 'var(--gold)' : 'var(--slate)',
                    opacity: isCurrent ? 1 : 0.4,
                    fontWeight: isCurrent ? 700 : 400,
                  }}
                >
                  {year % 2 === 1 ? `'${String(year).slice(2)}` : ''}
                </span>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div style={{ width: 14, height: 6, borderRadius: 3, background: '#2d8a8a' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.6 }}>Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 14, height: 6, borderRadius: 3, border: '1.5px dashed #2d8a8a', opacity: 0.5 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.6 }}>Proposed</span>
          </div>
        </div>
      </div>
    </BentoCard>
  )
}
