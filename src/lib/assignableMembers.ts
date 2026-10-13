import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'

// Build member list from team data
export function getAssignableMembers() {
  const all = [
    ...directors.map((d) => ({ slug: d.slug, name: d.name, initials: d.initials, photoUrl: d.photoUrl })),
    ...seniorMentors.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
    ...facultyCollaborators.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
    ...researchTeam.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
  ]
  // Deduplicate by slug
  const seen = new Set<string>()
  return all.filter((m) => {
    if (seen.has(m.slug)) return false
    seen.add(m.slug)
    return true
  })
}
