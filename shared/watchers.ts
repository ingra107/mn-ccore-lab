// shared/watchers.ts -- reads and writes the tasks.watchers value. The task panel
// and the task card read through parseWatchers.
//
// A watcher can see the task: the read rule (taskRule in api/lib/table-scope.ts)
// runs json_each over the column, so only a JSON array grants anything.
//
// The Worker does not use this module yet. POST /api/tasks/:id refuses `watchers`
// (it is not in TASK_ALLOWED_FIELDS), so nothing can set the field from the Hub and
// the panel shows stored values read-only. serializeWatchers has no caller until
// the server half lands. The reader takes both the JSON and the old comma shape.

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
