// useTaskBlockDrag — dnd-kit integration for TimedTaskBlock (GH#150, 2026-06-24).
//
// MOVE gesture: replaced by dnd-kit useDraggable + DndContext PointerSensor.
//   The block registers with useDraggable(). The parent TodayDndContext handles
//   onDragEnd → state.planAt(). The live translateY preview is driven by
//   transform from useDraggable(), corrected to snap steps in onDragMove callback.
//
// RESIZE gesture: KEPT as raw pointer events (dnd-kit has no resize primitive).
//   The bottom 6px strip fires onPointerDown(resize) with stopPropagation, which
//   prevents dnd-kit's PointerSensor from activating. The resize math is unchanged
//   from useTaskBlockGesture.ts.
//
// CLICK (expand): movement < 8px on pointer events → dnd-kit activation
//   constraint is 4px on the DndContext PointerSensor, so sub-4px release =
//   no drag start = native click fires → onExpand. The activationConstraint
//   distance in TodayDndContext handles this at the sensor level.
//
// Ghost preview during move:
//   useDraggable returns transform.y (raw pixel delta from dnd-kit). We snap +
//   clamp this to get the visual translatePx for live preview. The committed
//   plan_start_min is written to active.data.current.commitStartMin in the
//   DndContext onDragEnd callback after reading the final snapped value stored
//   in a ref during the drag.
//
// onGhostUpdate: called during move with the live snapped minute for the
//   AgendaGapRow's gold ghost overlay (unchanged behavior from prior hook).

import { useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { minToPx, pxToMin } from './timelineModel'
import type { TaskRow } from '../../lib/api'
import { resolveAcrossGaps, type FreeWindow } from './useTaskBlockGesture'

// ── Snap helper ──────────────────────────────────────────────────────────────

function snap15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TaskBlockResizeState {
  /** Current live height delta in px (resize gesture preview). 0 when idle. */
  heightDeltaPx: number
  /** True while resizing. */
  isResizing: boolean
}

export interface TaskBlockResizeHandlers {
  /** Attach to the RESIZE STRIP element at the bottom of the block. */
  onPointerDownResize: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export interface UseTaskBlockDragOptions {
  taskId: string
  task: TaskRow
  /** Current plan_start_min (minutes since midnight). */
  planStartMin: number
  /** Current estimated_minutes (defaults to 30 if null/undefined). */
  estimatedMinutes: number | null | undefined
  /** Gap's start time in minutes-since-midnight (single-gap clamp fallback). */
  gapStartMin: number
  /** Gap's end time in minutes-since-midnight (single-gap clamp fallback). */
  gapEndMin: number
  /** All droppable gap windows across the day. */
  freeWindows?: FreeWindow[]
  /** Called on click (sub-activation-constraint movement). */
  onExpand: (id: string) => void
  /** Called to commit resize: writes estimated_minutes. */
  onResize: (id: string, newEstimatedMinutes: number) => void
  /** Called during move gesture with live snapped landing min (null on end). */
  onGhostUpdate?: (taskId: string, snappedMin: number | null) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTaskBlockDrag({
  taskId,
  task,
  planStartMin,
  estimatedMinutes,
  gapStartMin,
  gapEndMin,
  freeWindows,
  onExpand,
  onResize,
  onGhostUpdate,
}: UseTaskBlockDragOptions) {
  const dur = estimatedMinutes ?? 30

  // ── dnd-kit draggable ────────────────────────────────────────────────────
  // data carries TaskDragData (see TodayDndContext) so onDragEnd can read
  // the committed start minute without prop-drilling.
  // commitStartMinRef is updated during onDragMove to track the latest snapped
  // position; TodayDndContext reads it via active.data.current.commitStartMin.
  const commitStartMinRef = useRef<number>(planStartMin)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-block:${taskId}`,
    data: {
      taskId,
      source: 'timeline-block',
      task,
      // commitStartMin is a getter so TodayDndContext always reads the latest value
      get commitStartMin() { return commitStartMinRef.current },
    },
  })

  // Compute snapped translatePx from dnd-kit transform.y
  let translatePx = 0
  let snappedMin = planStartMin
  if (isDragging && transform) {
    const rawNew = planStartMin + pxToMin(transform.y)
    const snapped = snap15(rawNew)
    let clamped: number
    if (freeWindows && freeWindows.length > 0) {
      const resolved = resolveAcrossGaps(snapped, dur, freeWindows)
      clamped = resolved ? snap15(resolved.clampedMin) : snapped
    } else {
      const maxStart = gapEndMin - dur
      clamped = Math.max(gapStartMin, Math.min(maxStart, snapped))
    }
    snappedMin = clamped
    translatePx = minToPx(clamped - planStartMin)
    commitStartMinRef.current = clamped
  }

  // Notify AgendaGapRow ghost overlay of live snapped position.
  // We update via a ref-tracked effect (not useEffect) to avoid stale captures.
  const prevSnappedMin = useRef<number | null>(null)
  if (isDragging) {
    if (prevSnappedMin.current !== snappedMin) {
      prevSnappedMin.current = snappedMin
      // Microtask to avoid calling during render
      Promise.resolve().then(() => onGhostUpdate?.(taskId, snappedMin))
    }
  } else if (prevSnappedMin.current !== null) {
    prevSnappedMin.current = null
    Promise.resolve().then(() => onGhostUpdate?.(taskId, null))
  }

  // ── Resize (raw pointer events) ──────────────────────────────────────────

  const [heightDeltaPx, setHeightDeltaPx] = useState(0)
  const [isResizing, setIsResizing] = useState(false)

  const resizeGestureRef = useRef<{
    pointerId: number
    startY: number
    committed: boolean
  } | null>(null)

  const handleResizeMove = useCallback((e: PointerEvent) => {
    const g = resizeGestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    setHeightDeltaPx(e.clientY - g.startY)
  }, [])

  const handleResizeUp = useCallback((e: PointerEvent) => {
    const g = resizeGestureRef.current
    if (!g || g.pointerId !== e.pointerId) return

    const el = e.currentTarget as HTMLElement
    el.removeEventListener('pointermove', handleResizeMove)
    el.removeEventListener('pointerup', handleResizeUp)
    el.removeEventListener('pointercancel', handleResizeUp)

    const deltaY = e.clientY - g.startY
    setHeightDeltaPx(0)
    setIsResizing(false)
    resizeGestureRef.current = null

    if (Math.abs(deltaY) < 8) return

    const rawNewDur = dur + pxToMin(deltaY)
    const snapped = snap15(rawNewDur)
    const clamped = Math.max(15, Math.min(480, snapped))
    if (clamped !== dur) {
      onResize(taskId, clamped)
    }
  }, [taskId, dur, handleResizeMove, onResize])

  const onPointerDownResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // CRITICAL: stopPropagation prevents dnd-kit PointerSensor from activating
    // the block's move drag when the user grabs the resize strip.
    e.stopPropagation()

    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    resizeGestureRef.current = { pointerId: e.pointerId, startY: e.clientY, committed: false }
    setIsResizing(true)

    el.addEventListener('pointermove', handleResizeMove)
    el.addEventListener('pointerup', handleResizeUp)
    el.addEventListener('pointercancel', handleResizeUp)
  }, [handleResizeMove, handleResizeUp])

  // ── Click-to-expand ──────────────────────────────────────────────────────
  // dnd-kit's activationConstraint (distance: 4) ensures sub-4px release does
  // NOT start a drag, so the native onClick on the block fires normally.
  // We expose onClickExpand for explicit wiring in TimedTaskBlock.
  const onClickExpand = useCallback(() => {
    onExpand(taskId)
  }, [taskId, onExpand])

  return {
    // dnd-kit refs + props for the block element
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    translatePx,
    // Resize
    heightDeltaPx,
    isResizing,
    onPointerDownResize,
    // Expand
    onClickExpand,
  }
}
