import { memo, useMemo } from 'react'
import { Banknote } from 'lucide-react'
import BentoCard from './BentoCard'
import { useGrantProducts } from '../../hooks/useGrantProducts'
import { barOf, grantName, mechanismOf, type GrantProduct } from '../../lib/grants'
import { GRANT_BAR_FILL, GRANT_BAR_LIT, GRANT_BAR_STROKE } from '../../lib/grantBar'
import { LIT_EDGE } from '../../lib/tealRamp'

const CURRENT_YEAR = new Date().getFullYear()

interface GrantBar {
  id: string
  mechanism: string
  pi: string
  title: string
  startYear: number
  endYear: number
  /** Render as a dashed outline (an application's hypothetical bar) vs solid (an award). */
  proposed: boolean
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

/** A grant product's bar in whole years (lib/grants barOf: an award start to
 *  end, an application its proposed start plus the mechanism's usual term). */
function toBar(g: GrantProduct): GrantBar | null {
  const bar = barOf(g)
  if (!bar) return null
  return {
    id: g.id,
    mechanism: mechanismOf(g.venue) ?? g.venue ?? '—',
    pi: shortPi(g.pi),
    title: grantName(g),
    startYear: Number(bar.start.slice(0, 4)),
    endYear: Number(bar.end.slice(0, 4)),
    proposed: bar.hypothetical,
  }
}

function GrantTimelineCard() {
  const { data } = useGrantProducts()

  const { bars, minYear, totalYears, fundedCount, inPrepCount } = useMemo(() => {
    const grants = data?.data ?? []
    const allBars: GrantBar[] = []
    let funded = 0
    let inPrep = 0
    for (const g of grants) {
      if (g.bucket === 'ended') continue
      if (g.bucket === 'active') funded++
      if (g.bucket === 'proposed') inPrep++
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
  }, [data])

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
                        // Funded teal-lit, proposed dashed outline (grantBar.ts).
                        background: g.proposed ? 'transparent' : GRANT_BAR_LIT,
                        boxShadow: g.proposed ? undefined : LIT_EDGE,
                        border: g.proposed ? `1.5px dashed ${GRANT_BAR_STROKE}` : 'none',
                        opacity: g.proposed ? 0.85 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '8px',
                        gap: '6px',
                        overflow: 'hidden',
                        transition: 'opacity 0.2s ease',
                      }}
                      className={g.proposed ? 'hover:!opacity-100' : undefined}
                      title={g.title}
                    >
                      {/* Mechanism badge */}
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: g.proposed ? GRANT_BAR_STROKE : '#fff',
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
                          background: 'var(--job-accent)',
                          opacity: 0.85,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: '10px',
                        color: isCurrent ? 'var(--job-accent)' : 'var(--slate)',
                        opacity: isCurrent ? 1 : 0.85,
                        fontWeight: isCurrent ? 700 : 400,
                        fontVariantNumeric: 'tabular-nums',
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
                <div style={{ width: 14, height: 6, borderRadius: 'var(--radius-sm)', background: GRANT_BAR_FILL }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>Funded</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 6, borderRadius: 'var(--radius-sm)', border: `1.5px dashed ${GRANT_BAR_STROKE}`, opacity: 0.85 }} />
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>Proposed (hypothetical length)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </BentoCard>
  )
}

export default memo(GrantTimelineCard)
