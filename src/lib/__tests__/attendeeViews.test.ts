// A meeting's `attendees` column holds slugs, team emails, outside emails,
// display names and bare UMN internet ids. The Meetings page shows each as a
// badge + first name and never prints an internet id as the label.

import { describe, it, expect } from 'vitest'
import { resolveAttendeeViews } from '../attendeeViews'
import type { TeamMember } from '../../data/types'

const team: TeamMember[] = [
  { name: 'Nick Ingraham', initials: 'NI', role: 'pi', slug: 'nick-ingraham', email: 'ingra107@umn.edu' },
  { name: 'Casey Eddington', initials: 'CE', role: 'analyst', slug: 'casey-eddington', email: 'eddin022@umn.edu' },
  { name: 'Dana Reyes', initials: 'DR', role: 'fellow', slug: 'dana-reyes', email: 'reyes001@umn.edu' },
  { name: 'kaur0147', initials: 'K', role: '', slug: 'kaur0147', email: 'kaur0147@umn.edu', autoCreated: true },
]

describe('resolveAttendeeViews', () => {
  it('names a team slug by its first name', () => {
    const [a] = resolveAttendeeViews(['dana-reyes'], team)
    expect(a.first).toBe('Dana')
    expect(a.initials).toBe('DR')
    expect(a.listed).toBe(true)
    expect(a.onTeam).toBe(true)
  })

  it('resolves a bare internet id through the member whose address is <id>@umn.edu', () => {
    const [a] = resolveAttendeeViews(['reyes001'], team)
    expect(a.first).toBe('Dana')
  })

  it('resolves a team email to the member', () => {
    const [a] = resolveAttendeeViews(['Reyes001@umn.edu'], team)
    expect(a.first).toBe('Dana')
  })

  it('shows an auto-created member whose only name is its id as the raw id, flagged unlisted (rendered muted with a ? badge)', () => {
    const [a] = resolveAttendeeViews(['kaur0147'], team)
    expect(a.first).toBe('kaur0147')
    expect(a.name).toBe('kaur0147')
    expect(a.initials).toBe('?')
    expect(a.listed).toBe(false)
    expect(a.raw).toBe('kaur0147')
  })

  it('shows an unresolved @umn.edu address as its id, keeping the full address in raw', () => {
    const [a] = resolveAttendeeViews(['zzzz9999@umn.edu'], team)
    expect(a.first).toBe('zzzz9999')
    expect(a.name).toBe('zzzz9999')
    expect(a.raw).toBe('zzzz9999@umn.edu')
    expect(a.listed).toBe(false)
  })

  it('shows an id nobody has as the raw id', () => {
    const [a] = resolveAttendeeViews(['zzzz9999'], team)
    expect(a.first).toBe('zzzz9999')
    expect(a.listed).toBe(false)
  })

  it('reads an outside email as a name and keeps a typed display name', () => {
    const [a, b] = resolveAttendeeViews(['jane.doe@stanford.edu', 'Lianne Siegel'], team)
    expect(a.name).toBe('Jane Doe')
    expect(a.first).toBe('Jane')
    expect(b.first).toBe('Lianne')
    expect(b.initials).toBe('LS')
    expect(a.onTeam).toBe(false)
    expect(b.onTeam).toBe(false)
    expect(a.listed && b.listed).toBe(true)
  })

  it('does not match an outside address by its local part', () => {
    const [a] = resolveAttendeeViews(['reyes001@stanford.edu'], team)
    expect(a.listed).toBe(false)
    expect(a.first).toBe('reyes001@stanford.edu')
  })

  it('drops blanks and repeats', () => {
    const views = resolveAttendeeViews(['dana-reyes', 'reyes001@umn.edu', '', null], team)
    expect(views).toHaveLength(1)
  })
})
