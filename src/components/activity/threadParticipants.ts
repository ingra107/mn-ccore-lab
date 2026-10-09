import type { ActivityEntryItemRow } from './activityRender'

/** Distinct people in the thread, root author first, then in order of joining. */
export function threadParticipants(root: ActivityEntryItemRow, replies: ActivityEntryItemRow[]): string[] {
  const seen: string[] = []
  for (const e of [root, ...replies]) if (!seen.includes(e.actor_slug)) seen.push(e.actor_slug)
  return seen
}
