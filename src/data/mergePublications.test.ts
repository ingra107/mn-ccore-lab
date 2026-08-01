import { describe, it, expect } from 'vitest'
import type { Publication } from './types'
import { mergePublications, unionAuthorSlugs } from './mergePublications'

function pub(over: Partial<Publication>): Publication {
  return {
    id: over.id ?? 'id',
    authors: over.authors ?? 'Doe J',
    title: over.title ?? 'A Title',
    journal: over.journal ?? 'Journal',
    year: over.year ?? 2024,
    status: over.status ?? 'Published',
    topics: over.topics ?? [],
    authorSlugs: over.authorSlugs ?? ['jane-doe'],
    ...over,
  }
}

describe('mergePublications', () => {
  it('is a no-op when generated is empty (identity + order preserved)', () => {
    const curated = [pub({ id: 'a' }), pub({ id: 'b', title: 'Second' })]
    const merged = mergePublications(curated, [])
    expect(merged).toEqual(curated)
    expect(merged.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('drops a generated pub that duplicates a curated one by DOI', () => {
    const curated = [pub({ id: 'curated', doi: 'https://doi.org/10.1/ABC' })]
    const generated = [pub({ id: 'gen', doi: 'https://dx.doi.org/10.1/abc' })] // case + dx-prefix differ
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated'])
  })

  it('drops a generated pub that duplicates by PubMed id (URL vs bare)', () => {
    const curated = [pub({ id: 'curated', pubmed: 'https://pubmed.ncbi.nlm.nih.gov/41616031/' })]
    const generated = [pub({ id: 'gen', pubmed: '41616031' })]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated'])
  })

  it('drops a generated pub that duplicates by normalized title+year', () => {
    const curated = [pub({ id: 'curated', title: 'Lung-Protective  Ventilation!', year: 2023 })]
    const generated = [pub({ id: 'gen', title: 'lung protective ventilation', year: 2023 })]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated'])
  })

  it('keeps a generated pub that is genuinely new (fills the gap)', () => {
    const curated = [pub({ id: 'curated', doi: 'https://doi.org/10.1/ONE' })]
    const generated = [pub({ id: 'gen', doi: 'https://doi.org/10.2/TWO', title: 'Distinct' })]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated', 'gen'])
  })

  it('same title+year but a different year is NOT a duplicate', () => {
    const curated = [pub({ id: 'curated', title: 'Recurring Review', year: 2022 })]
    const generated = [pub({ id: 'gen', title: 'Recurring Review', year: 2024 })]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated', 'gen'])
  })

  it('never drops a curated entry even if two curated pubs share a title+year', () => {
    const curated = [
      pub({ id: 'orig', title: 'Same', year: 2021 }),
      pub({ id: 'erratum', title: 'Same', year: 2021 }),
    ]
    const merged = mergePublications(curated, [])
    expect(merged.map((p) => p.id)).toEqual(['orig', 'erratum'])
  })

  it('dedups generated against earlier-kept generated entries too', () => {
    const generated = [
      pub({ id: 'g1', doi: 'https://doi.org/10.9/X' }),
      pub({ id: 'g2', doi: 'https://doi.org/10.9/x' }), // same DOI as g1
    ]
    const merged = mergePublications([], generated)
    expect(merged.map((p) => p.id)).toEqual(['g1'])
  })

  it('drops a generated short-title dup of a curated entry that carries a subtitle', () => {
    // ORCID often lists the base title only ("Federation, not centralization")
    // while the curated entry has the full "Base: Subtitle" form.
    const curated = [pub({ id: 'curated', title: 'Federation, Not Centralization: A New Paradigm', year: 2026 })]
    const generated = [pub({ id: 'gen', title: 'Federation, not centralization', year: 2026 })]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated'])
  })

  // #1126 — a duplicate generated pub UNIONS its authorSlugs into the kept
  // entry instead of losing them when the duplicate is dropped.
  it('unions a generated dup authorSlug into the kept curated entry', () => {
    const curated = [
      pub({ id: 'curated', doi: 'https://doi.org/10.1/ABC', authorSlugs: ['adams-dudley'] }),
    ]
    const generated = [
      pub({ id: 'gen', doi: 'https://doi.org/10.1/abc', authorSlugs: ['jeff-chipman'] }),
    ]
    const merged = mergePublications(curated, generated)
    expect(merged.map((p) => p.id)).toEqual(['curated'])
    expect(merged[0].authorSlugs).toEqual(['adams-dudley', 'jeff-chipman'])
  })

  it('unions authorSlugs across two generated dups of each other, keeping the first id', () => {
    const generated = [
      pub({ id: 'g1', doi: 'https://doi.org/10.9/X', authorSlugs: ['adams-dudley'] }),
      pub({ id: 'g2', doi: 'https://doi.org/10.9/x', authorSlugs: ['jeff-chipman'] }),
    ]
    const merged = mergePublications([], generated)
    expect(merged.map((p) => p.id)).toEqual(['g1'])
    expect(merged[0].authorSlugs).toEqual(['adams-dudley', 'jeff-chipman'])
  })

  it('does not add a duplicate slug already present on the kept entry', () => {
    const curated = [
      pub({ id: 'curated', doi: 'https://doi.org/10.3/Z', authorSlugs: ['adams-dudley'] }),
    ]
    const generated = [
      pub({ id: 'gen', doi: 'https://doi.org/10.3/z', authorSlugs: ['adams-dudley'] }),
    ]
    const merged = mergePublications(curated, generated)
    expect(merged[0].authorSlugs).toEqual(['adams-dudley'])
  })
})

describe('unionAuthorSlugs', () => {
  it("appends new slugs from b in order, after a's existing slugs", () => {
    const a = pub({ authorSlugs: ['a1', 'a2'] })
    const b = pub({ authorSlugs: ['a2', 'a3'] })
    expect(unionAuthorSlugs(a, b).authorSlugs).toEqual(['a1', 'a2', 'a3'])
  })

  it('returns a BY REFERENCE when b adds nothing new', () => {
    const a = pub({ authorSlugs: ['a1'] })
    const b = pub({ authorSlugs: ['a1'] })
    expect(unionAuthorSlugs(a, b)).toBe(a)
  })

  it('returns a BY REFERENCE when b has no authorSlugs', () => {
    const a = pub({ authorSlugs: ['a1'] })
    const b = pub({ authorSlugs: undefined })
    expect(unionAuthorSlugs(a, b)).toBe(a)
  })

  it("treats a missing authorSlugs on a as empty, adopting all of b's", () => {
    const a = pub({ authorSlugs: undefined })
    const b = pub({ authorSlugs: ['b1', 'b2'] })
    expect(unionAuthorSlugs(a, b).authorSlugs).toEqual(['b1', 'b2'])
  })
})
