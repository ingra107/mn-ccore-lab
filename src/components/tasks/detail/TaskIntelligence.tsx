import { useMemo, useState } from 'react'
import { Brain, TrendingUp } from 'lucide-react'
import { useProjectUpdates } from '../../../hooks/useApiData'
import { useToast } from '../../../hooks/useToast'
import HermesMark from '../../HermesMark'
import { parseDateOnlyOrTimestamp } from '../../../lib/dateUtils'
import type { TaskRow } from '../../../lib/api'
import { ICON_PROPS } from '../../../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../../../lib/taskGrouping'

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
        stroke="var(--teal)"
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
          fill="var(--teal)"
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

  const { showSuccess } = useToast()
  const [draftRequested, setDraftRequested] = useState(false)

  const requestDraft = async () => {
    setDraftRequested(true)
    try {
      const res = await fetch('/api/pb/dispatch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          task_title: task.title,
          project_slug: task.project_id || null,
          comment: `Draft a short note (≤3 sentences) for this task based on its current state. Cite the project context. Title: "${task.title}". Status: ${task.status ?? 'unknown'}. Priority: ${task.priority ?? 'unknown'}.`,
          comment_type: 'pre-draft',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showSuccess('Hermes draft queued — reply lands in Comments')
    } catch (err) {
      setDraftRequested(false)
      console.error('[TaskIntelligence] dispatch failed:', err)
      showSuccess('Could not queue Hermes draft — check console.')
    }
  }

  const ringColor =
    score >= 75 ? 'var(--maroon)' :
    score >= 55 ? 'var(--gold)' :
    'var(--teal)'

  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-lg)' }}>
      <SectionHeader icon={Brain} label="Relevance" />
      <div
        className="flex items-center"
        style={{
          gap: 'var(--sp-md)',
          padding: 'var(--sp-md)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <ScoreRing value={score} color={ringColor} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--slate)', opacity: 0.85 }}>
            Relevance score
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>
            {rationale}
          </p>
        </div>
      </div>

      <SectionHeader icon={TrendingUp} label="Project velocity" />
      {projectSlug ? (
        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
          }}
        >
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
                color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--maroon)' : 'var(--slate)',
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

      {/* Hermes-adjacent label uses HermesMark (Mercury glyph, gold) per
          CLAUDE.md Rule 29 — never lucide <Sparkles /> for Hermes. */}
      <label className="flex items-center gap-1.5" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
        <HermesMark size={10} />
        Hermes draft
      </label>
      <div
        style={{
          padding: 'var(--sp-md)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--gold-hover)',
          border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-sm)',
        }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <HermesMark size={14} variant="avatar" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.04em' }}>
            Pre-draft a note
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, opacity: 0.85 }}>
          Hermes can draft a short note that summarizes this task's state and proposes the next move.
          The reply lands in Comments — you review before anything ships.
        </p>
        <button
          type="button"
          onClick={requestDraft}
          disabled={draftRequested}
          style={{
            alignSelf: 'flex-start',
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            color: '#1a1a1a',
            background: 'var(--gold)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: draftRequested ? 'default' : 'pointer',
            opacity: draftRequested ? 0.6 : 1,
          }}
        >
          {draftRequested ? 'Queued' : 'Review draft'}
        </button>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Brain; label: string }) {
  return (
    <label className="flex items-center gap-1.5" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
      <Icon {...ICON_PROPS} size={10} />
      {label}
    </label>
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
