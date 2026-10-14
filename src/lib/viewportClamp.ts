// Place an anchored dropdown so it never leaves the screen.
//
// A dropdown anchored to one edge of its trigger with a fixed width runs off
// the opposite screen edge whenever the trigger sits closer to that edge than
// the panel is wide (the public bell on a 390px phone opened 72px past the
// left edge). Every anchored panel goes through this one function so the
// width and the left offset are always derived together.

export const VIEWPORT_GUTTER = 12

export interface AnchoredBox {
  /** Panel width in px: the preferred width, shrunk to fit the viewport. */
  width: number
  /** Panel left in px, relative to the trigger's own left edge. */
  left: number
}

export function clampToViewport(
  trigger: { left: number; right: number },
  preferredWidth: number,
  viewportWidth: number,
  align: 'left' | 'right',
  gutter: number = VIEWPORT_GUTTER,
): AnchoredBox {
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - gutter * 2))
  const desired = align === 'right' ? trigger.right - width : trigger.left
  const maxLeft = viewportWidth - gutter - width
  const clamped = Math.min(Math.max(desired, gutter), maxLeft)
  return { width, left: clamped - trigger.left }
}
