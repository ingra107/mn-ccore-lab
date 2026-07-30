import { describe, it, expect } from 'vitest'
import { resolveLabCoAuthors } from '../authorAvatars'
import type { TeamMember } from '../../data/types'

const dudley: TeamMember = { name: 'Adams Dudley', initials: 'AD', role: 'Senior Mentor', slug: 'adams-dudley', authorName: 'Dudley RA', photoUrl: 'https://example.com/dudley.png' }
const chipman: TeamMember = { name: 'Jeff Chipman', initials: 'JC', role: 'Senior Mentor', slug: 'jeff-chipman', authorName: 'Chipman JG' }
// A team member with NO authorName on file — the shape the `directors`
// entries for Nick Ingraham / Nate Mesfin actually have today.
const noAuthorName: TeamMember = { name: 'Nick Ingraham', initials: 'NI', role: 'Co-Director', slug: 'nick-ingraham' }

const members: TeamMember[] = [dudley, chipman, noAuthorName]

describe('resolveLabCoAuthors', () => {
  it('resolves lab co-authors in byline order via authorName segment match', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Smith J, Dudley RA, Chipman JG, Jones K', authorSlugs: undefined },
      members,
    )
    expect(result.map((r) => r.slug)).toEqual(['adams-dudley', 'jeff-chipman'])
  })

  it('preserves first-author-first order even when authorName order differs from array order', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Chipman JG, Smith J, Dudley RA', authorSlugs: undefined },
      members,
    )
    // Chipman is first in the byline -> first in the resolved list, even
    // though `dudley` is declared before `chipman` in the members array.
    expect(result.map((r) => r.slug)).toEqual(['jeff-chipman', 'adams-dudley'])
  })

  it('falls back to authorSlugs, appended after every name-matched author, for a member with no authorName', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Ingraham NE, Dudley RA', authorSlugs: ['nick-ingraham'] },
      members,
    )
    expect(result.map((r) => r.slug)).toEqual(['adams-dudley', 'nick-ingraham'])
  })

  it('does not duplicate a member matched by both name and authorSlugs', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Dudley RA, Chipman JG', authorSlugs: ['adams-dudley', 'jeff-chipman'] },
      members,
    )
    expect(result.map((r) => r.slug)).toEqual(['adams-dudley', 'jeff-chipman'])
  })

  it('strips one trailing period before splitting the byline', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Smith J, Dudley RA.', authorSlugs: undefined },
      members,
    )
    expect(result.map((r) => r.slug)).toEqual(['adams-dudley'])
  })

  it('returns an empty list when no lab member matches', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Smith J, Jones K', authorSlugs: undefined },
      members,
    )
    expect(result).toEqual([])
  })

  it('returns an empty list for an empty/undefined authors string with no authorSlugs', () => {
    expect(resolveLabCoAuthors({ authors: '', authorSlugs: undefined }, members)).toEqual([])
    expect(resolveLabCoAuthors({ authors: undefined as unknown as string, authorSlugs: undefined }, members)).toEqual([])
  })

  it('carries photoUrl through when present, undefined when absent', () => {
    const result = resolveLabCoAuthors(
      { authors: 'Dudley RA, Chipman JG', authorSlugs: undefined },
      members,
    )
    expect(result[0].photoUrl).toBe('https://example.com/dudley.png')
    expect(result[1].photoUrl).toBeUndefined()
  })
})
