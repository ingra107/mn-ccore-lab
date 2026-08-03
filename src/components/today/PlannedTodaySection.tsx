// PlannedTodaySection — planned strip tasks below the Timeline.
// Renders tasks with slot==='strip' as full PlannedTaskRow rows.
// The Right Now hero row was removed (Part A, 2026-06-22): the hero section
// + in-page SmartCompose chat were replaced by the ubiquitous WorkOnActions
// (📂 + ▶) that appear inline on every task surface. The strip list now shows
// ALL planned-strip tasks (rightNow is no longer excluded from this list).
//
// `slot:strip` droppable (2026-07-06, found while root-causing drag-to-plan
// test failures — see #492 handoff): when this section was extracted out of
// Timeline.tsx (2f080f0f, 2026-06-16) and the whole surface later migrated to
// dnd-kit (bcd72c6a, GH#150, 2026-06-24), nobody re-registered a droppable
// here. TodayDndContext.onDragEnd already routes any `slot:strip` drop to
// state.planAt(taskId, 'strip') — it just had no droppable to land on, so
// dragging a task onto "Planned today" silently no-opped (confirmed via a
// live probe: zero API calls fired). The 📌 button path was unaffected.

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { PlannedTaskRow } from './PlannedTaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import { ACCENT_GOLD, ACCENT_TEAL, INK_DIM, INK_MUTED, withAlpha } from './constants'
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

  // dnd-kit droppable — TodayDndContext.onDragEnd already handles `slot:strip`
  // (writes plan_slot='strip', no plan_start_min); this registers the target.
  const { isOver, setNodeRef } = useDroppable({ id: 'slot:strip' })

  return (
    <section
      ref={setNodeRef}
      data-b2-planned-today
      style={{
        marginBottom: 24,
        borderRadius: 8,
        outline: isOver ? `1.5px dashed ${withAlpha(ACCENT_GOLD, 55)}` : '1.5px dashed transparent',
        outlineOffset: 4,
        background: isOver ? withAlpha(ACCENT_GOLD, 6) : 'transparent',
        transition: 'all 120ms',
      }}
    >
      {/* Section header — clear boundary between calendar and planned list */}
      <div
        {...collapseToggleProps(open, () => setOpen((o) => !o), 'Planned today')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>📋</span>
        {/* "Planned today" over-claimed: this section holds ONLY slot==='strip'
            tasks — the ones planned for today with no specific time. Tasks
            dropped into a timeline gap are planned too, and they live in that
            gap, not here. */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap' }}>Planned · no specific time</h3>
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
