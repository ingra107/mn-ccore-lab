import { useCallback, useRef } from 'react'

/**
 * DD-7 long-press — fires onLongPress after `thresholdMs` of continuous
 * touch/mouse-down on the attached element. Cancels on move (>10px) or
 * release. Returns a spread-ready handler bag.
 *
 * Usage:
 *   const bind = useLongPress(() => openActionSheet(), { thresholdMs: 500 })
 *   <div {...bind} />
 *
 * Skips on right-click + multi-touch so it doesn't interfere with native
 * context menus or pinch gestures.
 */
export interface LongPressOptions {
  thresholdMs?: number
  moveTolerance?: number
}

export function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  { thresholdMs = 500, moveTolerance = 10 }: LongPressOptions = {},
) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef<boolean>(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const begin = useCallback(
    (x: number, y: number, e: React.TouchEvent | React.MouseEvent) => {
      firedRef.current = false
      startRef.current = { x, y }
      timerRef.current = window.setTimeout(() => {
        if (startRef.current) {
          firedRef.current = true
          onLongPress(e)
        }
      }, thresholdMs)
    },
    [onLongPress, thresholdMs],
  )

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) { clear(); return }
      const t = e.touches[0]
      begin(t.clientX, t.clientY, e)
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!startRef.current || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = Math.abs(t.clientX - startRef.current.x)
      const dy = Math.abs(t.clientY - startRef.current.y)
      if (dx > moveTolerance || dy > moveTolerance) clear()
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      // Suppress browser context menu if long-press fired successfully,
      // so users don't see the OS menu on top of our action sheet.
      if (firedRef.current) e.preventDefault()
    },
  }
}
