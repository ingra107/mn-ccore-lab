// The one place display code picks a project or task NAME.
//
// Nick: show the project SHORT name everywhere, no "#" prefix. Today did this
// with its own inline `short_name || title`, while My Tasks built its project
// map from `title` alone and Deadlines and Calendar never read `short_title`,
// so three pages showed the long names Today hides (eval items 3 and 34,
// 2026-10-10). Every surface now asks this module for the label, and
// `__tests__/displayNames.test.ts` fails if an inline
// `short_name ||` / `short_title ||` fallback appears anywhere else in src.
//
// The full title stays reachable for HOVER only, through the *FullTitleHint
// helpers, which return undefined when the short label already says it all.

type ProjectNameFields = {
  short_name?: string | null
  title?: string | null
  slug?: string | null
  id?: string | null
}

type TaskNameFields = {
  short_title?: string | null
  title?: string | null
  description?: string | null
}

/** Short name first, then title, then slug, then id. Never a "#". */
export function projectShortLabel(p: ProjectNameFields): string {
  return p.short_name?.trim() || p.title?.trim() || p.slug || p.id || ''
}

/** The full project title for a hover tip, or undefined when the label already is it. */
export function projectFullTitleHint(p: ProjectNameFields): string | undefined {
  const full = p.title?.trim()
  return full && full !== projectShortLabel(p) ? full : undefined
}

/** slug -> short label, for pages that look a project up by `task.project_id`. */
export function projectShortLabelMap(projects: readonly ProjectNameFields[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of projects ?? []) {
    if (p.slug) map.set(p.slug, projectShortLabel(p))
  }
  return map
}

/** Curated short_title first, then title, then description. */
export function taskShortLabel(t: TaskNameFields): string {
  return t.short_title?.trim() || t.title?.trim() || t.description?.trim() || ''
}

/** The full task title for a hover tip, or undefined when the label already is it. */
export function taskFullTitleHint(t: TaskNameFields): string | undefined {
  const full = t.title?.trim() || t.description?.trim()
  return full && full !== taskShortLabel(t) ? full : undefined
}
