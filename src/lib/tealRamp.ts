// tealRamp -- the one way a data bar gets its color (color back pick 7, Nick
// 2026-10-11: "for 7 i think you can use teal just do the dark to bright with
// that color!"). A bar's brightness carries its order: the first stage is the
// dim end (--sk-ramp-dim, index.css), the last is the full accent. Bars are
// "lit" like the cards: a brighter top edge over the color.

/** Color at position t in [0, 1]: 0 = the dim end, 1 = the full accent. */
export function tealRamp(t: number): string {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1
  const pct = Math.round(clamped * 100)
  return `color-mix(in srgb, var(--sk-ac) ${pct}%, var(--sk-ramp-dim))`
}

/** Ramp position of item i of n (one item = the full accent). */
export function rampStep(i: number, n: number): number {
  return n <= 1 ? 1 : i / (n - 1)
}

/** A lit bar fill: a brighter top edge fading into `color`. `top` is how much
 *  of the color stays in the top edge (the rest is white); keep it high where
 *  text sits on the bar. */
export function litFill(color: string, top = 84): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${color} ${top}%, #fff) 0%, ${color} 70%)`
}

/** The 1px highlight along a lit bar's top edge (same as the glossy button). */
export const LIT_EDGE = 'inset 0 1px 0 rgba(255,255,255,0.25)'

/** Teal that does NOT flip with the theme, for bars that carry white text
 *  (CLAUDE.md Rule 41 class): the light theme's accent, 6.6:1 with #fff. */
export const TEAL_STABLE = '#006b66'
