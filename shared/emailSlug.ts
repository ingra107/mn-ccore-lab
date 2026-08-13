// shared/emailSlug.ts — the ONE map source for email-prefix → canonical
// team slug (PB backlog #1134). Previously hand-mirrored: `src/lib/emailSlug.ts`
// (`emailToSlug`, used by the UI's `canEditFeatured` gate) and `api/helpers.ts`
// (`actorSlug`, used by the Worker's `actorSlugFromRequest` write-auth check)
// each carried their own copy of this map. A drift between the two fails
// CLOSED but silently wrong — #906's evidence: a member added to one copy
// and not the other loses the edit BUTTON (frontend), while the API would
// still ACCEPT the write (backend), because the two copies disagreed on
// who that member's slug is.
//
// Both sides now import this one file, so adding a team member means
// editing one map, not keeping two in lockstep by hand.
//
// Precedent for a Worker+UI shared module: `shared/activityKinds.ts` and
// `shared/dbTime.ts` are already imported by both `api/` (see
// `tsconfig.api.json` — `"include": ["api/**/*.ts", "shared/**/*.ts"]`) and
// `src/` (plain relative import; `tsconfig.app.json`'s `"include": ["src"]`
// does not block resolving outside it under `moduleResolution: "bundler"`).

/** Phase 36b canonicalized team slugs to `preferred_name-last_name`
 *  (e.g. `nick-ingraham`). Email prefixes rarely match — Nick's UMN NetID
 *  is `ingra107`, not `nick-ingraham`. Keep in sync with `team_members.slug`
 *  — adding a new team member means adding a row here. Unknown prefixes
 *  fall through to the literal prefix (see `resolveEmailSlug` below). */
export const EMAIL_PREFIX_TO_SLUG: Record<string, string> = {
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

/**
 * Lowercased email local-part → canonical team slug, or the literal prefix
 * when the email is unrecognized. Assumes a non-empty `email` string —
 * callers that may receive `null`/`undefined` (the UI, before auth
 * hydrates) wrap this; see `emailToSlug` in `src/lib/emailSlug.ts`.
 */
export function resolveEmailSlug(email: string): string {
  const prefix = email.split('@')[0]?.toLowerCase() ?? ''
  return EMAIL_PREFIX_TO_SLUG[prefix] ?? prefix
}
