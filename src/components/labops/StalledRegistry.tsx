import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ChartCard from '../ui/ChartCard'
import EmptyState from '../EmptyState'
import EmptyStateArt from '../EmptyStateArt'
import InlineDatePicker from '../InlineDatePicker'
import { PATHS } from '../../constants/paths'
import { localDateKey } from '../../lib/dateUtils'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import type { InsightsDashboardData } from '../../hooks/useInsightsDashboard'

const COLS = 'minmax(220px, 3fr) 90px 90px 140px 130px'
// Progressive disclosure (principle 5, G8-05): the longest-idle few, the rest
// one tap away. 68 rows inline made the Pipeline tab ~10,400px tall on a phone.
const PREVIEW = 5

/**
 * Stalled projects (no project update in 14 days), each with a follow-up date
 * and "+ Set follow-up". That button is the one write action on the Lab
 * overview: it posts a high-priority task, due on the chosen date (default
 * three days out), to POST /api/tasks.
 */
export default function StalledRegistry({ rows }: { rows: InsightsDashboardData['stalledRegistry'] }) {
  const queryClient = useQueryClient()
  const { showSuccess } = useToast()
  const { user } = useAuth()
  // Per-row pending follow-up date, keyed by project slug; a row that has not
  // been edited uses the default (+3 days).
  const defaultDueStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return localDateKey(d)
  }, [])
  const [pendingDates, setPendingDates] = useState<Record<string, string>>({})
  const followUp = useMutation({
    mutationFn: async (project: { slug: string; title: string; dueStr: string }) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Follow up on stalled project: ${project.title}`,
          assignee: user?.email ? user.slug : 'nick-ingraham',
          project_id: project.slug,
          priority: 'high',
          due_date: project.dueStr,
          status: 'todo',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      showSuccess('Follow-up task created')
      setPendingDates((prev) => {
        const rest = { ...prev }
        delete rest[variables.slug]
        return rest
      })
    },
  })

  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? rows : rows.slice(0, PREVIEW)

  const dueFor = (slug: string) => pendingDates[slug] ?? defaultDueStr
  const setDueFor = (slug: string, value: string | null) => {
    if (!value) return
    setPendingDates((prev) => ({ ...prev, [slug]: value }))
  }

  return (
    <ChartCard title="Stalled projects" count={rows.length > 0 ? `${rows.length} idle 14d+ · PI only` : 'PI only'}>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={<EmptyStateArt variant="tasks" title="All caught up" />}
          title="No stalled projects"
          subtitle="Every active project has had a project update within the last 14 days."
        />
      ) : (
        <div data-testid="stalled-registry">
          <div className="hidden sm:grid px-3 py-2" style={{ gridTemplateColumns: COLS, borderBottom: '1px solid var(--sk-line)' }}>
            {['Project', 'Days idle', 'Open tasks', 'Follow-up date', 'Action'].map((label) => (
              <span key={label} className="text-[11px] font-medium" style={{ color: 'var(--sk-t3)' }}>{label}</span>
            ))}
          </div>
          {shown.map((r) => (
            <div key={r.slug} className="hidden sm:grid items-center px-3 py-2 text-[13px]" style={{ gridTemplateColumns: COLS, borderBottom: '1px solid var(--sk-line)', color: 'var(--ink)' }}>
              <Link to={PATHS.project(r.slug)} className="truncate" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{r.title}</Link>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--job-stale)' }}>{r.daysIdle === null ? 'no updates yet' : `${r.daysIdle}d`}</span>
              <span className="tabular-nums" style={{ color: 'var(--slate)' }}>{r.openTasks}</span>
              <InlineDatePicker value={dueFor(r.slug)} onChange={(d) => setDueFor(r.slug, d)} />
              <button
                type="button"
                onClick={() => followUp.mutate({ slug: r.slug, title: r.title, dueStr: dueFor(r.slug) })}
                disabled={followUp.isPending}
                className="tk-btn tk-sm"
                style={{ width: 'fit-content' }}
              >
                + Set follow-up
              </button>
            </div>
          ))}
          {/* Phone: one stacked card per project. */}
          {shown.map((r) => (
            <div key={`m-${r.slug}`} className="sm:hidden py-3" style={{ borderBottom: '1px solid var(--sk-line)' }}>
              <Link to={PATHS.project(r.slug)} className="text-[13px] font-medium" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{r.title}</Link>
              <div className="flex items-center gap-3 mt-1 text-[11px]">
                <span className="font-semibold" style={{ color: 'var(--job-stale)' }}>{r.daysIdle === null ? 'no updates yet' : `${r.daysIdle}d idle`}</span>
                <span style={{ color: 'var(--slate)' }}>{r.openTasks} tasks</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <InlineDatePicker value={dueFor(r.slug)} onChange={(d) => setDueFor(r.slug, d)} />
                <button
                  type="button"
                  onClick={() => followUp.mutate({ slug: r.slug, title: r.title, dueStr: dueFor(r.slug) })}
                  disabled={followUp.isPending}
                  className="tk-btn tk-sm"
                  style={{ marginLeft: 'auto' }}
                >
                  + Set follow-up
                </button>
              </div>
            </div>
          ))}
          {rows.length > PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="tk-btn tk-sm mt-2"
            >
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </ChartCard>
  )
}
