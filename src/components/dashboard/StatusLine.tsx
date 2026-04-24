import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ShieldAlert, CheckCircle2 } from 'lucide-react'
import type { TaskRow } from '../../lib/api'
import { useExpiringRegulatory } from '../../hooks/useApiData'
import { PATHS } from '../../constants/paths'

interface StatusLineProps {
  tasks: TaskRow[]
  loading?: boolean
}

interface Chip {
  key: string
  icon: typeof AlertTriangle
  label: string
  count: number
  href: string
  fill: string
}

export default function StatusLine({ tasks, loading }: StatusLineProps) {
  const { data: regulatory = [] } = useExpiringRegulatory(60)

  const chips = useMemo<Chip[]>(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
    const todayStr = today.toISOString().split('T')[0]

    const overdue = tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < now).length
    const thisWeek = tasks.filter((t) => {
      if (t.completed || !t.due_date) return false
      const d = new Date(t.due_date + 'T12:00:00')
      return d >= tomorrow && d < weekEnd
    }).length
    const irb = regulatory.length
    const doneToday = tasks.filter((t) => t.completed_at && t.completed_at.startsWith(todayStr)).length

    return [
      { key: 'overdue',  icon: AlertTriangle,  label: 'overdue',    count: overdue,   href: `${PATHS.myTasks}?filter=overdue`,   fill: 'var(--stage-fill-review)' },
      { key: 'week',     icon: CalendarDays,   label: 'this week',  count: thisWeek,  href: `${PATHS.myTasks}?filter=this_week`, fill: 'var(--stage-fill-writing)' },
      { key: 'irb',      icon: ShieldAlert,    label: irb === 1 ? 'IRB renewal' : 'IRB renewals', count: irb, href: PATHS.deadlines, fill: 'var(--stage-fill-analysis)' },
      { key: 'done',     icon: CheckCircle2,   label: 'done today', count: doneToday, href: `${PATHS.myTasks}?filter=today`,     fill: 'var(--stage-fill-published)' },
    ]
  }, [tasks, regulatory])

  if (loading) {
    return (
      <div data-testid="dashboard-status-line" className="flex items-center gap-2 flex-wrap max-[640px]:flex-nowrap max-[640px]:overflow-x-auto">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            aria-hidden
            style={{
              height: 24, width: 88,
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-2)',
              animation: 'pulse 1.6s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  const allZero = chips.every((c) => c.count === 0)

  return (
    <div
      data-testid="dashboard-status-line"
      className="flex items-center gap-2 flex-wrap max-[640px]:flex-nowrap max-[640px]:overflow-x-auto"
      style={{ minWidth: 0 }}
    >
      {allZero && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full"
          style={{
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: 500,
            background: 'var(--teal-hover)',
            color: 'var(--teal)',
            border: '1px solid rgba(45,138,138,0.3)',
          }}
        >
          <CheckCircle2 size={12} />
          All clear
        </span>
      )}
      {chips.map(({ key, icon: Icon, label, count, href, fill }) => {
        const muted = count === 0
        const inner = (
          <>
            <Icon size={11} />
            <span>{count} {label}</span>
          </>
        )
        const sharedStyle: React.CSSProperties = {
          padding: '3px 10px',
          fontSize: '11px',
          fontWeight: 500,
          background: muted ? 'var(--surface-2)' : fill,
          // Zero-count chips use --muted (passes AA at full opacity on both
          // themes); non-zero chips use white text on the stage fill. Parent
          // opacity on slate/colored children would compound below AA —
          // see Rule 43. Keep opacity=1 for both paths.
          color: muted ? 'var(--muted)' : '#fff',
          border: muted ? '1px solid var(--border-subtle)' : 'none',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }
        if (muted) {
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full"
              style={sharedStyle}
              aria-label={`${count} ${label}`}
            >
              {inner}
            </span>
          )
        }
        return (
          <Link
            key={key}
            to={href}
            className="inline-flex items-center gap-1.5 rounded-full transition-transform"
            style={sharedStyle}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
