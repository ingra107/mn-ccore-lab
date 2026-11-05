// shared/watchers.ts -- the one reader and writer of tasks.watchers, used by the
// Worker (handleUpdateTask) and by the task UI.
//
// A watcher can see and edit the task (taskRule in api/lib/table-scope.ts) and
// is notified when it changes (api/lib/task-watchers.ts). The server stores a
// JSON array whatever it is sent. An older comma list still reads, here and in
// the rule.

import { parseBlockedBy } from './blockedBy'

/** Watcher slugs in a stored or submitted value, in order, without blanks or repeats. */
export function parseWatchers(raw: unknown): string[] {
  if (Array.isArray(raw)) return parseBlockedBy(JSON.stringify(raw))
  return typeof raw === 'string' ? parseBlockedBy(raw) : []
}

/** The same people, whatever the spelling or order of the two stored values. */
export function sameWatchers(a: unknown, b: unknown): boolean {
  const left = new Set(parseWatchers(a))
  const right = new Set(parseWatchers(b))
  return left.size === right.size && [...left].every((s) => right.has(s))
}

/** The value to store: a JSON array, or null when nobody is watching. */
export function serializeWatchers(slugs: string[]): string | null {
  return slugs.length === 0 ? null : JSON.stringify(slugs)
}
