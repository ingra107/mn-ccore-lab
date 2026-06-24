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
import type { PlannedSlot } from './constants'

// ── Snap helper ──────────────────────────────────────────────────────────────

function snap15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

// ── Free-window type ─────────────────────────────────────────────────────────
// A gap window that a task block can legally land in (cross-gap drag).
export interface FreeWindow {
  startMin: number
  endMin: number
  slot: PlannedSlot
}

// ── Cross-gap position resolver ──────────────────────────────────────────────
// Given a raw minute value (after applying deltaY), find the best legal landing
// position across ALL free windows for the day.
//
// Rules:
//   1. rawMin inside a free window → clamp to [w.startMin, w.endMin - dur].
//   2. rawMin inside a meeting (between two windows) → nearest window by edge distance.
//   3. Before all windows → clamp to first window start.
//   4. After all windows → clamp to last window endMin - dur.
//
// Returns { slot, clampedMin } or null when freeWindows is empty.
export function resolveAcrossGaps(
  rawMin: number,
  dur: number,
  freeWindows: FreeWindow[],
): { slot: PlannedSlot; clampedMin: number } | null {
  if (freeWindows.length === 0) return null

  // 1. rawMin inside a free window
  for (const w of freeWindows) {
    if (rawMin >= w.startMin && rawMin < w.endMin) {
      const clamped = Math.max(w.startMin, Math.min(w.endMin - dur, rawMin))
      return { slot: w.slot, clampedMin: clamped }
    }
  }

  // 2–4. rawMin in a meeting or outside all windows — find nearest window by edge
  let bestWindow = freeWindows[0]
  let bestDist = Infinity
  for (const w of freeWindows) {
    const distToStart = Math.abs(rawMin - w.startMin)
    const distToEnd = Math.abs(rawMin - (w.endMin - dur))
    const dist = Math.min(distToStart, distToEnd)
    if (dist < bestDist) {
      bestDist = dist
      bestWindow = w
    }
  }
  const clamped = Math.max(bestWindow.startMin, Math.min(bestWindow.endMin - dur, rawMin))
  return { slot: bestWindow.slot, clampedMin: clamped }
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
  /** Gap's start time in minutes-since-midnight (for single-gap clamp fallback). */
  gapStartMin: number
  /** Gap's end time in minutes-since-midnight (for single-gap clamp fallback). */
  gapEndMin: number
  /** All droppable gap windows across the day. When provided, cross-gap drag is
   *  enabled: a drag past a meeting boundary snaps to the nearest free window.
   *  When absent, the gesture falls back to single-gap clamp [gapStartMin, gapEndMin]. */
  freeWindows?: FreeWindow[]
  /** Called on expand click (movement < 8px = click). */
  onExpand: (id: string) => void
  /** Called to commit move: writes plan_start_min (and slot when cross-gap). */
  onMove: (id: string, newSlot: PlannedSlot, newPlanStartMin: number) => void
  /** Called to commit resize: writes estimated_minutes. */
  onResize: (id: string, newEstimatedMinutes: number) => void
  /** Optional: called during move gesture with the live snapped landing minute,
   *  and with null when the gesture ends. Used by AgendaGapRow for ghost preview. */
  onGhostUpdate?: (taskId: string, snappedMin: number | null) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTaskBlockGesture({
  taskId,
  planStartMin,
  estimatedMinutes,
  gapStartMin,
  gapEndMin,
  freeWindows,
  onExpand,
  onMove,
  onResize,
  onGhostUpdate,
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
      // Fix A: snap the live preview to match the ghost + eventual commit.
      // Cross-gap: use resolveAcrossGaps when freeWindows available, otherwise
      // fall back to single-gap clamp [gapStartMin, gapEndMin - dur].
      const rawNew = planStartMin + deltaY / PX_PER_MIN
      const snapped = snap15(rawNew)
      let clamped: number
      if (freeWindows && freeWindows.length > 0) {
        const resolved = resolveAcrossGaps(snapped, dur, freeWindows)
        clamped = resolved ? snap15(resolved.clampedMin) : snapped
      } else {
        const maxStart = gapEndMin - dur
        clamped = Math.max(gapStartMin, Math.min(maxStart, snapped))
      }
      setTranslatePx((clamped - planStartMin) * PX_PER_MIN)
      onGhostUpdate?.(taskId, clamped)
    } else if (g.mode === 'resize') {
      setHeightDeltaPx(deltaY)
    }
  }, [taskId, planStartMin, dur, gapStartMin, gapEndMin, freeWindows, onGhostUpdate])

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
    onGhostUpdate?.(taskId, null)

    const gMode = g.mode
    gestureRef.current = null

    // 8px threshold (raised from 4px): a casual desktop click moves 4–6px;
    // 4px was too tight and suppressed expand on ordinary clicks.
    // Fix B: sub-threshold on the RESIZE strip is a no-op (not an expand).
    // Only treat sub-threshold as a click-to-expand when mode is 'move' (body drag).
    if (absDelta < 8) {
      if (gMode !== 'resize' && !g.committed) onExpand(taskId)
      return
    }

    // Mark committed so a late pointerup doesn't double-fire onExpand
    g.committed = true

    const deltaMins = deltaY / PX_PER_MIN

    if (gMode === 'move') {
      const rawNewStart = planStartMin + deltaMins
      const snapped = snap15(rawNewStart)
      // Cross-gap: AgendaGapRow always supplies freeWindows (at minimum a single
      // entry for its own gap), so resolveAcrossGaps always finds a valid window.
      if (freeWindows && freeWindows.length > 0) {
        const resolved = resolveAcrossGaps(snapped, dur, freeWindows)
        if (resolved) {
          const finalMin = snap15(resolved.clampedMin)
          // Always commit — slot may have changed even if minute is same (cross-gap).
          onMove(taskId, resolved.slot, finalMin)
        }
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
  }, [taskId, planStartMin, dur, freeWindows, onExpand, onMove, onResize, onGhostUpdate, handlePointerMove])

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
