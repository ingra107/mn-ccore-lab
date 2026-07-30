/**
 * authorAvatars — resolve the ordered list of lab-member co-authors on a
 * publication, for the author-avatar-stack (#906, Nick 2026-07-23: "each
 * paper shows mini avatar photos of the lab-member co-authors in author
 * order, first author overlapped on top").
 *
 * WHY name-matching is the PRIMARY path, not `authorSlugs`: `authorSlugs` on
 * a shared multi-lab-author paper records only ONE slug in practice.
 * `fetch-publications.ts` sets `authorSlugs: [member.slug]` per per-member
 * fetch run, and neither `mergePublications` nor `insert-generated-pubs.ts`
 * ever UNIONS `authorSlugs` across a duplicate DOI — a paper already present
 * under one co-author's slug is skipped outright when a second co-author's
 * run encounters the same DOI (dedup-by-key `continue`, no merge). So a
 * paper co-authored by two lab members frequently carries only the slug of
 * whichever member's fetch happened to insert it first. Parsing the
 * `authors` byline and matching each segment against every team member's
 * `authorName` (the same substring test `PublicationCard`'s `formatAuthors`
 * and `MemberPage`'s `memberPubs` filter already use) recovers every lab
 * co-author actually present, in their real byline order.
 *
 * `authorSlugs` is still consulted as a FALLBACK, for the (currently exactly
 * two) team members who have no `authorName` on file — the `directors`
 * entries for Nick Ingraham and Nate Mesfin, whose `Director` type predates
 * the PubMed-name field `TeamMember` carries. A slug-only match has no known
 * byline position, so it is appended after every name-matched author.
 */

import type { Publication, TeamMember } from '../data/types'

export interface ResolvedAuthorAvatar {
  slug: string
  name: string
  initials: string
  photoUrl?: string
}

function toAvatar(m: TeamMember): ResolvedAuthorAvatar {
  return { slug: m.slug as string, name: m.name, initials: m.initials, photoUrl: m.photoUrl }
}

/** Same byline split `PublicationCard.formatAuthors` uses: strip one
 *  trailing period, split on commas, trim, drop empties. */
function splitAuthorSegments(authors: string | undefined): string[] {
  if (!authors) return []
  return authors
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Ordered, deduplicated lab-member co-authors for one publication.
 * `members` is caller-supplied (pass `getAllMembers()`) so this stays a pure
 * function — no import-time dependency on team.ts data.
 */
export function resolveLabCoAuthors(
  pub: Pick<Publication, 'authors' | 'authorSlugs'>,
  members: TeamMember[],
): ResolvedAuthorAvatar[] {
  const bySlug = new Map<string, TeamMember>()
  for (const m of members) {
    if (m.slug) bySlug.set(m.slug, m)
  }
  const withAuthorName = members.filter((m) => m.slug && m.authorName)

  const resolved: ResolvedAuthorAvatar[] = []
  const seen = new Set<string>()

  // Primary: byline order via name-segment matching.
  for (const seg of splitAuthorSegments(pub.authors)) {
    const match = withAuthorName.find((m) => seg.includes(m.authorName as string))
    if (match && match.slug && !seen.has(match.slug)) {
      seen.add(match.slug)
      resolved.push(toAvatar(match))
    }
  }

  // Fallback: authorSlugs entries not already resolved by name (covers
  // members with no `authorName` on file). Position unknown -> appended.
  const slugs = Array.isArray(pub.authorSlugs) ? pub.authorSlugs : []
  for (const slug of slugs) {
    if (seen.has(slug)) continue
    const m = bySlug.get(slug)
    if (!m) continue
    seen.add(slug)
    resolved.push(toAvatar(m))
  }

  return resolved
}
