import { memo, useMemo } from 'react'
import { Banknote } from 'lucide-react'
import BentoCard from './BentoCard'
import { useGrantTimeline, type GrantTimelineItem } from '../../hooks/useGrantTimeline'

const CURRENT_YEAR = new Date().getFullYear()

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'R01': return '#2d8a8a'
    case 'K23': return '#c9a84c'
    case 'R03': return '#7a0019'
    default: return '#64748b'
  }
}

interface GrantBar {
  id: string
  mechanism: string
  pi: string
  title: string
  startYear: number
  endYear: number
  /** Render as a dashed outline (in-prep / proposed / submitted) vs solid (funded). */
  proposed: boolean
}

/** Pull a 4-digit year from `YYYY-MM-DD` (or YYYY) — null if missing/unparseable. */
function yearFrom(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})/.exec(dateStr)
  return m ? parseInt(m[1], 10) : null
}

/** Last name from "First Last" or slug-style "first-last". */
function shortPi(pi: string | null | undefined): string {
  if (!pi) return ''
  if (pi.includes('-')) {
    const parts = pi.split('-')
    const last = parts[parts.length - 1]
    return last.charAt(0).toUpperCase() + last.slice(1)
  }
  const parts = pi.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

function toBar(g: GrantTimelineItem): GrantBar | null {
  const start = yearFrom(g.start_date)
  const end = yearFrom(g.end_date)
  if (start == null && end == null) return null
  // Fill missing endpoints sensibly so a single-date grant still shows a bar.
  const startYear = start ?? (end ?? CURRENT_YEAR)
  const endYear = end ?? Math.max(startYear, CURRENT_YEAR)
  const proposed = g.proposed === 1 || g.status === 'in_preparation' || g.status === 'submitted' || g.status === 'planning'
  return {
    id: g.id,
    mechanism: g.mechanism || '—',
    pi: shortPi(g.pi),
    title: g.title,
    startYear,
    endYear,
    proposed,
  }
}

function GrantTimelineCard() {
  const { data: grants = [] } = useGrantTimeline()

  const { bars, minYear, totalYears, fundedCount, inPrepCount } = useMemo(() => {
    const allBars: GrantBar[] = []
    let funded = 0
    let inPrep = 0
    for (const g of grants) {
      if (g.status === 'funded') funded++
      if (g.status === 'in_preparation') inPrep++
      const bar = toBar(g)
      if (!bar) continue
      // Don't render speculation past 5 years from current year.
      if (bar.startYear > CURRENT_YEAR + 5) continue
      allBars.push(bar)
    }
    allBars.sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear)

    if (allBars.length === 0) {
      return { bars: allBars, minYear: CURRENT_YEAR, totalYears: 1, fundedCount: funded, inPrepCount: inPrep }
    }
    const minYr = Math.min(...allBars.map((b) => b.startYear), CURRENT_YEAR)
    const maxYr = Math.max(...allBars.map((b) => b.endYear), CURRENT_YEAR)
    return {
      bars: allBars,
      minYear: minYr,
      totalYears: Math.max(1, maxYr - minYr + 1),
      fundedCount: funded,
      inPrepCount: inPrep,
    }
  }, [grants])

  return (
    <BentoCard title="Grant Portfolio" subtitle={`${fundedCount} funded, ${inPrepCount} in prep`} size="span-2" icon={Banknote}>
      <div className="flex flex-col h-full justify-between">
        {bars.length === 0 ? (
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: 80, fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            No grants in the timeline yet.
          </div>
        ) : (
          <>
            {/* Timeline bars */}
            <div className="flex flex-col gap-2.5 mt-1">
              {bars.map((g) => {
                const startPct = ((g.startYear - minYear) / totalYears) * 100
                const widthPct = ((g.endYear - g.startYear + 1) / totalYears) * 100
                const color = mechanismColor(g.mechanism)

                return (
                  <div key={g.id} className="relative" style={{ height: '26px' }}>
                    {/* Bar */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${startPct}%`,
                        width: `${widthPct}%`,
                        top: 0,
                        bottom: 0,
                        borderRadius: 'var(--radius-md)',
                        background: g.proposed
                          ? 'transparent'
                          : color,
                        border: g.proposed
                          ? `1.5px dashed ${color}`
                          : 'none',
                        opacity: 0.85,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '8px',
                        gap: '6px',
                        overflow: 'hidden',
                        transition: 'opacity 0.2s ease',
                      }}
                      className="hover:!opacity-100"
                      title={g.title}
                    >
                      {/* Mechanism badge */}
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: g.proposed ? color : '#fff',
                          flexShrink: 0,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {g.mechanism}
                      </span>
                      {/* PI name + title */}
                      <span
                        style={{
                          fontSize: '10px',
                          color: g.proposed ? 'var(--slate)' : 'rgba(255,255,255,0.8)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {g.pi ? `${g.pi}` : ''}
                        {g.pi && g.title ? ' — ' : ''}
                        {g.title}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Year scale */}
            <div className="flex items-end mt-3 relative" style={{ height: '20px' }}>
              {Array.from({ length: totalYears }, (_, i) => {
                const year = minYear + i
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
                          opacity: 0.85,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: '10px',
                        color: isCurrent ? 'var(--gold)' : 'var(--slate)',
                        opacity: isCurrent ? 1 : 0.85,
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
                <div style={{ width: 14, height: 6, borderRadius: 'var(--radius-sm)', background: '#2d8a8a' }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>Funded</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 6, borderRadius: 'var(--radius-sm)', border: '1.5px dashed #2d8a8a', opacity: 0.85 }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>In prep / Submitted</span>
              </div>
            </div>
          </>
        )}
      </div>
    </BentoCard>
  )
}

export default memo(GrantTimelineCard)
