/**
 * LabHealthScore — the "is my lab OK today?" composite metric.
 *
 * Single 0-100 number rendered inline in the Dashboard greeting stratum.
 * Deductions are capped per signal so any one category can't dominate.
 *
 *   Overdue tasks         -1 each, max -20
 *   Regulatory expiring   -5 each, max -15
 *   Stalled manuscripts   -3 each, max -15
 *   Stalled mentees       -2 each, max -10
 *   Grant deadlines <60d  -5 each, max -10
 *   Team inactive 3d+     -5 flat
 *
 * Buckets: 90+ green, 70+ amber, 50+ orange, <50 red.
 *
 * C5 Round 2 PI frontier #1 (R3-F11).
 */
import { useMemo } from 'react'
import { useLabHealthSignals } from '../../hooks/useLabHealthSignals'

type HealthBucket = 'green' | 'amber' | 'orange' | 'red'

interface HealthResult {
  score: number
  bucket: HealthBucket
  label: string
  reasons: string[]
}

function computeHealthScore(signals: {
  overdueCount: number
  regulatoryExpiringCount: number
  stalledManuscriptCount: number
  stalledMenteeCount: number
  grantDeadlineCount: number
  inactive: boolean
}): HealthResult {
  let score = 100
  const reasons: string[] = []

  const overdueDeduction = Math.min(signals.overdueCount, 20)
  if (overdueDeduction > 0) {
    score -= overdueDeduction
    reasons.push(`${signals.overdueCount} overdue task${signals.overdueCount === 1 ? '' : 's'}`)
  }

  const regDeduction = Math.min(signals.regulatoryExpiringCount * 5, 15)
  if (regDeduction > 0) {
    score -= regDeduction
    reasons.push(`${signals.regulatoryExpiringCount} regulatory expiring`)
  }

  const mssDeduction = Math.min(signals.stalledManuscriptCount * 3, 15)
  if (mssDeduction > 0) {
    score -= mssDeduction
    reasons.push(`${signals.stalledManuscriptCount} stalled manuscript${signals.stalledManuscriptCount === 1 ? '' : 's'}`)
  }

  const menteeDeduction = Math.min(signals.stalledMenteeCount * 2, 10)
  if (menteeDeduction > 0) {
    score -= menteeDeduction
    reasons.push(`${signals.stalledMenteeCount} mentee milestone${signals.stalledMenteeCount === 1 ? '' : 's'} slipping`)
  }

  const grantDeduction = Math.min(signals.grantDeadlineCount * 5, 10)
  if (grantDeduction > 0) {
    score -= grantDeduction
    reasons.push(`${signals.grantDeadlineCount} grant deadline${signals.grantDeadlineCount === 1 ? '' : 's'} <60d`)
  }

  if (signals.inactive) {
    score -= 5
    reasons.push('no team activity in 3+ days')
  }

  score = Math.max(0, Math.min(100, score))

  let bucket: HealthBucket
  let label: string
  if (score >= 90) { bucket = 'green'; label = 'Lab is healthy' }
  else if (score >= 70) { bucket = 'amber'; label = 'A few things need attention' }
  else if (score >= 50) { bucket = 'orange'; label = 'Multiple issues' }
  else { bucket = 'red'; label = 'Critical — needs intervention' }

  return { score, bucket, label, reasons }
}

const BUCKET_COLOR: Record<HealthBucket, string> = {
  green: 'var(--green)',
  amber: 'var(--gold)',
  orange: 'var(--orange)',
  red: 'var(--maroon)',
}

// Rendered in Today's StatLine anatomy (a thin colored rule, a number in the
// display face, a muted label), matching the stat line beside it. The reasons
// live in the tooltip. `.tk` scopes the shared classes in index.css.
export default function LabHealthScore() {
  const signals = useLabHealthSignals()
  const health = useMemo(() => computeHealthScore(signals), [signals])

  if (signals.loading) {
    return (
      <div className="tk" aria-label="Lab health loading">
        <div className="tk-st tk-zero">
          <span className="tk-rl" aria-hidden="true" />
          <span>
            <span className="tk-v" style={{ display: 'block' }}>&ndash;</span>
            <span className="tk-l">lab health</span>
          </span>
        </div>
      </div>
    )
  }

  const tooltip = health.reasons.length > 0
    ? `${health.label}. ${health.reasons.join(' · ')}`
    : health.label

  return (
    <div className="tk">
      <div
        className="tk-st"
        role="status"
        aria-live="polite"
        aria-label={`Lab health score ${health.score} out of 100: ${health.label}`}
        title={tooltip}
        data-testid="lab-health-score"
        style={{ cursor: 'help' }}
      >
        <span className="tk-rl" aria-hidden="true" style={{ background: BUCKET_COLOR[health.bucket] }} />
        <span>
          <span className="tk-v" style={{ display: 'block' }}>{health.score}</span>
          <span className="tk-l">lab health</span>
        </span>
      </div>
    </div>
  )
}
