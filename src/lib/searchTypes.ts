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
