// useDragAutoScroll — window auto-scroll during a native HTML5 drag.
//
// Native HTML5 drag-and-drop does NOT scroll the document while the pointer is
// held — so a draggable that starts below the fold can never reach a drop zone
// that is scrolled off-screen. On Today the timeline drop zones render ABOVE
// the task list, so dragging a below-fold task up to a slot is impossible
// without this. While any drag is in flight we listen for `dragover` (which
// fires continuously on whatever is under the cursor and bubbles to window) and
// nudge the window when the cursor enters a margin band at the top/bottom of
// the viewport. Speed ramps with proximity to the edge. No-op outside a drag,
// since `dragover` only fires during one.

import { useEffect } from 'react'

export function useDragAutoScroll(margin = 90, maxStep = 18): void {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      const h = window.innerHeight
      const y = e.clientY
      let dy = 0
      if (y < margin) dy = -maxStep * (1 - y / margin)
      else if (y > h - margin) dy = maxStep * (1 - (h - y) / margin)
      if (dy !== 0) window.scrollBy(0, dy)
    }
    window.addEventListener('dragover', onDragOver)
    return () => window.removeEventListener('dragover', onDragOver)
  }, [margin, maxStep])
}
