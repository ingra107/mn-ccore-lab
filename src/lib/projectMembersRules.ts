// projectMembersRules.ts -- who may do what on a project's member list, and how
// a member is labelled (#145). The server decides (api/routes/project-members.ts);
// these only choose which controls to draw, so a button never promises what the
// API will refuse.
import { displayName } from './nameUtils'
import type { ProjectMember, ProjectMembersResult } from './projectMembersApi'

/** DELETE is allowed for the member themself or a PI. */
export function canRemoveMember(viewer: { slug: string; isPi: boolean }, memberSlug: string): boolean {
  if (!viewer.slug && !viewer.isPi) return false
  return viewer.isPi || viewer.slug === memberSlug
}

/** True when the caller removed THEMSELF and can no longer read the project
 *  (the API answers data: []). An empty list after removing someone else is
 *  not this: Nick with the all-projects switch on removes a project's last
 *  member and stays on the page. */
export function removedSelfOutOfProject(res: ProjectMembersResult, removedSlug: string, userSlug: string): boolean {
  return res.removed === true && res.data.length === 0 && removedSlug === userSlug && userSlug !== ''
}

/** Name shown for a member: the shared display helper first, the API's own
 *  name when the static directory does not know the slug. */
export function memberLabel(m: Pick<ProjectMember, 'slug' | 'name' | 'preferred_name'>): string {
  const shown = displayName(m.slug)
  if (shown && shown !== 'Unknown' && !shown.includes('@') && shown !== m.slug) return shown
  return (m.preferred_name || m.name || m.slug).trim()
}

export function memberInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Team members not yet on the project, as picker options. */
export function addableMembers<T extends { slug?: string }>(team: readonly T[], members: readonly { slug: string }[]): T[] {
  const on = new Set(members.map((m) => m.slug))
  return team.filter((t) => t.slug && !on.has(t.slug))
}
