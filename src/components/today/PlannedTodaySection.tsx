// PlannedTodaySection — planned strip tasks above the Timeline.
// Renders tasks with slot==='strip' as full PlannedTaskRow rows.
// The Right Now hero row was removed (Part A, 2026-06-22): the hero section
// + in-page SmartCompose chat were replaced by the ubiquitous WorkOnActions
// (folder + play) that appear inline on every task surface. The strip list now
// shows ALL planned-strip tasks (rightNow is no longer excluded from this list).
//
// `slot:strip` droppable (2026-07-06, found while root-causing drag-to-plan
// test failures — see #492 handoff): when this section was extracted out of
// Timeline.tsx (2f080f0f, 2026-06-16) and the whole surface later migrated to
// dnd-kit (bcd72c6a, GH#150, 2026-06-24), nobody re-registered a droppable
// here. TodayDndContext.onDragEnd already routes any `slot:strip` drop to
// state.planAt(taskId, 'strip') — it just had no droppable to land on, so
// dragging a task onto "Planned today" silently no-opped (confirmed via a
// live probe: zero API calls fired). The pin button path was unaffected.
//
// Look (Today reskin, 2026-10-09): a panel (the middle surface step) holding a
// stack of hatched dashed cards; a drop highlights the panel in teal.

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { PlannedTaskRow } from './PlannedTaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
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
      className={`tk-panel tk-blk tk-planned${isOver ? ' tk-over' : ''}`}
    >
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Planned today')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          {/* "Planned today" over-claimed: this section holds ONLY slot==='strip'
              tasks — the ones planned for today with no specific time. Tasks
              dropped into a timeline gap are planned too, and they live in that
              gap, not here. */}
          <h3>Planned, no specific time</h3>
          <span className="tk-cnt">{stripTasks.length}</span>
        </div>
        {open && stripTasks.length > 0 && <span className="tk-hintx today-section-hint">check to finish · × to unplan</span>}
      </div>

      {open && (stripTasks.length === 0 ? (
        // One quiet line, no box (design-system: empty states never reserve a
        // bordered block). The section's .tk-over outline is the drop cue.
        <div style={{ fontSize: 12, color: 'var(--sk-t3)', padding: '0 2px 2px' }}>
          Nothing planned. Drag a task into the timeline or onto this strip to plan it for today.
        </div>
      ) : (
        <div className="tk-stack">
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
