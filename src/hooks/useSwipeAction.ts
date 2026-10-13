import { useRef } from 'react'
import { useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion'

/**
 * DD-7 row-level swipe — extends the TaskDetailPanel T-49 primitive to
 * row-sized gestures. Swipe-left triggers onSwipeLeft (archive-style),
 * swipe-right triggers onSwipeRight (done-style).
 *
 * WHO CAN DRAG is decided at pointerdown, per gesture: a touch or pen pointer
 * on a viewport below 768px. framer-motion's own pointer listener is off
 * (dragListener: false), so no other pointer can start a drag at all; a mouse
 * on a desktop (text selection, a stray drag) is not a swipe at any width.
 * The old gate set state in onTouchStart, which a mouse never fires, so the
 * row stayed draggable on desktop.
 *
 * Dismiss thresholds:
 *   - distance: 40% of row width (tighter than 30% panel threshold
 *     because rows are shorter — 30% felt accidental on 360px phones)
 *   - velocity: >500px/s snaps regardless of distance
 *
 * Returns framer-motion props + MotionValues so the row can render
 * action affordances (e.g. maroon "Archive" bg on left swipe, green
 * "Done" bg on right swipe) that fade in as the row translates.
 *
 * Edge guard: a gesture starting within 32px of viewport left fires no
 * action, so iOS Safari edge-swipe-back still works.
 */
export interface UseSwipeActionOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  thresholdPct?: number
  thresholdVelocity?: number
}

/** The breakpoint below which a touch or pen pointer may swipe. */
export const SWIPE_MAX_WIDTH = 768

export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  thresholdPct = 0.4,
  thresholdVelocity = 500,
}: UseSwipeActionOptions) {
  const x = useMotionValue(0)
  const controls = useDragControls()
  const edgeGuardRef = useRef<boolean>(false)

  // Background action indicators (e.g. "Archive" label fades in as user
  // drags left; "Done" as they drag right).
  const leftActionOpacity = useTransform(x, [0, 40, 120], [0, 0.35, 1])
  const rightActionOpacity = useTransform(x, [-120, -40, 0], [1, 0.35, 0])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    if (typeof window === 'undefined' || window.innerWidth >= SWIPE_MAX_WIDTH) return
    // Captured at the gesture's start, consumed in onDragEnd to skip the
    // row actions (iOS Safari back-gesture coexistence).
    edgeGuardRef.current = e.clientX < 32
    controls.start(e)
  }

  const onDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // If the gesture started within 32px of the viewport-left, the user
    // was going for the OS back-swipe — do not fire our row actions. The
    // drag value still resets so the row returns to rest position.
    if (edgeGuardRef.current) {
      edgeGuardRef.current = false
      x.set(0)
      return
    }
    const rowWidth = (typeof window !== 'undefined' ? window.innerWidth : 360) * thresholdPct
    const passesDistance = Math.abs(info.offset.x) > rowWidth
    const passesVelocity = Math.abs(info.velocity.x) > thresholdVelocity
    if (passesDistance || passesVelocity) {
      if (info.offset.x < 0 && onSwipeLeft) onSwipeLeft()
      else if (info.offset.x > 0 && onSwipeRight) onSwipeRight()
    }
    x.set(0)
  }

  return {
    motionProps: {
      // drag stays declared so the row can move, but only onPointerDown can
      // start it (dragListener: false): the gate lives in one place.
      drag: 'x' as const,
      dragControls: controls,
      dragListener: false,
      dragConstraints: { left: 0, right: 0 },
      dragElastic: 0.15,
      dragDirectionLock: true,
      style: { x, touchAction: 'pan-y' as const },
      onPointerDown,
      onDragEnd,
    },
    leftActionOpacity,
    rightActionOpacity,
    x,
  }
}
