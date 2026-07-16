// NeedsAttentionCard — overdue tasks (coral) + stalled projects (orange).
// Top 5 of each; pill-strip OVERDUE pill scrolls to this anchor via
// data-b2-attention.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Attention).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCENT_CORAL, ACCENT_ORANGE, INK, INK_DIM, daysSince, withAlpha } from '../constants'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { PATHS } from '../../../constants/paths'
import type { TaskRow } from '../../../lib/api'
import TaskTitle from '../../tasks/TaskTitle'

export function NeedsAttentionCard({ overdueTasks, stalledProjects }: { overdueTasks: TaskRow[]; stalledProjects: Array<{ name: string; days: number }> }) {
  // Session-only collapse — starts expanded on every load (no localStorage).
  const [open, setOpen] = useState(true)
  // TP-18: when more than 5 in either bucket, append a "+N more →" link
  // that filters MyTasks (overdue) / Projects (stalled) to the matching
  // subset. Keeps top-5 readable without burying the long-tail count.
  const overdueExtra = Math.max(0, overdueTasks.length - 5)
  const stalledExtra = Math.max(0, stalledProjects.length - 5)
  return (
    <div data-b2-attention style={{ marginBottom: 14 }}>
      <div
        {...collapseToggleProps(open, () => setOpen((o) => !o), 'Needs attention')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_CORAL }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_CORAL, margin: 0 }}>Needs attention</h4>
        <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{overdueTasks.length + stalledProjects.length}</span>
        <CollapseChevron open={open} color={ACCENT_CORAL} />
      </div>
      {open && (
      <>
      <div style={{ padding: 12, background: withAlpha(ACCENT_CORAL, 4), border: `1px solid ${withAlpha(ACCENT_CORAL, 15)}`, borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: ACCENT_CORAL, marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em' }}>OVERDUE</div>
        {overdueTasks.length === 0 && (
          <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None — clean slate.</div>
        )}
        {overdueTasks.slice(0, 5).map((t) => {
          const days = daysSince(t.due_date)
          return (
            <div key={t.id} style={{ fontSize: 12, color: INK, padding: '3px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: ACCENT_CORAL, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 36, fontSize: 11 }}>{Number.isFinite(days) ? `${days}d` : '—'}</span>
              {/* C13 TaskTitle — surfaces [Carried forward] chip */}
              <TaskTitle title={t.short_title || t.title} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} />
            </div>
          )
        })}
        {overdueExtra > 0 && (
          <Link
            to={`${PATHS.myTasks}?filter=overdue`}
            style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: ACCENT_CORAL, textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
          >
            +{overdueExtra} more →
          </Link>
        )}
      </div>
      <div style={{ padding: 12, background: withAlpha(ACCENT_ORANGE, 4), border: `1px solid ${withAlpha(ACCENT_ORANGE, 15)}`, borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: ACCENT_ORANGE, marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em' }}>STALLED</div>
        {stalledProjects.length === 0 && (
          <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Everything's moving.</div>
        )}
        {stalledProjects.slice(0, 5).map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: INK, padding: '3px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: ACCENT_ORANGE, fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 36, fontSize: 11 }}>{s.days}d</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          </div>
        ))}
        {stalledExtra > 0 && (
          <Link
            to={`${PATHS.projects}?filter=stalled`}
            style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: ACCENT_ORANGE, textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
          >
            +{stalledExtra} more →
          </Link>
        )}
      </div>
      </>
      )}
    </div>
  )
}
