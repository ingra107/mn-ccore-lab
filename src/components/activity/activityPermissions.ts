// activityPermissions.ts — client-side mirror of the server's author-or-PI
// delete rule (handleDeleteActivityEntry, api/routes/activity.ts). Split out
// of activityRender.tsx (a components-only file) so this predicate — the
// only non-component export the activity-feed surfaces needed — has its own
// home. Gates whether the trash button renders on an entry; the server
// re-enforces regardless.

import { emailToSlug } from '../../lib/emailSlug'

export function canDeleteActivityEntry(
  user: { email?: string; isPi?: boolean } | null | undefined,
  actorSlug: string,
): boolean {
  if (user?.isPi) return true
  const viewerSlug = emailToSlug(user?.email)
  return !!viewerSlug && actorSlug === viewerSlug
}
