// grantBar -- the one place that colors a grant bar (Grants timeline, Lab
// Overview's Grant Portfolio card).
//
// Color jobs (rules-ui-design principle 21, Nick 2026-10-11): a grant's
// mechanism is a label, not a meaning, so every funded bar is the SAME color.
// Funded = solid, proposed = dashed outline; the shape carries the difference.
// Color back pick 7 (Nick 2026-10-11): data bars are teal, so funded bars are
// teal-lit. This replaced grantMechanism.ts, whose R01 teal / R03 maroon / K
// gold maps spent three colors on a field that wants none.
import { TEAL_STABLE, litFill } from './tealRamp'

/** Funded bar color. Theme-STABLE literal hex because white text sits on it
 *  (CLAUDE.md Rule 41 class; 6.6:1 with #fff). Never a theme-flipping var. */
export const GRANT_BAR_FILL = TEAL_STABLE

/** Funded bar's top edge: TEAL_STABLE mixed 90/10 with white, as a literal
 *  so an SVG stop-color can take it. Still 5:1 with #fff. */
export const GRANT_BAR_TOP = '#1a7a75'

/** Funded bar background for HTML bars (the SVG timeline uses GRANT_BAR_TOP
 *  and GRANT_BAR_FILL as its gradient stops: the same lit fill). */
export const GRANT_BAR_LIT = litFill(TEAL_STABLE, 90)

/** Proposed bar: dashed outline and its label. Theme-flipping, no fill. */
export const GRANT_BAR_STROKE = 'var(--slate)'
