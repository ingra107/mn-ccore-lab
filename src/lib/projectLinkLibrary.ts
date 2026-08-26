/**
 * Pure helpers for ProjectLinkLibrary — role partition and contract sort.
 *
 * They live here rather than in the component file because a file that exports
 * both a component and plain functions breaks Fast Refresh
 * (react-refresh/only-export-components), which is an error in this repo.
 *
 * Dates are NOT formatted here: `formatDbLocal` in `./time` is the canonical
 * chokepoint for a stored D1 timestamp, and it already anchors a date-only
 * `YYYY-MM-DD` at noon local so the calendar day cannot roll backward.
 */

import { displayRank } from './pbLinkDisplayOrder.generated'
import type { StoredLink } from '../hooks/useApiData'

/** Contract order (iwd → docs → … → artifact → web), then the owner's sort_order. */
export function sortForDisplay(links: StoredLink[]): StoredLink[] {
  return [...links].sort(
    (a, b) => displayRank(a.type) - displayRank(b.type) || a.sort_order - b.sort_order,
  )
}

/** A row missing `role` predates the domain widening — treat it as current. */
export function partitionByRole(links: StoredLink[]): {
  current: StoredLink[]
  archived: StoredLink[]
} {
  const current: StoredLink[] = []
  const archived: StoredLink[] = []
  for (const link of links) {
    ;((link.role ?? 'key') === 'archive' ? archived : current).push(link)
  }
  return { current: sortForDisplay(current), archived: sortForDisplay(archived) }
}
