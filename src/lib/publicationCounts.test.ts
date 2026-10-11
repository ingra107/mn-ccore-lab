import { describe, it, expect } from 'vitest'
import type { Publication } from '../data/types'
import { countPublications, memberPublications, isMemberPublication } from './publicationCounts'

function pub(over: Partial<Publication>): Publication {
  return {
    id: over.id ?? 'p',
    title: 't',
    authors: over.authors ?? 'Doe J',
    journal: 'j',
    year: 2024,
    status: over.status ?? 'Published',
    topics: [],
    ...over,
  } as Publication
}

describe('countPublications', () => {
  it('splits by status; the lab count is published only', () => {
    const c = countPublications([
      pub({ status: 'Published' }),
      pub({ status: 'Published' }),
      pub({ status: 'In Review' }),
      pub({ status: 'In Preparation' }),
    ])
    expect(c).toEqual({ published: 2, inReview: 1, inPreparation: 1, all: 4 })
  })
})

describe('memberPublications', () => {
  const nick = { slug: 'nick-ingraham', authorName: 'Ingraham NE' }

  it('matches by slug', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham'], authors: 'X Y' }), nick)).toBe(true)
  })

  it('matches a co-authored row that carries only the other author slug, by byline name', () => {
    // The Team card used to count slug-only and missed this row; the member
    // page counted it. One rule now.
    expect(isMemberPublication(pub({ authorSlugs: ['nate-mesfin'], authors: 'Mesfin N, Ingraham NE' }), nick)).toBe(true)
  })

  it('accepts a legacy comma-string authorSlugs', () => {
    const legacy = { ...pub({ authors: 'X Y' }), authorSlugs: 'nate-mesfin, nick-ingraham' } as unknown as Publication
    expect(isMemberPublication(legacy, nick)).toBe(true)
  })

  it('does not match a slug that merely contains the member slug', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham-2'], authors: 'X Y' }), nick)).toBe(false)
  })

  it('returns [] for an unknown member', () => {
    expect(memberPublications([pub({})], undefined)).toEqual([])
  })
})
