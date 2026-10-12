import { useMemo } from 'react'
import { useProjectUpdates } from '../../../hooks/useApiData'
import { parseDateOnlyOrTimestamp } from '../../../lib/dateUtils'
import type { TaskRow } from '../../../lib/api'
import SectionHead from '../../ui/SectionHead'

interface TaskIntelligenceProps {
  task: TaskRow
}

const SPARKLINE_WEEKS = 8

function computeRelevance(task: TaskRow): { score: number; rationale: string } {
  let score = 50
  const reasons: string[] = []

  // due_date is a D1 date-only field ("YYYY-MM-DD"). new Date("YYYY-MM-DD")
  // parses as UTC midnight → wrong civil day west of UTC (GH#82 class).
  const due = task.due_date ? parseDateOnlyOrTimestamp(task.due_date) : null
  const now = new Date()
  if (due && task.status !== 'done' && due.getTime() < now.getTime()) {
    score += 20
    reasons.push('overdue')
  }

  if (task.priority === 'urgent') {
    score += 25
    reasons.push('urgent priority')
  } else if (task.priority === 'high') {
    score += 15
    reasons.push('high priority')
  }

  if (task.status === 'blocked') {
    score += 10
    reasons.push('blocked')
  }

  if (task.status === 'waiting_external') {
    score += 5
    reasons.push('waiting on external')
  }

  const updated = task.updated_at ? parseDateOnlyOrTimestamp(task.updated_at) : null
  if (updated) {
    const ageDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > 7 && task.status !== 'done') {
      score += 10
      reasons.push(`${Math.floor(ageDays)}d since last update`)
    } else if (ageDays < 1) {
      score -= 10
    }
  }

  if (task.acknowledged_at == null && task.assignee && task.status !== 'done') {
    score += 5
    reasons.push('unacknowledged')
  }

  score = Math.max(0, Math.min(100, score))

  const rationale = reasons.length === 0
    ? 'Steady — no urgency signals.'
    : reasons.length === 1
      ? `Surfaced because ${reasons[0]}.`
      : `Surfaced because ${reasons.slice(0, 2).join(' + ')}.`

  return { score, rationale }
}

function bucketUpdatesByWeek(updates: { created_at: string }[], weeks: number): number[] {
  const buckets = new Array(weeks).fill(0)
  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000
  for (const u of updates) {
    const t = parseDateOnlyOrTimestamp(u.created_at).getTime()
    if (Number.isNaN(t)) continue
    const ageWeeks = Math.floor((now - t) / weekMs)
    if (ageWeeks >= 0 && ageWeeks < weeks) {
      buckets[weeks - 1 - ageWeeks] += 1
    }
  }
  return buckets
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const w = 160
  const h = 32
  const stepX = values.length > 1 ? w / (values.length - 1) : 0
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = h - (v / max) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ display: 'block' }}>
      <polyline
        fill="none"
        stroke="var(--job-accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * stepX}
          cy={h - (v / max) * (h - 4) - 2}
          r={1.5}
          fill="var(--job-accent)"
        />
      ))}
    </svg>
  )
}

export default function TaskIntelligence({ task }: TaskIntelligenceProps) {
  const { score, rationale } = useMemo(() => computeRelevance(task), [task])
  const projectSlug = task.project_id || ''
  const { data: updates = [] } = useProjectUpdates(projectSlug)
  const series = useMemo(() => bucketUpdatesByWeek(updates, SPARKLINE_WEEKS), [updates])
  const totalUpdates = updates.length
  const recent = series[series.length - 1] ?? 0
  const prior = series[series.length - 2] ?? 0
  const delta = recent - prior

  const ringColor =
    score >= 75 ? 'var(--job-stale)' :
    score >= 55 ? 'var(--sk-t2)' :
    'var(--sk-t2)'

  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-lg)' }}>
      <SectionHead as="h3" title="Relevance" />
      <div
        className="flex items-center"
        style={{ gap: 'var(--sp-md)' }}
      >
        <ScoreRing value={score} color={ringColor} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--sk-t2)' }}>
            Relevance score
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
            {rationale}
          </p>
        </div>
      </div>

      <SectionHead as="h3" title="Project velocity" />
      {projectSlug ? (
        <div>
          <div className="flex items-center" style={{ gap: 'var(--sp-md)' }}>
            <Sparkline values={series} />
            <div className="flex flex-col" style={{ gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {totalUpdates}
              </span>
              <span style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.85 }}>
                updates / 8 wk
              </span>
            </div>
            <div
              className="flex items-center"
              style={{
                gap: 4,
                marginLeft: 'auto',
                fontSize: 11,
                color: delta > 0 ? 'var(--sk-t2)' : delta < 0 ? 'var(--sk-t2)' : 'var(--slate)',
                opacity: 0.9,
                fontWeight: 500,
              }}
            >
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta)} vs last wk
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.75, margin: 0 }}>
          No project linked — velocity only renders for project-bound tasks.
        </p>
      )}

    </div>
  )
}

function ScoreRing({ value, color }: { value: number; color: string }) {
  const size = 56
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-subtle)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        aria-label={`Relevance ${value} out of 100`}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  )
}
