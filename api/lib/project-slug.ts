// project-slug.ts -- what a project slug may be (2026-10-09, cold review of
// the membership lane).
//
// A slug is a second spelling of a project reference: the visibility rule
// (api/lib/table-scope.ts VISIBLE_PROJECT_REFS) admits a child row whose
// project column holds either a visible project's id or its slug. So a slug
// that spells ANOTHER project's id is a key to that project: a member renames
// their own project's slug to a hidden project's typed id (which the task wire
// form used to leak) and every row keyed on that id becomes theirs to read,
// write and cascade-delete. Three layers keep a slug from ever being an id:
//   1. Every write path checks the value here: person edits get the full
//      format (the same [a-z0-9-] Hub create sanitizes to, and PB's
//      python-slugify emits), and the mutation chokepoint refuses an
//      id-shaped slug from any caller, the PB key included.
//   2. schema-v121 refuses it in D1 itself (trigger), whoever writes.
//   3. The read rule ignores an id-shaped slug, so a row that predates 1-2
//      still grants nothing.

/** The slug format Hub create produces and PB's slugify emits: lowercase words joined by single hyphens. */
export const PROJECT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidProjectSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= 100 && PROJECT_SLUG_RE.test(slug)
}

/** A value shaped like a typed project id (proj_*, any case). A slug may never be one. */
export function looksLikeProjectId(value: unknown): boolean {
  return typeof value === 'string' && value.slice(0, 5).toLowerCase() === 'proj_'
}
