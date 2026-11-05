/**
 * roster -- the ONE definition of "people" on the public site (Nick 2026-10-12:
 * home and /team said 19, the team header said 25).
 *
 * The 25 added `mentees` on top of the roster, but every mentee already has a
 * card in `researchTeam` (the same six people), so it counted them twice. A
 * person is one row of directors, seniorMentors, facultyCollaborators or
 * researchTeam, counted once by slug. Home, /team and the page meta all read
 * `rosterCount`.
 *
 * Each person stands in one group, by role. Emma Bromley is a research coordinator
 * and also has a mentee record (data/mentees.ts), which feeds Nick's trainee count;
 * she showed in both groups from 2026-10-12 until Nick's ruling of 2026-11-04
 * placed her under Research staff only.
 */
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'
import type { TeamMember } from '../data/types'

export type RosterGroupId = 'directors' | 'mentors' | 'faculty' | 'trainees' | 'staff'

export interface RosterGroup {
  id: RosterGroupId
  label: string
  members: TeamMember[]
}

/** Fellows and students train here; everyone else on researchTeam is staff. */
export function isTraineeRole(role: string): boolean {
  return /fellow|student|resident/i.test(role)
}

const LABELS: Record<RosterGroupId, string> = {
  directors: 'Co-directors',
  mentors: 'Senior mentors',
  faculty: 'Faculty collaborators',
  trainees: 'Fellows and students',
  staff: 'Research staff',
}

export interface RosterSource {
  directors: TeamMember[]
  seniorMentors: TeamMember[]
  facultyCollaborators: TeamMember[]
  researchTeam: TeamMember[]
}

export function buildRoster(
  src: RosterSource = { directors, seniorMentors, facultyCollaborators, researchTeam },
): RosterGroup[] {
  const seen = new Set<string>()
  const once = (list: TeamMember[]) =>
    list.filter((m) => {
      const key = m.slug ?? m.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  const dirs = once(src.directors)
  const mentors = once(src.seniorMentors)
  const faculty = once(src.facultyCollaborators)
  const rest = once(src.researchTeam)
  const groups: RosterGroup[] = [
    { id: 'directors', label: LABELS.directors, members: dirs },
    { id: 'mentors', label: LABELS.mentors, members: mentors },
    { id: 'faculty', label: LABELS.faculty, members: faculty },
    { id: 'trainees', label: LABELS.trainees, members: rest.filter((m) => isTraineeRole(m.role)) },
    { id: 'staff', label: LABELS.staff, members: rest.filter((m) => !isTraineeRole(m.role)) },
  ]
  return groups.filter((g) => g.members.length > 0)
}

export const ROSTER: RosterGroup[] = buildRoster()
/** Every person once. */
export const rosterPeople: TeamMember[] = [...new Map(ROSTER.flatMap((g) => g.members).map((m) => [m.slug ?? m.name, m])).values()]
export const rosterCount: number = rosterPeople.length
