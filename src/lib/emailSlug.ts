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

// Mirror of `EMAIL_PREFIX_TO_SLUG` in `api/helpers.ts:239-261` (kept in the
// same order for diff-ability). Update BOTH sides in lockstep when adding a
// team member (CLAUDE.md Rule 34).
const EMAIL_PREFIX_TO_SLUG: Record<string, string> = {
  nick: 'nick-ingraham',       // old slug, kept so legacy records resolve
  ingra107: 'nick-ingraham',   // real UMN NetID
  ningraha: 'nick-ingraham',   // legacy email alias (W1 2026-04-29)
  nate: 'nate-mesfin',
  dudley: 'adams-dudley',
  chipman: 'jeff-chipman',
  mceachron: 'kendall-mceachron',
  safadi: 'sami-safadi',
  begnaud: 'abbie-begnaud',
  henkle: 'benjamin-henkle',
  macdonald: 'dave-macdonald',
  trujeque: 'josh-trujeque',
  pendleton: 'katie-pendleton',
  kalinoski: 'michael-kalinoski',
  wacker: 'dave-wacker',
  arriaza: 'steven-arriaza',
  bromley: 'emma-bromley',
  eddington: 'casey-eddington',
  shyu: 'dan-shyu',
  fitzgerald: 'beret-fitzgerald',
  collins: 'claire-collins',
}

export function emailToSlug(email: string | undefined | null): string {
  if (!email) return ''
  const prefix = email.split('@')[0]?.toLowerCase() ?? ''
  return EMAIL_PREFIX_TO_SLUG[prefix] ?? prefix
}
