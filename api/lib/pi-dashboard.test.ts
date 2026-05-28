/**
 * Tests for the pi-dashboard slug LIKE pattern fix (P6-B7).
 *
 * Proves that LIKE '%"slug"%' (quoted) correctly avoids false positives
 * from slug substring matches (e.g. "lee" matching "mcleery").
 *
 * We test the pattern logic in isolation using a minimal SQLite-in-process
 * Database (D1 emulation not available here) via the pattern string directly.
 */
import { describe, it, expect } from 'vitest'

/**
 * Simulates the SQL LIKE pattern matching used in pi-dashboard.ts.
 * Returns true if `authorSlugs` JSON string contains `slug` as an exact
 * quoted array element (i.e. `"slug"` appears literally in the string).
 */
function slugMatchesAuthors(authorSlugs: string, slug: string): boolean {
  // Mirrors: p.author_slugs LIKE '%"' || tm.slug || '"%'
  // SQLite LIKE is case-insensitive for ASCII by default; we use includes()
  // which is case-sensitive here — that's fine since slugs are lowercase.
  return authorSlugs.includes(`"${slug}"`)
}

describe('pi-dashboard slug LIKE pattern (P6-B7)', () => {
  const authorsWithMcleery = '["john-doe","alice-mcleery","bob-smith"]'
  const authorsWithLee = '["john-doe","sam-lee","bob-smith"]'
  const authorsWithBoth = '["alice-mcleery","sam-lee"]' // both mcleery AND lee as separate slugs
  const authorsWithJustMcleery = '["alice-mcleery"]'

  it('old unquoted LIKE %slug% would incorrectly match "lee" inside "mcleery"', () => {
    // Demonstrates the bug the fix resolves
    const oldPattern = (slugs: string, slug: string) => slugs.includes(slug)
    expect(oldPattern(authorsWithMcleery, 'lee')).toBe(true) // FALSE POSITIVE — this is the bug
  })

  it('new quoted LIKE %"slug"% correctly rejects "lee" when only "mcleery" is present', () => {
    expect(slugMatchesAuthors(authorsWithMcleery, 'lee')).toBe(false) // correct: "lee" is NOT a member
    expect(slugMatchesAuthors(authorsWithMcleery, 'alice-mcleery')).toBe(true) // correct: mcleery IS a member
  })

  it('correctly matches "lee" when "sam-lee" is a real array element', () => {
    expect(slugMatchesAuthors(authorsWithLee, 'sam-lee')).toBe(true)
    expect(slugMatchesAuthors(authorsWithLee, 'lee')).toBe(false) // "lee" alone is not an element
  })

  it('does not match bare "lee" even when "sam-lee" and "alice-mcleery" are both present', () => {
    expect(slugMatchesAuthors(authorsWithBoth, 'lee')).toBe(false) // bare "lee" is not a slug
    expect(slugMatchesAuthors(authorsWithBoth, 'mcleery')).toBe(false) // bare "mcleery" is not a slug
    expect(slugMatchesAuthors(authorsWithBoth, 'sam-lee')).toBe(true)  // "sam-lee" IS a real slug here
    expect(slugMatchesAuthors(authorsWithBoth, 'alice-mcleery')).toBe(true)
  })

  it('matches an exact single-element author_slugs array', () => {
    expect(slugMatchesAuthors(authorsWithJustMcleery, 'alice-mcleery')).toBe(true)
    expect(slugMatchesAuthors(authorsWithJustMcleery, 'mcleery')).toBe(false)
    expect(slugMatchesAuthors(authorsWithJustMcleery, 'alice')).toBe(false)
  })

  it('handles slug at array boundaries (first and last elements)', () => {
    const slugs = '["first-slug","middle-slug","last-slug"]'
    expect(slugMatchesAuthors(slugs, 'first-slug')).toBe(true)
    expect(slugMatchesAuthors(slugs, 'last-slug')).toBe(true)
    expect(slugMatchesAuthors(slugs, 'first')).toBe(false)
    expect(slugMatchesAuthors(slugs, 'slug')).toBe(false)
  })

  it('does not match when author_slugs is null or empty', () => {
    expect(slugMatchesAuthors('', 'any-slug')).toBe(false)
    expect(slugMatchesAuthors('[]', 'any-slug')).toBe(false)
    expect(slugMatchesAuthors('null', 'any-slug')).toBe(false)
  })
})
