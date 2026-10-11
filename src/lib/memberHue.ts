/**
 * One personal hue per member (color back, pick 8; Nick 2026-10-11).
 *
 * A member's own page carries one quiet hue of their own: a low-chroma ring
 * on the avatar and the activity heatmap cells. Never text, never a dot, and
 * only on that member's page (LabPageLayout's `hueSeed`). The lightness and
 * chroma live in index.css (`.member-hue`); this file only picks the hue.
 *
 * The hue is derived from the person (their slug), so it needs no new data and
 * is the same on every visit and every machine. It is drawn from a window of
 * the OKLCH wheel (blue to violet) that sits at least 45 degrees from every
 * job color: teal (~189), red (~16-21), orange (~42-45) and gold (~85). The
 * test in __tests__/memberHue.test.ts reads those hues from index.css and
 * fails if the window ever drifts into one of them.
 */

/** First hue of the window, in OKLCH degrees. */
export const MEMBER_HUE_MIN = 235
/** Width of the window: hues run MIN .. MIN + SPAN - 1. */
export const MEMBER_HUE_SPAN = 90

/** The member's hue in OKLCH degrees, from a stable hash (FNV-1a) of the seed. */
export function memberHue(seed: string): number {
  let h = 2166136261
  for (const ch of seed) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return MEMBER_HUE_MIN + (h % MEMBER_HUE_SPAN)
}

/**
 * An activity cell at `strength` (0-1) of the heat color. The heat color is
 * teal unless the page sets --heat: a member's own page sets it to that
 * member's hue (.member-hue in index.css).
 */
export function heatColor(strength: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, strength)) * 100)
  return `color-mix(in srgb, var(--heat, var(--job-accent)) ${pct}%, transparent)`
}
