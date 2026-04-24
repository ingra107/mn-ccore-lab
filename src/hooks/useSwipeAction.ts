import { useRef, useState } from 'react'
import { useMotionValue, useTransform, type PanInfo } from 'framer-motion'

/**
 * DD-7 row-level swipe — extends the TaskDetailPanel T-49 primitive to
 * row-sized gestures. Swipe-left triggers onSwipeLeft (archive-style),
 * swipe-right triggers onSwipeRight (done-style). Only active below
 * 768px viewport; desktop returns passthrough props.
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
 * Edge guard: first-touch within 32px of viewport left blocks drag
 * activation so iOS Safari edge-swipe-back still works.
 */
export interface UseSwipeActionOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  thresholdPct?: number
  thresholdVelocity?: number
}

export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  thresholdPct = 0.4,
  thresholdVelocity = 500,
}: UseSwipeActionOptions) {
  const x = useMotionValue(0)
  const [enabled, setEnabled] = useState(true)
  const edgeGuardRef = useRef<boolean>(false)

  // Background action indicators (e.g. "Archive" label fades in as user
  // drags left; "Done" as they drag right).
  const leftActionOpacity = useTransform(x, [0, 40, 120], [0, 0.35, 1])
  const rightActionOpacity = useTransform(x, [-120, -40, 0], [1, 0.35, 0])

  const onTouchStart = (e: React.TouchEvent) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) {
      setEnabled(false)
      return
    }
    setEnabled(true)
    const t = e.touches[0]
    // Capture edge-touch at the actual touch time. Consumed in onDragEnd
    // to skip action callbacks (iOS Safari back-gesture coexistence).
    edgeGuardRef.current = t.clientX < 32
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
      // Drag is permitted whenever the row is on a mobile viewport. The
      // iOS back-gesture is handled in onDragEnd (via edgeGuardRef set
      // in onTouchStart); trying to block at this layer read the ref
      // at render time, before the touch ever happened (dead check).
      drag: enabled ? ('x' as const) : false,
      dragConstraints: { left: 0, right: 0 },
      dragElastic: 0.15,
      dragDirectionLock: true,
      style: { x, touchAction: 'pan-y' as const },
      onTouchStart,
      onDragEnd,
    },
    leftActionOpacity,
    rightActionOpacity,
    x,
  }
}
