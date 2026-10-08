// shared/emailSlug.ts — the two pieces of slug logic that are NOT identity
// data, shared by the Worker (`api/helpers.ts::resolveSlug`) and the UI
// (`src/lib/emailSlug.ts`).
//
// #8945 (2026-10-08): who a logged-in email IS now comes from one place, the
// `team_members.email` column, resolved server-side and handed to the UI on
// `/api/auth/me` (`slug` for the caller, `directory` for rendering other
// people's emails). The hand-kept `EMAIL_PREFIX_TO_SLUG` NetID map that used
// to live here is gone: every member missing from it got a ghost account and
// an empty My Tasks on first login (Casey eddin022@, Nate mesfin@), and its
// "keys" for the other 16 members were surname guesses, not NetIDs. Adding a
// team member is now a data edit (their row's `email`), never a code edit.

/** Pre-Phase-36b slugs still stored on rows (tasks.assignee holds `nick` and
 *  `ningraha`, 2026-10-08). A CLOSED set of old values, never a list of
 *  members: a new member never goes here. Delete it once no row carries
 *  either value. */
export const LEGACY_SLUG_ALIASES: Readonly<Record<string, string>> = {
  nick: 'nick-ingraham',
  ningraha: 'nick-ingraham',
}

/** Lowercased local part of an email: the slug a brand-new member is given
 *  (`ensureTeamMember`) and the fallback when no team_members row carries
 *  the email. */
export function emailPrefix(email: string): string {
  return (email.split('@')[0] ?? '').trim().toLowerCase()
}
