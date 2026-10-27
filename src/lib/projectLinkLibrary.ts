/**
 * Pure helpers for ProjectLinkLibrary — role/tier partition, kind filter, and
 * contract sort.
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
import type { LinkKind, StoredLink } from '../hooks/useApiData'

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

/** A task's document on the project page (#151): one URL, every task row
 *  holding it. `link` is the row shown (the first current one, else the first). */
export interface TaskDoc {
  url: string
  link: StoredLink
  rows: StoredLink[]
}

/**
 * The project page's one Links card (#2091, two tiers since #151). Every input
 * lands in exactly one bucket:
 *   pinned          -- a current project row whose URL is ALSO one of the
 *                      project's three key-link slots. The slot chip already
 *                      shows it at the top of the card (design principle 2:
 *                      each piece of info exactly once).
 *   current         -- "On every task": every other current project row
 *                      (and derived chips), contract-sorted.
 *   archived        -- project rows at role='archive', in the collapsed group.
 *   fromTasks       -- "From tasks": task rows grouped by URL, where at least
 *                      one task still holds it as current.
 *   archivedFromTasks -- task URL groups every holder archived; they sit in
 *                      the collapsed Archived group too, restorable from there.
 *   shadowed        -- task rows whose URL a project row already shows in any
 *                      role. Not rendered: the project's own row is the one place
 *                      that document appears (a promoted COPY shows once). The
 *                      Worker drops these already; the partition stays total.
 * An archived project row is never folded into `pinned`: it is history, and
 * the archived group is the only place it can be restored from.
 */
export function partitionForProjectPage(
  links: StoredLink[],
  slotUrls: ReadonlyArray<string | null | undefined>,
  taskLinks: StoredLink[] = [],
): {
  pinned: StoredLink[]; current: StoredLink[]; archived: StoredLink[]
  fromTasks: TaskDoc[]; archivedFromTasks: TaskDoc[]; shadowed: StoredLink[]
} {
  const slots = new Set(
    slotUrls.filter((u): u is string => !!u && u.trim().length > 0).map(slotKey),
  )
  const { current: live, archived } = partitionByRole(links)
  const pinned: StoredLink[] = []
  const current: StoredLink[] = []
  for (const link of live) {
    ;(slots.has(link.canonical_url) ? pinned : current).push(link)
  }

  const held = new Set(links.map((l) => l.canonical_url))
  const shadowed: StoredLink[] = []
  const groups = new Map<string, StoredLink[]>()
  for (const row of taskLinks) {
    if (held.has(row.canonical_url)) { shadowed.push(row); continue }
    const g = groups.get(row.canonical_url)
    if (g) g.push(row)
    else groups.set(row.canonical_url, [row])
  }
  const fromTasks: TaskDoc[] = []
  const archivedFromTasks: TaskDoc[] = []
  for (const [url, rows] of groups) {
    const currentRows = rows.filter((r) => (r.role ?? 'key') !== 'archive')
    const doc = { url, link: currentRows[0] ?? rows[0], rows }
    ;(currentRows.length > 0 ? fromTasks : archivedFromTasks).push(doc)
  }
  const byDisplay = (a: TaskDoc, b: TaskDoc) => displayRank(a.link.type) - displayRank(b.link.type)
  fromTasks.sort(byDisplay)
  archivedFromTasks.sort(byDisplay)
  return { pinned, current, archived, fromTasks, archivedFromTasks, shadowed }
}

/** The kind filter's value: every kind, one kind, or the rows with none. */
export type KindFilter = 'all' | 'unfiled' | string

/** A row's kind under the filter: NULL/absent kind is Unfiled. */
export function matchesKind(link: Pick<StoredLink, 'kind'>, filter: KindFilter): boolean {
  if (filter === 'all') return true
  const k = link.kind ?? null
  return filter === 'unfiled' ? k === null : k === filter
}

/** The label a row shows for its kind; 'Unfiled' when it has none, the raw key
 *  when the vocabulary does not (yet) list it. */
export function kindLabel(kind: string | null | undefined, kinds: ReadonlyArray<LinkKind>): string {
  if (!kind) return 'Unfiled'
  return kinds.find((k) => k.key === kind)?.label ?? kind
}

/** The filter chips: the kinds present on the page, in vocabulary order, then
 *  Unfiled when any stored row has no kind. Derived rows carry no kind and no
 *  row to label, so they never add Unfiled. */
export function kindFilterOptions(
  rows: ReadonlyArray<Pick<StoredLink, 'kind' | 'role'>>,
  kinds: ReadonlyArray<LinkKind>,
): { value: KindFilter; label: string; count: number }[] {
  const stored = rows.filter((r) => r.role !== 'derived')
  const counts = new Map<string, number>()
  let unfiled = 0
  for (const r of stored) {
    if (r.kind) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
    else unfiled += 1
  }
  const out: { value: KindFilter; label: string; count: number }[] = []
  for (const k of kinds) {
    const n = counts.get(k.key)
    if (n) out.push({ value: k.key, label: k.label, count: n })
  }
  for (const [key, n] of counts) {
    if (!kinds.some((k) => k.key === key)) out.push({ value: key, label: key, count: n })
  }
  if (unfiled > 0) out.push({ value: 'unfiled', label: 'Unfiled', count: unfiled })
  return out
}

/** Only stored rows carry a role the Worker can change; `derived` rows are
 *  synthesised per request from project columns and have no row to update.
 *  A product's draft rows (product_id, schema-v149) move only through the
 *  current-draft route, which the Worker enforces; no button offers it here. */
export function canChangeRole(link: StoredLink): boolean {
  return (link.role === 'key' || link.role === 'archive') && !link.product_id
}

/** Kind is a separate permission: any stored row may be labelled, a product's
 *  draft rows included (the Worker's guard permits kind; it refuses only role,
 *  owner and URL changes on them). Derived rows have no row to update. */
export function canEditKind(link: StoredLink): boolean {
  return link.role === 'key' || link.role === 'archive' || link.role === 'current_draft'
}
