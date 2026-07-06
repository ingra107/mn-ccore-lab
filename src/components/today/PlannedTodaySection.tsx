// PlannedTodaySection — planned strip tasks below the Timeline.
// Renders tasks with slot==='strip' as full PlannedTaskRow rows.
// The Right Now hero row was removed (Part A, 2026-06-22): the hero section
// + in-page SmartCompose chat were replaced by the ubiquitous WorkOnActions
// (📂 + ▶) that appear inline on every task surface. The strip list now shows
// ALL planned-strip tasks (rightNow is no longer excluded from this list).

import { useState, useCallback } from 'react'
import { PlannedTaskRow } from './PlannedTaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { ACCENT_TEAL, INK_DIM, INK_MUTED } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

interface PlannedTodaySectionProps {
  stripTasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
}

export function PlannedTodaySection({
  stripTasks,
  state,
  projectsByPid,
}: PlannedTodaySectionProps) {
  // Per-surface expand state (Item 2 fix).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])
  // Session-only collapse — starts expanded on every load (Nick's ask, no localStorage).
  const [open, setOpen] = useState(true)

  return (
    <section data-b2-planned-today style={{ marginBottom: 24 }}>
      {/* Section header — clear boundary between calendar and planned list */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Collapse Planned today' : 'Expand Planned today'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o) } }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>📋</span>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap' }}>Planned today</h3>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{stripTasks.length}</span>
        {open && <span className="today-section-hint" style={{ fontSize: 11, color: INK_DIM }}>✓ done · × to unplan</span>}
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)', marginLeft: 4 }} />
        <CollapseChevron open={open} color={ACCENT_TEAL} />
      </div>

      {open && (stripTasks.length === 0 ? (
        /* Empty state */
        <div style={{ padding: '16px 20px', marginBottom: 4, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_DIM, marginRight: 10 }}>Nothing planned</span>
          <span style={{ fontSize: 13, color: INK_MUTED }}>Drag ⋮⋮ into the timeline or drop onto the strip to plan tasks for today.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stripTasks.map((t) => (
            <PlannedTaskRow
              key={t.id}
              task={t}
              project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
              state={state}
              onExpand={onExpand}
              expandedId={expandedId}
              projectsByPid={projectsByPid}
            />
          ))}
        </div>
      ))}
    </section>
  )
}
