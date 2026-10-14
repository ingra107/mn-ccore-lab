// useDismissable — closes an in-page popover (a menu that is NOT portaled to
// <body>) on Escape and on a press outside it.
//
// usePortalDropdown owns this for portaled menus (outside click only; callers
// own keys). An in-page `position: absolute` popover had nothing, so it closed
// only through its own trigger: the artifact page's Version history menu stayed
// open over the tags row after Escape or a tap elsewhere (overnight audit
// 2026-10-14, G7-5). `pointerdown` covers mouse, pen and touch in one listener.
//
// `refs` are the elements that count as inside (the trigger and the menu): a
// press on the trigger must not close here, or the trigger's own toggle would
// re-open the menu on the same tap. Escape returns focus to the first ref, the
// trigger, so a keyboard user is not dropped onto <body>.

import { useEffect, type RefObject } from 'react'

export function useDismissable(
  open: boolean,
  onClose: () => void,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
): void {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && refs.some((r) => r.current?.contains(target))) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      refs[0]?.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
    // refs are stable ref objects; listing them would re-subscribe on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])
}
