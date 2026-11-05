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

import { withKindLabel } from '../../shared/taskKinds'

type ProjectNameFields = {
  short_name?: string | null
  title?: string | null
  slug?: string | null
  id?: string | null
}

type TaskSubjectFields = {
  short_title?: string | null
  title?: string | null
  description?: string | null
}

type TaskNameFields = TaskSubjectFields & {
  /** REQUIRED key (schema-v156): the text label comes from the kind, never the
   *  title, so a caller whose row type lacks `kind` fails tsc instead of
   *  rendering a check-in or milestone unlabelled. `null`/`undefined` read as
   *  a plain task. */
  kind: string | null | undefined
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

/** The bare subject: curated short_title first, then title, then description.
 *  For a row that DRAWS its kind itself (CheckinRow's "Check-in" label, a
 *  milestone's diamond) and for sort keys. Every other surface: taskShortLabel. */
export function taskSubjectLabel(t: TaskSubjectFields): string {
  return t.short_title?.trim() || t.title?.trim() || t.description?.trim() || ''
}

/** Does a task match a typed search? It matches the long title AND the label the
 *  row shows (short title first), so typing what you read finds the row. */
export function taskMatchesSearch(t: TaskSubjectFields, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (t.title ?? '').toLowerCase().includes(q) || taskSubjectLabel(t).toLowerCase().includes(q)
}

/** What a text surface shows: the subject, named by its kind when the kind is
 *  one a reader must be told ("Check-in: X", "Milestone: X";
 *  shared/taskKinds.ts withKindLabel, schema-v156). */
export function taskShortLabel(t: TaskNameFields): string {
  return withKindLabel(t.kind, taskSubjectLabel(t))
}

/** The full task title for a hover tip, or undefined when the subject already is it. */
export function taskFullTitleHint(t: TaskSubjectFields): string | undefined {
  const full = t.title?.trim() || t.description?.trim()
  return full && full !== taskSubjectLabel(t) ? full : undefined
}
