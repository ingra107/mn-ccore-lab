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

export type HealthBucket = 'green' | 'amber' | 'orange' | 'red'

interface HealthResult {
  score: number
  bucket: HealthBucket
  label: string
  reasons: string[]
}

export function computeHealthScore(signals: {
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

const BUCKET_BG: Record<HealthBucket, string> = {
  green: 'color-mix(in oklch, var(--green) 12%, transparent)',
  amber: 'color-mix(in oklch, var(--gold) 14%, transparent)',
  orange: 'color-mix(in oklch, var(--orange) 14%, transparent)',
  red: 'color-mix(in oklch, var(--maroon) 14%, transparent)',
}

export default function LabHealthScore() {
  const signals = useLabHealthSignals()
  const health = useMemo(() => computeHealthScore(signals), [signals])

  if (signals.loading) {
    return (
      <div
        aria-label="Lab health loading"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-sm)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-1)',
          boxShadow: '0 0 0 1px var(--border-subtle)',
          height: 32,
          minWidth: 120,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 'var(--text-label)', color: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Lab Health
        </span>
      </div>
    )
  }

  const tooltip = health.reasons.length > 0
    ? `${health.label}. ${health.reasons.join(' · ')}`
    : health.label

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Lab health score ${health.score} out of 100: ${health.label}`}
      title={tooltip}
      data-testid="lab-health-score"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        padding: '4px 10px',
        borderRadius: 'var(--radius-md)',
        background: BUCKET_BG[health.bucket],
        boxShadow: `0 0 0 1px ${BUCKET_COLOR[health.bucket]}`,
        minHeight: 32,
        flexShrink: 0,
        cursor: 'help',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 'var(--radius-circle)',
          background: BUCKET_COLOR[health.bucket],
          boxShadow: `0 0 6px ${BUCKET_COLOR[health.bucket]}`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 'var(--text-label)',
          color: 'var(--ink-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 'var(--weight-ui)',
          whiteSpace: 'nowrap',
        }}
      >
        Lab Health
      </span>
      <span
        style={{
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--weight-metric)',
          color: BUCKET_COLOR[health.bucket],
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {health.score}
      </span>
      {health.reasons.length > 0 && (
        <span
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--ink-muted)',
            whiteSpace: 'nowrap',
            maxWidth: 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          className="lab-health-reasons"
        >
          {health.reasons.slice(0, 2).join(' · ')}
        </span>
      )}
    </div>
  )
}
