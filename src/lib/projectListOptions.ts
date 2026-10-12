// Option sets for the inline editors on a project, in the Today card's
// grayscale (rules-ui-design #1: color is spent, not sprinkled). Shared by the
// Projects list and the project detail meta row so the two cannot drift.
// Status keeps color for blocked and waiting only; group is
// muted t3. The label colors reach both the trigger and the menu through
// InlineSelect's `color`.
import { PROJECT_STATUS_OPTIONS } from './taskConstants'
import { stripConsortiumPrefix, stripGrantTypePrefix } from './textUtils'
import { projectShortLabel } from './displayNames'

export const LIST_T2 = 'var(--sk-t2)'
export const LIST_T3 = 'var(--sk-t3)'

export const STATUS_LIST_OPTIONS = PROJECT_STATUS_OPTIONS.map((o) => ({
  ...o,
  color: o.value === 'blocked' || o.value === 'waiting_external' ? o.color : LIST_T2,
}))

export type ProjectHealth = { score: number; status: string }

/** Poor health: the one threshold behind both the Projects list's health bar
 *  and its "Needs Attention" filter, so the two cannot disagree. */
export const POOR_HEALTH_SCORE = 50
export const isPoorHealth = (h: ProjectHealth | undefined): h is ProjectHealth => !!h && h.score < POOR_HEALTH_SCORE

type ProjectTitleFields = { title: string; type?: string | null; short_name?: string | null; slug?: string; id?: string }

/** The title without its consortium tag and (for a grant-type project) its
 *  mechanism prefix: the grant tag already shows it. */
export function cleanProjectTitle(p: ProjectTitleFields): string {
  return stripGrantTypePrefix(stripConsortiumPrefix(p.title || '').clean, p.type)
}

/** The name a Projects-list row shows: the curated short name, else the
 *  cleaned title. The Title sort uses it too, so the order follows the text. */
export function projectRowName(p: ProjectTitleFields): string {
  return p.short_name?.trim() || cleanProjectTitle(p) || projectShortLabel(p)
}

/** Any category option set, recolored to muted t3. */
export function mutedCategoryOptions<T extends { value: string; label: string }>(options: T[]): (T & { color: string })[] {
  return options.map((o) => ({ ...o, color: LIST_T3 }))
}
