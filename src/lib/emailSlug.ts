// Email → team slug, for RENDERING other people's stored emails in the UI
// (tasks.assigned_by / completed_by hold an email on older rows).
//
// #8945: this is no longer how the UI learns who the LOGGED-IN user is. That
// is `useAuth().user.slug`, resolved by the Worker from `team_members.email`
// and returned on /api/auth/me. The NetID map this file used to wrap
// (`EMAIL_PREFIX_TO_SLUG`) is gone: every member missing from it got a ghost
// account and an empty My Tasks on first login.
//
// The directory below is filled from the same /api/auth/me response, in the
// Worker's order (pre-provisioned rows before auto-created ones, first wins),
// so a rendered email resolves to the same slug the Worker would give it.
// Before it arrives, and for an email no row carries, the lowercased email
// prefix is returned — the slug a brand-new member is given.
import { emailPrefix } from '../../shared/emailSlug'

let directory = new Map<string, string>()

export function setEmailDirectory(rows: ReadonlyArray<{ email: string; slug: string }>): void {
  const next = new Map<string, string>()
  for (const { email, slug } of rows) {
    const key = email?.trim().toLowerCase()
    if (key && slug && !next.has(key)) next.set(key, slug)
  }
  directory = next
}

/** Display-only: the team slug for an email someone stored on a row. Never
 *  use it to decide who the current user is — read `useAuth().user.slug`. */
export function slugForEmail(email: string | undefined | null): string {
  if (!email) return ''
  return directory.get(email.trim().toLowerCase()) ?? emailPrefix(email)
}
