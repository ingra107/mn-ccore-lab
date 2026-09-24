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
import { normalizeLink } from './pbLinks.generated'
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

/** The URL a key-link slot resolves to on the links table: the contract's
 *  canonical form when the normalizer recognises it, else the trimmed raw. */
function slotKey(url: string): string {
  const trimmed = url.trim()
  return normalizeLink(trimmed)?.canonical_url ?? trimmed
}

/**
 * The project page's one Links card (#2091). Three buckets, and every input
 * lands in exactly one:
 *   pinned   -- a current row whose URL is ALSO one of the project's three
 *               key-link slots. The slot chip already shows it at the top of
 *               the card, so the library does not render it a second time
 *               (design principle 2: each piece of info exactly once).
 *   current  -- every other non-archived row, contract-sorted.
 *   archived -- role='archive', shown in the collapsed group.
 * An archived row is never folded into `pinned`: it is history, and the
 * archived group is the only place it can be restored from.
 */
export function partitionForProjectPage(
  links: StoredLink[],
  slotUrls: ReadonlyArray<string | null | undefined>,
): { pinned: StoredLink[]; current: StoredLink[]; archived: StoredLink[] } {
  const slots = new Set(
    slotUrls.filter((u): u is string => !!u && u.trim().length > 0).map(slotKey),
  )
  const { current: live, archived } = partitionByRole(links)
  const pinned: StoredLink[] = []
  const current: StoredLink[] = []
  for (const link of live) {
    ;(slots.has(link.canonical_url) ? pinned : current).push(link)
  }
  return { pinned, current, archived }
}

/** Only stored rows carry a role the Worker can change; `derived` rows are
 *  synthesised per request from project columns and have no row to update. */
export function canChangeRole(link: StoredLink): boolean {
  return link.role === 'key' || link.role === 'archive'
}
