// grantMechanism — the ONE mechanism-family → color primitive (PB backlog #908).
//
// Two DISTINCT source fields feed grant coloring, and they are NOT renames of
// each other (verified against prod D1 + PB enums.py, 2026-07-29):
//
//   - `grants.mechanism` — the literal NIH mechanism on the award
//     (prod value space today: R01, R03, K23).
//   - `projects.type`    — PB's closed classification enum
//     (R01 / R03 / K / CLIF / Nick_Lab / Friends / Mentees / Admin / Personal;
//     SSOT: Peripheral-Brain scripts/db/enums.py). `K` is the deliberate
//     GENERIC bucket for any K-series award (K23, K99, K08, ...).
//
// The shared axis is the mechanism FAMILY. `mechanismFamily()` normalizes both
// value spaces onto it; the color maps key on family only. Before this module,
// four hand-rolled switches (GrantTimelineCard, GrantsPage x2, Projects) keyed
// on raw strings and silently disagreed: GrantsPage colored the K family teal
// (a 2026-03-30 copy of the dashboard palette that flattened K23 into R01's
// teal, no recorded rationale) while the original dashboard (2026-03-24) and
// the newest deliberate badge work (f466be13, 2026-07-23) both use gold.
// Family colors here: R01 teal, R03 maroon, K gold, other slate.
//
// TWO render lanes, on purpose — do not merge them:
//
//   - MECHANISM_ACCENT: theme-flipping CSS vars. For badge text, gantt
//     strokes, anything where the color is text-adjacent and must flip with
//     the theme.
//   - MECHANISM_FILL: theme-STABLE literal hex. For solid bar fills with
//     white text sitting on top (GrantTimelineCard). Same class as the
//     `--stage-fill-*` tokens (CLAUDE.md Rule 41): accent vars flip to light
//     dark-mode variants where #fff text fails contrast, so fills must not
//     use them.
//
// Adding a mechanism family (R21, U01, T32...)? Add it to the type + BOTH
// maps + `mechanismFamily()` — the Record<MechanismFamily, ...> types make a
// missing map entry a compile error.

export type MechanismFamily = 'R01' | 'R03' | 'K' | 'other'

/** Normalize either source field (grants.mechanism OR projects.type) onto the
 *  mechanism-family axis. `K` + any K-series award (K23, K99, K08...) → 'K'.
 *  Unknown / non-grant / null values → 'other'. */
export function mechanismFamily(value: string | null | undefined): MechanismFamily {
  if (!value) return 'other'
  const v = value.trim().toUpperCase()
  if (v === 'R01') return 'R01'
  if (v === 'R03') return 'R03'
  if (v === 'K' || /^K\d/.test(v)) return 'K'
  return 'other'
}

/** Theme-flipping accent per family — badge text, gantt strokes. */
export const MECHANISM_ACCENT: Record<MechanismFamily, string> = {
  R01: 'var(--teal)',
  R03: 'var(--maroon)',
  K: 'var(--gold)',
  other: 'var(--slate)',
}

/** Theme-STABLE fill per family — solid bars carrying white text (Rule 41
 *  class). Values are byte-identical to GrantTimelineCard's original 2026-03-24
 *  palette; keep them literal hex, never accent vars. */
export const MECHANISM_FILL: Record<MechanismFamily, string> = {
  R01: '#2d8a8a',
  R03: '#7a0019',
  K: '#c9a84c',
  other: '#64748b',
}
