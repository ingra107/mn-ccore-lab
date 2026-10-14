/**
 * The y where usable screen ends: the top edge of the fixed phone tab bar
 * (MobileTabBar, marked `data-bottom-bar`) when it is showing, else the
 * viewport bottom. Below lg the bar owns the bottom ~57px of the screen, so
 * anything fitted or clamped "to the viewport" must stop here instead, or it
 * ends up under the bar (the swipe menu's Archive item, 2026-10-14) or is
 * fitted to the wrong number (My Tasks' shell). lg:hidden gives the bar an
 * empty rect, so desktop gets innerHeight.
 */
export function viewportBottom(): number {
  const vh = window.innerHeight
  const bar = document.querySelector<HTMLElement>('[data-bottom-bar]')
  const r = bar?.getBoundingClientRect()
  return r && r.height > 0 ? Math.min(vh, r.top) : vh
}

/**
 * Top for a fixed dropdown that opens under `rect`: 4px below the trigger,
 * pulled up when `reserve` px of menu would run past usable screen, which
 * ends at the phone tab bar (viewportBottom), not the window edge. One clamp
 * for InlineSelect, InlineDatePicker and GhostSelect.
 */
export function dropdownTop(rect: { bottom: number }, reserve: number): number {
  return Math.min(rect.bottom + 4, viewportBottom() - reserve)
}
