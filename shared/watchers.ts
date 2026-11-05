// shared/watchers.ts -- the one reader and writer of tasks.watchers, used by the
// Worker (handleUpdateTask) and by the task UI.
//
// A watcher can see the task: the read rule (taskRule in api/lib/table-scope.ts)
// runs json_each over the column, so only a JSON array grants anything. The
// panel used to send a comma list, which json_valid() would reject, to a route
// that refused the field. The server now stores the JSON array whatever it is
// sent; the reader still takes both shapes.

import { parseBlockedBy } from './blockedBy'

/** Watcher slugs in a stored or submitted value, in order, without blanks or repeats. */
export function parseWatchers(raw: unknown): string[] {
  if (Array.isArray(raw)) return parseBlockedBy(JSON.stringify(raw))
  return typeof raw === 'string' ? parseBlockedBy(raw) : []
}

/** The value to store: a JSON array, or null when nobody is watching. */
export function serializeWatchers(slugs: string[]): string | null {
  return slugs.length === 0 ? null : JSON.stringify(slugs)
}
