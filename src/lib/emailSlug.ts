// Email-prefix → canonical team slug map.
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
// Mirror of `EMAIL_PREFIX_TO_SLUG` in `api/helpers.ts`. Update both in
// lockstep when adding a team member.

const EMAIL_PREFIX_TO_SLUG: Record<string, string> = {
  ingra107: 'nick-ingraham',
  nick: 'nick-ingraham',
  nate: 'nate-mesfin',
}

export function emailToSlug(email: string | undefined | null): string {
  if (!email) return ''
  const prefix = email.split('@')[0]?.toLowerCase() ?? ''
  return EMAIL_PREFIX_TO_SLUG[prefix] ?? prefix
}
