/**
 * publicationCounts — the ONE place a publication count is derived (#51 of the
 * 2026-10-10 page evaluation).
 *
 * The public site showed three lab totals at once (703+, 704 and 697): the home
 * hero counted every row, the "View all" link counted every row, Research Output
 * counted published rows, and Pulse asked /api/stats for COUNT(*). Per member,
 * the Team card matched by `authorSlugs` only while the member page also matched
 * the byline by `authorName`, so the two disagreed for anyone on a shared paper.
 *
 * The rules, so every surface reads the same number:
 *   - A lab "publication" is a row with status 'Published'. Papers in review or
 *     in preparation are named as such, never folded into the headline.
 *   - A member's papers are the rows whose `authorSlugs` carry the member's slug
 *     OR whose byline lists the member's `authorName` as a whole name (the
 *     MemberPage rule; `authorSlugs` alone misses co-authored rows, see
 *     lib/authorAvatars.ts).
 *   - The status literals live here only. Components call isPublished /
 *     isInReview / countPublications; publicationCounts.test.ts fails on a raw
 *     `status === '...'` comparison anywhere else under src/.
 */
import type { Publication, TeamMember } from '../data/types'

export interface PublicationCounts {
  /** Status 'Published': the lab's publication count everywhere. */
  published: number
  inReview: number
  inPreparation: number
  /** Every row, any status. */
  all: number
}

export function countPublications(
  pubs: ReadonlyArray<Pick<Publication, 'status'>>,
): PublicationCounts {
  let published = 0
  let inReview = 0
  let inPreparation = 0
  for (const p of pubs) {
    if (p.status === 'Published') published++
    else if (p.status === 'In Review') inReview++
    else if (p.status === 'In Preparation') inPreparation++
  }
  return { published, inReview, inPreparation, all: pubs.length }
}

export function isPublished(p: Pick<Publication, 'status'>): boolean {
  return p.status === 'Published'
}

export function isInReview(p: Pick<Publication, 'status'>): boolean {
  return p.status === 'In Review'
}

/** One byline name, normalised: no leading "and", no punctuation or markers
 *  ("Ingraham NE*" -> "Ingraham NE"), single spaces. */
function normaliseAuthor(s: string): string {
  return s
    .trim()
    .replace(/^and\s+/i, '')
    .replace(/[^\p{L}\s'-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the byline lists `authorName` as a whole name. A substring test
 *  lets "Collins C" match "Collins CA", a different author. */
export function bylineHasAuthor(authors: string | undefined, authorName: string): boolean {
  if (!authors) return false
  const want = normaliseAuthor(authorName)
  return authors.split(/[,;]/).some((a) => normaliseAuthor(a) === want)
}

export function isMemberPublication(
  pub: Pick<Publication, 'authors' | 'authorSlugs'>,
  member: Pick<TeamMember, 'slug' | 'authorName'>,
): boolean {
  const slug = member.slug?.toLowerCase()
  // A legacy row can carry author_slugs as a comma string rather than an array.
  const raw: unknown = pub.authorSlugs
  const slugs = Array.isArray(raw)
    ? raw.map((s) => String(s).trim().toLowerCase())
    : typeof raw === 'string' ? raw.split(',').map((s) => s.trim().toLowerCase()) : []
  if (slug && slugs.includes(slug)) return true
  if (member.authorName && bylineHasAuthor(pub.authors, member.authorName)) return true
  return false
}

export function memberPublications<T extends Pick<Publication, 'authors' | 'authorSlugs'>>(
  pubs: ReadonlyArray<T>,
  member: Pick<TeamMember, 'slug' | 'authorName'> | undefined,
): T[] {
  if (!member) return []
  return pubs.filter((p) => isMemberPublication(p, member))
}
