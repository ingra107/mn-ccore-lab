import { useCallback, useRef } from 'react'
import { isEditableTarget } from '../lib/editableTarget'

/**
 * DD-7 long-press — fires onLongPress after `thresholdMs` of continuous
 * touch (or, with `mouse: true`, mouse) press on the attached element. Cancels
 * on move (>10px) or release. Returns a spread-ready handler bag.
 *
 * Usage:
 *   const bind = useLongPress(() => openActionSheet(), { thresholdMs: 500 })
 *   <div {...bind} />
 *
 * Touch runs on touchstart, which fires when the finger lands. A mouse-only
 * long-press does NOT work on a phone: the compatibility mousedown/mouseup
 * arrive together after touchend, so the timer never spans the hold (the My
 * Tasks Lanes bug, 2026-10-14).
 *
 * The click that ends a fired long-press is swallowed (onClickCapture), so a
 * press that selected does not also open or expand the row.
 *
 * Skips on right-click + multi-touch so it doesn't interfere with native
 * context menus or pinch gestures.
 *
 * A press only counts when it lands on the bound element's own content
 * (pressStartsHere): not on a form field or editor (caret, text selection,
 * the paste callout), not on a native button or link (they act on their
 * own), not inside a [data-no-long-press] region (a row's expanded drawer),
 * and not on a portal child whose React events bubble here but whose DOM sits
 * elsewhere (the full-screen task panel opened from a List row).
 */
export interface LongPressOptions {
  thresholdMs?: number
  moveTolerance?: number
  /** Also start on a left mouse button press (desktop long-press). Default off. */
  mouse?: boolean
}

/** A click or contextmenu this soon after the press fired belongs to that press. */
const RELEASE_WINDOW_MS = 1000

/** Native controls that act on a press themselves. role="button" spans are left
 *  out on purpose: a row's title is one, and holding the title must select. */
const OWN_ACTION = 'button,a[href],input,select,textarea,summary,[data-no-long-press]'

/** Does this press belong to the bound element (see the header comment)? */
export function pressStartsHere(e: React.SyntheticEvent): boolean {
  const host = e.currentTarget as Element
  const target = e.target
  if (!(target instanceof Element) || !host.contains(target)) return false
  if (isEditableTarget(target)) return false
  const owner = target.closest(OWN_ACTION)
  return !(owner && owner !== host && host.contains(owner))
}

export function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  { thresholdMs = 500, moveTolerance = 10, mouse = false }: LongPressOptions = {},
) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedAtRef = useRef<number>(0)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const justFired = () => Date.now() - firedAtRef.current < RELEASE_WINDOW_MS

  const begin = useCallback(
    (x: number, y: number, e: React.TouchEvent | React.MouseEvent) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      firedAtRef.current = 0
      startRef.current = { x, y }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        if (startRef.current) {
          firedAtRef.current = Date.now()
          onLongPress(e)
        }
      }, thresholdMs)
    },
    [onLongPress, thresholdMs],
  )

  const mouseHandlers = mouse
    ? {
        onMouseDown: (e: React.MouseEvent) => {
          // Modifier presses are selection clicks, never also a long-press.
          if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return
          // The compat mousedown that trails a touch press: the touch path ran.
          if (startRef.current || justFired()) return
          if (!pressStartsHere(e)) return
          begin(e.clientX, e.clientY, e)
        },
        // A drag (selecting text) is not a hold, same as a moving finger.
        onMouseMove: (e: React.MouseEvent) => {
          if (!startRef.current) return
          const dx = Math.abs(e.clientX - startRef.current.x)
          const dy = Math.abs(e.clientY - startRef.current.y)
          if (dx > moveTolerance || dy > moveTolerance) clear()
        },
        onMouseUp: clear,
        onMouseLeave: clear,
      }
    : {}

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1 || !pressStartsHere(e)) { clear(); return }
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
    ...mouseHandlers,
    onClickCapture: (e: React.MouseEvent) => {
      // The click that ends a fired long-press: the press already acted.
      if (justFired()) {
        firedAtRef.current = 0
        e.preventDefault()
        e.stopPropagation()
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      // Suppress browser context menu if long-press fired successfully,
      // so users don't see the OS menu on top of our action sheet.
      if (justFired()) e.preventDefault()
    },
  }
}
