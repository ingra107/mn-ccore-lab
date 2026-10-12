import { Link } from 'react-router-dom'

// StatRow: a row of headline numbers in Today's stat face (the .tk-stats line:
// a display-face number, a 2px rule, a small muted label). No box, no icon, no
// uppercase label. It replaced MetricCard, the bordered tile with an icon and an
// all-caps label. The rule is gray unless the number has a color job: 'o' =
// overdue (maroon), 'u' = stalled or at risk (orange). A zero is dim.
// Pass `to` only when the destination exists; a stat that looks clickable and
// goes nowhere is the thing to avoid.
export interface StatRowItem {
  label: string
  value: number | string
  /** Color job of the rule. Absent = gray. */
  rule?: 'o' | 'u'
  /** Small muted line under the label ("12 total", "Getting faster"). */
  sub?: string
  /** Prior-period value: renders "up 3 vs last week" under the label. */
  previous?: number
  previousLabel?: string
  /** A real destination; absent = not clickable. */
  to?: string
  /** Weekly points, drawn as a small line beside the number. */
  spark?: number[]
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => `${i * 8},${22 - ((v - min) / range) * 20}`).join(' ')
  return (
    <svg viewBox={`0 0 ${(values.length - 1) * 8} 24`} width={Math.max(24, (values.length - 1) * 8)} height={24} aria-hidden="true" style={{ alignSelf: 'center', overflow: 'visible' }}>
      <polyline fill="none" stroke="var(--sk-t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  )
}

function Delta({ value, previous, label }: { value: number | string; previous: number; label?: string }) {
  if (typeof value !== 'number') return null
  const d = value - previous
  return (
    <span className="tk-l" style={{ marginTop: 2 }}>
      {d === 0 ? 'no change' : `${d > 0 ? 'up' : 'down'} ${Math.abs(d)}`} {label ?? 'vs prior'}
    </span>
  )
}

export function StatRow({ stats, className }: { stats: StatRowItem[]; className?: string }) {
  return (
    <div className="tk">
      <div className={`tk-stats${className ? ` ${className}` : ''}`} style={{ marginTop: 4 }}>
        {stats.map((s) => {
          const zero = s.value === 0 || s.value === '0'
          const body = (
            <>
              <span className={`tk-rl${!zero && s.rule ? ` tk-${s.rule}` : ''}`} aria-hidden="true" />
              <span>
                <span className="tk-v" style={{ display: 'block' }}>{s.value}</span>
                <span className="tk-l">{s.label}{!zero && s.to && <span className="tk-ar" aria-hidden="true">&rarr;</span>}</span>
                {s.sub && <span className="tk-l" style={{ marginTop: 2 }}>{s.sub}</span>}
                {s.previous !== undefined && <Delta value={s.value} previous={s.previous} label={s.previousLabel} />}
              </span>
              {s.spark && s.spark.length > 1 && <Spark values={s.spark} />}
            </>
          )
          const cls = `tk-st${zero ? ' tk-zero' : ''}`
          return !zero && s.to
            ? <Link key={s.label} to={s.to} className={cls}>{body}</Link>
            : <div key={s.label} className={cls}>{body}</div>
        })}
      </div>
    </div>
  )
}

export default StatRow
