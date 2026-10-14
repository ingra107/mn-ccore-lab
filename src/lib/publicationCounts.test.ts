import { describe, it, expect } from 'vitest'
import type { Publication } from '../data/types'
import { countPublications, memberPublications, isMemberPublication, bylineHasAuthor } from './publicationCounts'

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

  it('matches by slug when the byline names the surname in a form the matcher cannot parse', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham'], authors: 'Doe J, Ingraham N' }), nick)).toBe(true)
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham'], authors: 'Doe, J., Ingraham, N.' }), nick)).toBe(true)
  })

  it('keeps a slug credit on a group-author byline', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham'], authors: 'Doe J, Roe K, COVID-OUT Study Team.' }), nick)).toBe(true)
  })

  it('drops a slug credit the byline never supports', () => {
    // D1 credited two staff with the CCI-ARDS paper; the byline has neither.
    const casey = { slug: 'casey-eddington', authorName: 'Eddington C' }
    const row = pub({ authorSlugs: ['casey-eddington'], authors: 'Michael Kalinoski, Nathan Mesfin, Nicholas E Ingraham' })
    expect(isMemberPublication(row, casey)).toBe(false)
  })

  it('keeps a slug credit when there is no byline to check', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham'], authors: '' }), nick)).toBe(true)
  })

  it('matches a co-authored row that carries only the other author slug, by byline name', () => {
    // The Team card used to count slug-only and missed this row; the member
    // page counted it. One rule now.
    expect(isMemberPublication(pub({ authorSlugs: ['nate-mesfin'], authors: 'Mesfin N, Ingraham NE' }), nick)).toBe(true)
  })

  it('accepts a legacy comma-string authorSlugs', () => {
    const legacy = { ...pub({ authors: 'Mesfin N, Ingraham N' }), authorSlugs: 'nate-mesfin, nick-ingraham' } as unknown as Publication
    expect(isMemberPublication(legacy, nick)).toBe(true)
  })

  it('does not match a slug that merely contains the member slug', () => {
    expect(isMemberPublication(pub({ authorSlugs: ['nick-ingraham-2'], authors: 'X Y' }), nick)).toBe(false)
  })

  it('returns [] for an unknown member', () => {
    expect(memberPublications([pub({})], undefined)).toEqual([])
  })
})

describe('bylineHasAuthor', () => {
  it('matches a whole name, not a longer one that starts the same way', () => {
    // "Collins C" is a different author from "Collins CA".
    expect(bylineHasAuthor('Smith J, Collins CA, Doe K', 'Collins C')).toBe(false)
    expect(bylineHasAuthor('Smith J, Collins C, Doe K', 'Collins C')).toBe(true)
  })

  it('ignores markers, a leading "and" and a trailing period', () => {
    expect(bylineHasAuthor('Smith J, Ingraham NE*', 'Ingraham NE')).toBe(true)
    expect(bylineHasAuthor('Smith J and Doe K; and Ingraham NE.', 'Ingraham NE')).toBe(true)
  })

  it('is false for an empty byline', () => {
    expect(bylineHasAuthor(undefined, 'Ingraham NE')).toBe(false)
  })
})

describe('status literals live in publicationCounts only', () => {
  // A surface that compares p.status to a publication status itself can drift
  // from the lab's one definition; it must call isPublished / isInReview /
  // countPublications instead.
  const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/lib/publicationCounts.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('scans the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })

  it('finds no raw status comparison outside the lib', () => {
    const literal = /(===|!==)\s*['"](Published|In Review|In Preparation)['"]/
    const offenders = Object.entries(sources)
      .filter(([, text]) => literal.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('renders every paper row through PubRow', () => {
    // Nick's Wave 2 pick (2026-10-13): one card for every public paper. A
    // hand-rolled `pub-row` link to a paper loses the faces and status PubRow
    // carries (Home Recent and the detail page's Related list both did).
    const handRolled = /\/publications\/\$\{[^\n]*["'`]pub-row["'` ]|["'`]pub-row["'` ][^\n]*\/publications\/\$\{/
    const offenders = Object.entries(sources)
      .filter(([path, text]) => !path.endsWith('/components/public/PubRow.tsx') && handRolled.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
