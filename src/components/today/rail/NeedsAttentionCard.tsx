// NeedsAttentionCard — overdue tasks + stalled projects, top 5 of each.
//
// Look (Today reskin, 2026-10-09): a panel; two small sub-heads, overdue days
// in maroon (the one color that means "late"), stalled days in the muted tier.
// A stalled project is a real link to its page and shows by short name.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Attention).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { daysSince } from '../constants'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { PATHS } from '../../../constants/paths'
import type { TaskRow } from '../../../lib/api'
import TaskTitle from '../../tasks/TaskTitle'

export function NeedsAttentionCard({ overdueTasks, stalledProjects }: { overdueTasks: TaskRow[]; stalledProjects: Array<{ name: string; days: number; slug?: string }> }) {
  // Session-only collapse — starts expanded on every load (no localStorage).
  const [open, setOpen] = useState(true)
  // TP-18: when more than 5 in either bucket, append a "+N more →" link
  // that filters MyTasks (overdue) / Projects (stalled) to the matching
  // subset. Keeps top-5 readable without burying the long-tail count.
  const overdueExtra = Math.max(0, overdueTasks.length - 5)
  const stalledExtra = Math.max(0, stalledProjects.length - 5)
  return (
    <section className="tk-panel" data-b2-attention>
      <div className="tk-ph">
        <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Needs attention')} className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Needs attention</h3>
          <span className="tk-cnt">{overdueTasks.length + stalledProjects.length}</span>
        </div>
      </div>
      {open && (
        <>
          <div className="tk-rsub" style={{ marginTop: 0 }}>Overdue</div>
          {overdueTasks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--sk-t3)' }}>None. Clean slate.</div>
          )}
          {overdueTasks.slice(0, 5).map((t) => {
            const days = daysSince(t.due_date)
            return (
              <div key={t.id} className="tk-rli">
                {/* C13 TaskTitle — surfaces [Carried forward] chip */}
                <TaskTitle title={t.short_title || t.title} className="tk-t" style={{ display: 'block' }} />
                <span className="tk-d tk-o">{Number.isFinite(days) ? `${days}d` : '—'}</span>
              </div>
            )
          })}
          {overdueExtra > 0 && (
            <Link to={`${PATHS.myTasks}?filter=overdue`} className="tk-rmore">
              +{overdueExtra} more →
            </Link>
          )}

          <div className="tk-rsub">Stalled</div>
          {stalledProjects.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--sk-t3)' }}>Everything's moving.</div>
          )}
          {stalledProjects.slice(0, 5).map((s, i) => (
            <div key={i} className="tk-rli">
              {s.slug
                ? <Link to={PATHS.project(s.slug)} className="tk-t" style={{ color: 'inherit', textDecoration: 'none' }}>{s.name}</Link>
                : <span className="tk-t">{s.name}</span>}
              <span className="tk-d">{s.days}d</span>
            </div>
          ))}
          {stalledExtra > 0 && (
            <Link to={`${PATHS.projects}?filter=stalled`} className="tk-rmore">
              +{stalledExtra} more →
            </Link>
          )}
        </>
      )}
    </section>
  )
}
