// useDismissable — the one "close this popover" chokepoint: Escape, a press
// outside it, and focus moving into an iframe.
//
// An in-page `position: absolute` popover used to close only through its own
// trigger: the artifact page's Version history menu stayed open over the tags
// row after Escape or a tap elsewhere (overnight audit 2026-10-14, G7-5).
// usePortalDropdown delegates its outside-press close here too (with
// `escape: false`, since its callers own their keys), so the two dropdown
// hooks share one dismiss rule instead of two copies.
//
// `refs` are the elements that count as inside (the trigger and the menu): a
// press on the trigger must not close here, or the trigger's own toggle would
// re-open the menu on the same tap. Escape returns focus to the first ref, the
// trigger, so a keyboard user is not dropped onto <body>.
//
// Press rules:
// - Mouse and pen close on `pointerdown` outside.
// - Touch closes on the tap's `click`, not on `pointerdown`: a finger that
//   lands outside to SCROLL the page must not close the menu.
// - A press inside an iframe (the artifact frame) never reaches this document;
//   the window `blur` it causes does, so focus landing in an iframe closes too.
//
// Escape listens in the CAPTURE phase and stops propagation there, so one
// keypress closes the popover and not also the drawer or page behind it.

import { useEffect, type RefObject } from 'react'

export interface DismissableOptions {
  /** Close (and refocus the trigger) on Escape. Default true. */
  escape?: boolean
}

export function useDismissable(
  open: boolean,
  onClose: () => void,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  { escape = true }: DismissableOptions = {},
): void {
  useEffect(() => {
    if (!open) return
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && refs.some((r) => r.current?.contains(target))

    let lastPointerType = ''
    const onPointerDown = (e: PointerEvent) => {
      lastPointerType = e.pointerType
      if (e.pointerType === 'touch') return // wait for the tap's click
      if (!isInside(e.target)) onClose()
    }
    const onClick = (e: MouseEvent) => {
      if (lastPointerType !== 'touch') return
      if (!isInside(e.target)) onClose()
    }
    let blurTimer: ReturnType<typeof setTimeout> | undefined
    const onBlur = () => {
      // Read activeElement after focus has settled: it is the iframe when the
      // press landed inside one.
      blurTimer = setTimeout(() => {
        const active = document.activeElement
        if (active instanceof HTMLIFrameElement && !isInside(active)) onClose()
      }, 0)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      refs[0]?.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('blur', onBlur)
    if (escape) document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(blurTimer)
    }
    // refs are stable ref objects; listing them would re-subscribe on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, escape])
}
