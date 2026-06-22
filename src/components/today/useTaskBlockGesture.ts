// useTaskBlockGesture — pointer-driven MOVE + RESIZE for timed task blocks.
//
// Phase 4 of the synchronous-swinging-sifakis plan.
//
// CONTRACT:
//   - MOVE  (body drag): updates plan_start_min.
//   - RESIZE (bottom 6px strip / 11px on touch): updates estimated_minutes.
//   - CLICK  (total movement < 4px): fires onExpand(id) — expand behavior preserved.
//   - Pointer capture: setPointerCapture on pointerdown; released on pointerup/cancel.
//   - Live preview: local state (translateY for move, heightDelta for resize).
//   - Commit ONCE on pointerup (never PATCH per pointermove).
//   - 15-min snap: Math.round(min / 15) * 15.
//   - MOVE clamp: [gapStartMin, gapEndMin − dur] in minutes.
//   - RESIZE: no clamp to gap end (gap auto-grows from Phase 3); min 15, max 480.
//   - Touch: pointer events fire on touch → same gesture paths work on mobile.

import { useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { PX_PER_MIN } from './timelineModel'

// ── Snap helper ──────────────────────────────────────────────────────────────

function snap15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

// ── Types ────────────────────────────────────────────────────────────────────

export type GestureMode = 'move' | 'resize' | null

export interface TaskBlockGestureState {
  /** Current live translation in px (move gesture preview). 0 when idle. */
  translatePx: number
  /** Current live height delta in px (resize gesture preview). 0 when idle. */
  heightDeltaPx: number
  /** Active gesture mode; null when idle. */
  mode: GestureMode
}

export interface TaskBlockGestureHandlers {
  /** Attach to the block BODY element (not the resize strip). */
  onPointerDownBody: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** Attach to the RESIZE STRIP element at the bottom of the block. */
  onPointerDownResize: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export interface UseTaskBlockGestureOptions {
  taskId: string
  /** Current plan_start_min (minutes since midnight). */
  planStartMin: number
  /** Current estimated_minutes (defaults to 30 if null/undefined). */
  estimatedMinutes: number | null | undefined
  /** Gap's start time in minutes-since-midnight (for move clamp). */
  gapStartMin: number
  /** Gap's end time in minutes-since-midnight (for move clamp). */
  gapEndMin: number
  /** Called on expand click (movement < 4px = click). */
  onExpand: (id: string) => void
  /** Called to commit move: writes plan_start_min. */
  onMove: (id: string, newPlanStartMin: number) => void
  /** Called to commit resize: writes estimated_minutes. */
  onResize: (id: string, newEstimatedMinutes: number) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTaskBlockGesture({
  taskId,
  planStartMin,
  estimatedMinutes,
  gapStartMin,
  gapEndMin,
  onExpand,
  onMove,
  onResize,
}: UseTaskBlockGestureOptions): [TaskBlockGestureState, TaskBlockGestureHandlers] {
  const dur = estimatedMinutes ?? 30

  // Live preview state: only these drive re-renders.
  const [translatePx, setTranslatePx] = useState(0)
  const [heightDeltaPx, setHeightDeltaPx] = useState(0)
  const [mode, setMode] = useState<GestureMode>(null)

  // Stable gesture state stored in a ref (pointerId, origin, cumulative delta).
  // Avoids stale-closure issues in event handlers.
  const gestureRef = useRef<{
    pointerId: number
    startY: number
    mode: GestureMode
    committed: boolean
  } | null>(null)

  // ── Shared pointermove / pointerup / pointercancel handlers ─────────────────
  // Registered on the ELEMENT (not window) via setPointerCapture — the element
  // receives all pointer events until pointerup regardless of pointer position.

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    const deltaY = e.clientY - g.startY
    if (g.mode === 'move') {
      setTranslatePx(deltaY)
    } else if (g.mode === 'resize') {
      setHeightDeltaPx(deltaY)
    }
  }, [])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    const deltaY = e.clientY - g.startY
    const absDelta = Math.abs(deltaY)

    // Clean up listeners from the CAPTURING element (currentTarget), NOT e.target.
    // With setPointerCapture the event fires on the capturing element, but e.target
    // remains the original hit-target (may be a child span). Using e.target here
    // would try to remove listeners from the wrong element, causing accumulation.
    const el = e.currentTarget as HTMLElement
    el.removeEventListener('pointermove', handlePointerMove)
    el.removeEventListener('pointerup', handlePointerUp)
    el.removeEventListener('pointercancel', handlePointerUp)

    // Reset preview state
    setTranslatePx(0)
    setHeightDeltaPx(0)
    setMode(null)

    const gMode = g.mode
    gestureRef.current = null

    // 8px threshold (raised from 4px): a casual desktop click moves 4–6px;
    // 4px was too tight and suppressed expand on ordinary clicks.
    if (absDelta < 8) {
      // CLICK — fire expand, no write
      if (!g.committed) onExpand(taskId)
      return
    }

    // Mark committed so a late pointerup doesn't double-fire onExpand
    g.committed = true

    const deltaMins = deltaY / PX_PER_MIN

    if (gMode === 'move') {
      const rawNewStart = planStartMin + deltaMins
      const snapped = snap15(rawNewStart)
      // Clamp: [gapStartMin, gapEndMin − dur]
      const maxStart = gapEndMin - dur
      const clamped = Math.max(gapStartMin, Math.min(maxStart, snapped))
      if (clamped !== planStartMin) {
        onMove(taskId, clamped)
      }
    } else if (gMode === 'resize') {
      const rawNewDur = dur + deltaMins
      const snapped = snap15(rawNewDur)
      // min 15, max 480; no upper clamp to gap (gap auto-grows)
      const clamped = Math.max(15, Math.min(480, snapped))
      if (clamped !== dur) {
        onResize(taskId, clamped)
      }
    }
  }, [taskId, planStartMin, dur, gapStartMin, gapEndMin, onExpand, onMove, onResize, handlePointerMove])

  // ── pointerdown on BODY (move gesture) ──────────────────────────────────────

  const onPointerDownBody = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // Only primary pointer (left mouse / first touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()

    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    gestureRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      mode: 'move',
      committed: false,
    }
    setMode('move')

    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
  }, [handlePointerMove, handlePointerUp])

  // ── pointerdown on RESIZE STRIP ──────────────────────────────────────────────

  const onPointerDownResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()

    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    gestureRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      mode: 'resize',
      committed: false,
    }
    setMode('resize')

    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
  }, [handlePointerMove, handlePointerUp])

  return [
    { translatePx, heightDeltaPx, mode },
    { onPointerDownBody, onPointerDownResize },
  ]
}
