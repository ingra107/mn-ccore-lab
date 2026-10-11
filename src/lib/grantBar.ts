// grantBar -- the one place that colors a grant bar (Grants timeline, Lab
// Overview's Grant Portfolio card).
//
// Color jobs (rules-ui-design principle 21, Nick 2026-10-11): a grant's
// mechanism is a label, not a meaning, so the bar is gray. Funded = solid,
// proposed = dashed outline; the shape carries the difference, not a hue.
// This replaced grantMechanism.ts, whose R01 teal / R03 maroon / K gold maps
// spent three accent colors on a field that wants none.

/** Funded bar fill. Theme-STABLE literal hex because white text sits on it
 *  (CLAUDE.md Rule 41 class; 4.8:1 with #fff). Never a theme-flipping var. */
export const GRANT_BAR_FILL = '#64748b'

/** Proposed bar: dashed outline and its label. Theme-flipping, no fill. */
export const GRANT_BAR_STROKE = 'var(--slate)'
