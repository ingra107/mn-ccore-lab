// Email → canonical team slug for the UI.
//
// Phase 36b canonicalized team slugs to `preferred_name-last_name` format
// (e.g. `nick-ingraham`). Email prefixes rarely match — Nick's UMN NetID
// is `ingra107`, not `nick-ingraham`. Any code that derives a user's
// canonical slug from their email MUST route through this LUT, otherwise:
//
// - Sidebar user-profile link points to `/portal/team/ingra107` (404)
// - Notifications / unread counts key on the wrong slug
// - Task assignee filters miss the user's own tasks
//
// The map lives in `shared/emailSlug.ts` (PB backlog #1134) — imported by
// BOTH this file and the Worker's `actorSlug` (`api/helpers.ts`) — so the
// two sides can no longer drift the way they did before #1134 (a member in
// one map and not the other lost the `canEditFeatured` edit button while
// the API still accepted the write). Adding a team member means adding a
// row to `shared/emailSlug.ts` once, not mirroring it here too.
import { resolveEmailSlug } from '../../shared/emailSlug'

export function emailToSlug(email: string | undefined | null): string {
  if (!email) return ''
  return resolveEmailSlug(email)
}
