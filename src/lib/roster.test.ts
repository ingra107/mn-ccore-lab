import { describe, it, expect } from 'vitest'
import type { TeamMember } from '../data/types'
import { buildRoster, isTraineeRole, rosterCount, rosterPeople, ROSTER } from './roster'
import { mentees } from '../data/mentees'

const m = (slug: string, role = 'Faculty'): TeamMember => ({ name: slug, initials: 'XX', role, slug })

describe('roster: one definition of people', () => {
  it('counts a person once even when two lists carry them', () => {
    const groups = buildRoster({
      directors: [m('a', 'Co-Director')],
      seniorMentors: [m('b')],
      facultyCollaborators: [m('c')],
      researchTeam: [m('d', 'Critical Care Fellow'), m('a', 'Co-Director'), m('e', 'Data Analyst')],
    })
    expect(groups.flatMap((g) => g.members).map((x) => x.slug)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('splits fellows and students from staff, and drops an empty group', () => {
    expect(isTraineeRole('Critical Care Fellow')).toBe(true)
    expect(isTraineeRole('Medical Student Researcher')).toBe(true)
    expect(isTraineeRole('Research Coordinator')).toBe(false)
    const groups = buildRoster({ directors: [m('a')], seniorMentors: [], facultyCollaborators: [], researchTeam: [m('b', 'Data Analyst')] })
    expect(groups.map((g) => g.id)).toEqual(['directors', 'staff'])
  })

  it('every mentee is already on the roster, so adding mentees would double-count (the 25 vs 19 bug)', () => {
    const slugs = new Set(rosterPeople.map((p) => p.slug))
    for (const mentee of mentees) expect(slugs.has(mentee.slug)).toBe(true)
    expect(rosterCount).toBe(new Set(rosterPeople.map((p) => p.slug)).size)
    expect(rosterCount).toBe(ROSTER.reduce((n, g) => n + g.members.length, 0))
  })

  it('Casey Eddington and Steven Arriaza are staff, never mentees (Nick, standing rule)', () => {
    const staff = ROSTER.find((g) => g.id === 'staff')?.members.map((x) => x.slug) ?? []
    const trainees = ROSTER.find((g) => g.id === 'trainees')?.members.map((x) => x.slug) ?? []
    for (const slug of ['casey-eddington', 'steven-arriaza']) {
      expect(staff).toContain(slug)
      expect(trainees).not.toContain(slug)
      expect(mentees.map((x) => x.slug)).not.toContain(slug)
    }
  })
})
