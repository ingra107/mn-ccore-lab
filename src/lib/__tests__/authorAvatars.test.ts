import { describe, it, expect } from 'vitest'
import { resolveBylineAuthors } from '../authorAvatars'
import type { TeamMember } from '../../data/types'

const dudley: TeamMember = { name: 'Adams Dudley', initials: 'AD', role: 'Senior Mentor', slug: 'adams-dudley', authorName: 'Dudley RA', photoUrl: 'https://example.com/dudley.png' }
const chipman: TeamMember = { name: 'Jeff Chipman', initials: 'JC', role: 'Senior Mentor', slug: 'jeff-chipman', authorName: 'Chipman JG' }
// A team member with NO authorName on file. Exactly one roster entry is in
// this shape today; the byline is the only key, so such a member reads as an
// ordinary outside author.
const noAuthorName: TeamMember = { name: 'Nick Ingraham', initials: 'NI', role: 'Co-Director', slug: 'nick-ingraham' }

const members: TeamMember[] = [dudley, chipman, noAuthorName]

describe('resolveBylineAuthors', () => {
  it('returns every byline author in order, tagging the lab members', () => {
    const result = resolveBylineAuthors({ authors: 'Smith J, Dudley RA, Jones K' }, members)
    expect(result.map((a) => a.name)).toEqual(['Smith J', 'Dudley RA', 'Jones K'])
    expect(result.map((a) => a.member?.slug)).toEqual([undefined, 'adams-dudley', undefined])
  })

  it('keeps an outside author rather than dropping it (the blank-face case)', () => {
    const result = resolveBylineAuthors({ authors: 'Smith J, Jones K' }, members)
    expect(result).toHaveLength(2)
    expect(result.every((a) => a.member === undefined)).toBe(true)
  })

  it('does not claim one member for two byline segments', () => {
    // Two distinct people whose segments both contain "Dudley RA" cannot
    // happen, but a repeated segment must not resolve twice.
    const result = resolveBylineAuthors({ authors: 'Dudley RA, Dudley RA' }, members)
    expect(result.map((a) => a.member?.slug)).toEqual(['adams-dudley', undefined])
  })

  it('ignores a member with no authorName on file — the byline is the only key', () => {
    const result = resolveBylineAuthors({ authors: 'Ingraham NE, Dudley RA' }, members)
    expect(result.map((a) => a.member?.slug)).toEqual([undefined, 'adams-dudley'])
  })

  it('strips one trailing period before splitting the byline', () => {
    const result = resolveBylineAuthors({ authors: 'Smith J, Dudley RA.' }, members)
    expect(result.map((a) => a.name)).toEqual(['Smith J', 'Dudley RA'])
  })

  it('returns an empty list for an empty or undefined authors string', () => {
    expect(resolveBylineAuthors({ authors: '' }, members)).toEqual([])
    expect(resolveBylineAuthors({ authors: undefined as unknown as string }, members)).toEqual([])
  })

  it('carries photoUrl through when present, undefined when absent', () => {
    const result = resolveBylineAuthors({ authors: 'Dudley RA, Chipman JG' }, members)
    expect(result[0].member?.photoUrl).toBe('https://example.com/dudley.png')
    expect(result[1].member?.photoUrl).toBeUndefined()
  })
})
