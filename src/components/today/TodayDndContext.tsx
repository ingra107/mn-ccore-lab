// TodayDndContext — wraps the Today surface with a single DndContext.
//
// GH#150 (2026-06-24): replaces the two independent drag paradigms:
//   (a) raw pointer events (pointerdown/move/up + setPointerCapture) for
//       in-timeline TimedTaskBlock move — replaced by dnd-kit PointerSensor.
//   (b) HTML5 drag-and-drop (draggable/onDragStart/onDrop) for list→gap drops
//       — replaced by dnd-kit PointerSensor + useDroppable() on gaps.
//
// KEPT: all coord→minute and snap math lives unchanged in useTaskBlockGesture.ts
// and AgendaGapRow. Only the event/sensor plumbing changes here.
//
// KEPT: the resize strip in TimedTaskBlock stays as raw pointer events — dnd-kit
// has no resize primitive; the strip fires stopPropagation to prevent dnd-kit
// from activating its drag during a resize gesture.
//
// DnD data contract (active.data.current):
//   type TaskDragData = { taskId: string; source: 'timeline-block' | 'list' }
//   type ResizeDragData is NOT used — resize stays raw
//
// Droppable IDs encode the drop destination:
//   gap slot: `slot:between-N` → writes plan_slot + optional plan_start_min
//   strip:    `slot:strip`     → writes plan_slot='strip', clears plan_start_min
//
// Ghost (DragOverlay): lightweight gold task-title chip, no DOM clone.
//
// onDragEnd routing:
//   'timeline-block' source → calls state.planAt(id, slot, plan_start_min_from_active_data)
//   'list' source           → computes pointer-Y via activatorEvent.clientY + delta.y,
//                             converts to snapped minute (same 15-min grid), calls planAt

import type { ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Active,
} from '@dnd-kit/core'
import { InputSafeKeyboardSensor, InputSafePointerSensor } from '../../lib/dndSensors'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { useState, useCallback } from 'react'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { PlannedSlot } from './constants'
import type { TaskRow } from '../../lib/api'
import { ACCENT_GOLD, INK, withAlpha } from './constants'
import { pxToMin, TIMELINE_TASK_BLOCKS } from './timelineModel'

// ── Data types carried on active.data.current ──────────────────────────────

export interface TaskDragData {
  taskId: string
  source: 'timeline-block' | 'list'
  /** For timeline-block source: the committed plan_start_min after snap (set on
   *  dragEnd from the live gesture state). Undefined for list drags. */
  commitStartMin?: number
  /** Task row — passed through for DragOverlay label. */
  task: TaskRow
}

// ── Ghost overlay ──────────────────────────────────────────────────────────

function TaskDragGhost({ active }: { active: Active | null }) {
  if (!active) return null
  const data = active.data.current as TaskDragData | undefined
  if (!data) return null
  const label = data.task.short_title || data.task.title
  return (
    <div
      style={{
        padding: '4px 10px',
        background: withAlpha(ACCENT_GOLD, 18),
        border: `1.5px dashed ${ACCENT_GOLD}`,
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        color: INK,
        pointerEvents: 'none',
        userSelect: 'none',
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxShadow: `0 2px 8px ${withAlpha(ACCENT_GOLD, 25)}`,
      }}
    >
      {label}
    </div>
  )
}

// ── Provider ───────────────────────────────────────────────────────────────

interface TodayDndContextProps {
  children: ReactNode
  state: TodayStateApi
  tasks: TaskRow[]
}

export function TodayDndContext({ children, state, tasks }: TodayDndContextProps) {
  const [activeItem, setActiveItem] = useState<Active | null>(null)

  // Input-safe sensor variants (lib/dndSensors): TaskRow's draggable wrapper
  // contains the expanded TaskDetailDrawer's compose textarea, so keystrokes
  // and text-selection drags bubbling out of form fields must never activate
  // a drag (stock sensors ate every Space and popped the DragOverlay ghost).
  const sensors = useSensors(
    useSensor(InputSafePointerSensor, {
      // 4px activation constraint — separates click-to-expand from drag-to-plan.
      // Matches the prior 4px threshold in useTaskBlockGesture (raised to 8px for
      // move, but list drags only need 4px since click=expand is on the body not
      // the grip handle).
      activationConstraint: { distance: 4 },
    }),
    useSensor(InputSafeKeyboardSensor, {
      // Space/Enter to pick up, arrow keys to move, Enter/Space to drop,
      // Escape to cancel. Adds real keyboard a11y that was absent in both
      // prior paradigms.
    }),
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveItem(event.active)
  }, [])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over) return

    const dragData = active.data.current as TaskDragData | undefined
    if (!dragData) return

    const { taskId } = dragData

    // Decode the drop target
    const overId = String(over.id)
    if (!overId.startsWith('slot:')) return
    const slot = overId.slice('slot:'.length) as PlannedSlot

    if (dragData.source === 'timeline-block') {
      // The committed plan_start_min is provided by the draggable when it calls
      // onDragEnd — the move math (snap + clamp) ran during onDragMove in the
      // TimedTaskBlock's local state; commitStartMin carries the final value.
      const commitStartMin = dragData.commitStartMin
      state.planAt(taskId, slot, commitStartMin ?? null, null)
    } else {
      // List drag: recover pointer-Y precision using dnd-kit's event data
      // (Directive 2, 2026-06-22). Mirrors the old HTML5 onDrop math:
      //   rawMins = gapStartMin + pxToMin(e.clientY - gapTop)
      //   snapped = round(rawMins / 15) * 15
      //   startMin = clamp(snapped, gapStartMin, gapEndMin − estimatedMins)
      //
      // Data sources:
      //   over.rect       → gap div's ClientRect (≡ getBoundingClientRect())
      //   activatorEvent  → original PointerEvent (clientY = pointer at drag start)
      //   delta           → cumulative translation, so current pointer Y = start + delta.y
      //   over.data.current → { gapStartMin, gapEndMin } passed from AgendaGapRow's useDroppable
      //
      // Fallback to gap-start when geometry is unavailable (keyboard drag, no rect).
      const gapStartMin = over.data.current?.gapStartMin as number | undefined
      const gapEndMin = over.data.current?.gapEndMin as number | undefined

      if (TIMELINE_TASK_BLOCKS && gapStartMin != null && gapStartMin > 0 && gapEndMin != null) {
        const activeTask = tasks.find((t) => t.id === taskId)
        const estimatedMins = activeTask?.estimated_minutes ?? 30
        const pointerEvent = event.activatorEvent as PointerEvent | undefined
        const startClientY = pointerEvent?.clientY
        const gapTop = over.rect?.top

        let startMin = gapStartMin
        if (startClientY != null && gapTop != null) {
          // current pointer Y = Y at drag start + accumulated delta
          const currentClientY = startClientY + event.delta.y
          const rawMins = gapStartMin + pxToMin(currentClientY - gapTop)
          const snapped = Math.round(rawMins / 15) * 15
          startMin = Math.max(gapStartMin, Math.min(gapEndMin - estimatedMins, snapped))
        }
        state.planAt(taskId, slot, startMin, estimatedMins)
      } else {
        // Untimed gap (gapStartMin=0) or keyboard drop — no minute axis, use gap start.
        state.planAt(taskId, slot)
      }
    }
  }, [state, tasks])

  const onDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay>
        <TaskDragGhost active={activeItem} />
      </DragOverlay>
    </DndContext>
  )
}
