// profileCompleteness — when Today shows "Set up your profile" (nav redesign,
// 2026-10-09; Nick: "it prompts them to set up their profile ... and then
// they can snooze that if they don't want to do it now").
//
// The rule is drawn from what the Profile page edits (ProfilePage.tsx
// FIELD_LABELS: preferred name, full name, credentials, title, department,
// bio, photo URL, Google Scholar id) and from what the onboarding step asked
// for ("Add your photo, bio, and credentials so the team knows you"). A
// profile is INCOMPLETE while any of these three is empty:
//   - title      what the team and the public Team page show under the name
//   - bio        the short paragraph on the member page
//   - photo_url  the face on every card (Nick's "faces in the corner")
// Credentials, department and Scholar id are left out on purpose: a student
// or coordinator may rightly have no credentials, department is often blank
// for the whole lab, and a Scholar profile is optional. Names are seeded when
// the PI adds the member, so they are not asked for.

export const PROFILE_REQUIRED_FIELDS = ['title', 'bio', 'photo_url'] as const
export type ProfileRequiredField = (typeof PROFILE_REQUIRED_FIELDS)[number]

export const PROFILE_FIELD_NAMES: Record<ProfileRequiredField, string> = {
  title: 'title',
  bio: 'short bio',
  photo_url: 'photo',
}

/** The required fields this team_members row leaves empty, in display order. */
export function missingProfileFields(row: Record<string, unknown> | null | undefined): ProfileRequiredField[] {
  if (!row) return []
  return PROFILE_REQUIRED_FIELDS.filter((f) => {
    const v = row[f]
    return typeof v !== 'string' || v.trim().length === 0
  })
}

const SNOOZE_PREFIX = 'mnccore-profile-prompt-snooze:'

/** localStorage key for one person's snooze (per user, per device). */
export function snoozeKey(slug: string): string {
  return `${SNOOZE_PREFIX}${slug}`
}

/**
 * True while a snooze holds: the stored date is a civil date (YYYY-MM-DD) the
 * prompt stays hidden until, and `today` is before it.
 */
export function isSnoozed(stored: string | null, today: string): boolean {
  return !!stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) && today < stored
}
