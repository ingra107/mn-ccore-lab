// The order search result types appear in (chips and the By-type view). A type
// the API returns that is not listed here still shows, after the listed ones, so
// adding a result type to the route cannot make it vanish from a view.
// (Products and artifacts were missing from a hand-kept list: the "All" chip
// said 50 and the type chips summed to 38.)
export const SEARCH_TYPE_ORDER = [
  'task', 'project', 'product', 'meeting', 'idea',
  'note', 'task_note', 'comment', 'task_comment',
  'decision', 'file',
  'publication', 'grant', 'artifact', 'activity',
] as const

export function orderSearchTypes(present: Iterable<string>): string[] {
  const have = new Set(present)
  const known = (SEARCH_TYPE_ORDER as readonly string[]).filter((t) => have.has(t))
  const extra = [...have].filter((t) => !(SEARCH_TYPE_ORDER as readonly string[]).includes(t))
  return [...known, ...extra]
}

/** Enter on a focused result. A result on the public site opens a new tab, as a
 *  click on its row does: the portal has no way back from it. */
export function openSearchResult(
  item: { url?: string | null; details?: { external?: unknown } | null },
  win: Pick<Window, 'open' | 'location'> = window,
): void {
  if (!item.url) return
  if (item.details?.external) win.open(item.url, '_blank', 'noopener')
  else win.location.href = item.url
}
