/**
 * Pure helpers for ProjectLinkLibrary — role partition, contract sort, dates.
 *
 * They live here rather than in the component file because a file that exports
 * both a component and plain functions breaks Fast Refresh
 * (react-refresh/only-export-components), which is an error in this repo.
 */

import { displayRank } from './pbLinkDisplayOrder.generated'
import type { StoredLink } from '../hooks/useApiData'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "12 Aug 2026" from a D1 timestamp — short, unambiguous, timezone-proof.
 *
 * Parses the Y/M/D characters directly instead of going through `new Date(str)`.
 * That matters: a bare "2026-08-25" is spec'd to parse as UTC midnight, which
 * `toLocaleDateString` then renders in US Central as 24 Aug — every date-only
 * link would display a day early. D1 writes "YYYY-MM-DD HH:MM:SS", but the
 * date-only form reaches us from older rows and from PB's local-time defaults,
 * so the shift is real, not hypothetical.
 *
 * Anything that is not a leading YYYY-MM-DD degrades to null (no date shown)
 * rather than rendering "Invalid Date".
 */
export function formatLinkDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return `${Number(m[3])} ${MONTHS[month - 1]} ${m[1]}`
}

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
