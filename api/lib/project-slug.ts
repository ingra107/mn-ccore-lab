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

// ── Slug claims (interim, cold re-review 2026-10-09) ───────────────────────────
//
// A slug the read rule matches is a key to every row that names it. The live
// unique index stops a person taking a live project's slug, but not a slug a
// deleted (or hidden, or long-gone) project used, nor one still sitting as a
// reference in a child table with no live owner: claim it and those rows become
// yours. So a person may not create or rename a project to any slug that is
// already CLAIMED: used by any project row ever (deleted included, by slug or
// id), or present in any column the visibility rule reads as a project
// reference. The Level-1 cure is to rekey the slug-keyed columns to typed ids
// and drop the slug arm (a later lane); this is the interim guard.
//
// The answer needs the whole table, which a person's viewer-bound handle cannot
// see, so index.ts hands the routes this oracle built on the unscoped handle:
// a yes/no on one value, never a handle (api/health-unscoped.test.ts pins it).

/** Every column the visibility rule (api/lib/table-scope.ts) reads as a project reference. */
export const SLUG_REF_COLUMNS: ReadonlyArray<readonly [table: string, column: string, where?: string]> = [
  ['projects', 'slug'], ['projects', 'id'],
  ['tasks', 'project_id'], ['agenda_items', 'project_id'], ['artifacts', 'project_id'], ['activity_entries', 'project_id'],
  ['conference_submissions', 'project_id'], ['manuscript_revisions', 'project_id'], ['regulatory_items', 'project_id'],
  ['submission_events', 'project_id'], ['project_documents', 'project_id'], ['project_publications', 'project_id'],
  ['project_state_log', 'project_id'], ['file_activity_daily', 'project_id'], ['milestones', 'project_id'],
  ['ideas', 'project_id'], ['inbox', 'project_id'], ['project_members', 'project_id'],
  ['project_dependencies', 'from_project_id'], ['project_dependencies', 'to_project_id'],
  ['contributions', 'project_slug'], ['lab_questions', 'project_slug'], ['paper_project_links', 'project_slug'],
  ['narrative_projects', 'project_slug'], ['hub_decisions', 'project_slug'], ['ai_requests', 'project_slug'],
  ['commitments', 'project'],
  ['activity_entries', 'entity_id', "entity_type = 'project'"],
  ['activity_log', 'related_id', "COALESCE(NULLIF(related_type, ''), type, '') IN ('project', 'projects')"],
  ['links', 'owner_id', "owner_table = 'projects'"],
  ['file_attachments', 'entity_id', "entity_type = 'project'"],
  ['entity_seen', 'entity_id', "entity_type = 'project'"],
  ['watchlist', 'entity_id', "entity_type = 'project'"],
]

export type SlugClaimCheck = (slug: string) => Promise<boolean>

const CLAIM_SQL = 'SELECT 1 AS claimed WHERE '
  + SLUG_REF_COLUMNS.map(([t, c, w]) => `EXISTS (SELECT 1 FROM ${t} WHERE ${c} = ?${w ? ` AND ${w}` : ''})`).join(' OR ')

/** The oracle: true when `slug` is claimed anywhere. `raw` must be the UNSCOPED handle. */
export function slugClaimCheck(raw: D1Database): SlugClaimCheck {
  return async (slug) => {
    const row = await raw.prepare(CLAIM_SQL).bind(...SLUG_REF_COLUMNS.map(() => slug)).first<{ claimed: number }>()
    return !!row
  }
}
