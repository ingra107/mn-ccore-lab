/**
 * authorAvatars — resolve a publication's byline against the lab roster, so a
 * surface can show WHO wrote a paper rather than a run of text (#133; the
 * #906 avatar stack this grew out of is gone).
 *
 * WHY the byline is matched by NAME and `authorSlugs` is not consulted: on a
 * shared multi-lab-author paper, `authorSlugs` records only ONE slug for most
 * of prod's EXISTING rows. `fetch-publications.ts` sets
 * `authorSlugs: [member.slug]` per per-member fetch run; `mergePublications`
 * and that script's intra-run dedup used to drop a duplicate-DOI copy outright
 * instead of unioning its `authorSlugs` in — fixed 2026-08-01 (#1126,
 * `unionAuthorSlugs` in mergePublications.ts) — but that fix only changes what
 * NEW rows carry. Every row already in prod keeps its pre-fix collapsed value
 * until a backfill runs (scripts/backfill-author-slugs-report.ts, read-only
 * report; #1126). Even post-backfill the union is only as complete as the set
 * of co-authors whose OWN fetch independently resolved that run — a co-author
 * in the byline who was never fetched (no orcid/openalex id, or a failed run)
 * is invisible to `authorSlugs` by construction.
 *
 * Matching each byline segment against every member's `authorName` (the same
 * substring test `PublicationCard.formatAuthors` and `MemberPage`'s
 * `memberPubs` filter use) recovers every lab co-author actually present, in
 * their real byline order, independent of all of the above. It costs nothing
 * in coverage: exactly one roster entry lacks an `authorName` today.
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

export interface BylineAuthor {
  /** The byline segment exactly as the citation prints it, e.g. "Ingraham NE". */
  name: string
  /** Set when this segment resolves to a lab member; undefined otherwise. */
  member?: ResolvedAuthorAvatar
}

/**
 * Every author on the byline, in byline order, each tagged with the lab member
 * it resolves to (or nothing). This is what the author COLUMN renders (#133,
 * Nick 2026-09-16: "authors with face picture and name in a column on the
 * right ... if its NOT someone in our MNCCORE group you can just have a blank
 * photo so its clear that people in our Lab are the ones with their photo").
 *
 * `resolveLabCoAuthors` above answers a different question -- which lab
 * members are on this paper -- and drops everyone else, so the avatar stack
 * built on it cannot show the contrast Nick is asking for. Both read the same
 * byline through `splitAuthorSegments` and match on the same `authorName`
 * substring test, so a member who appears in one appears in the other.
 *
 * The `authorSlugs` fallback does NOT apply here: a slug-only match has no
 * byline position, and this list IS the byline. A member reachable only
 * through `authorSlugs` renders as an ordinary unmatched author rather than
 * being appended out of order.
 */
export function resolveBylineAuthors(
  pub: Pick<Publication, 'authors'>,
  members: TeamMember[],
): BylineAuthor[] {
  const withAuthorName = members.filter((m) => m.slug && m.authorName)
  const claimed = new Set<string>()

  return splitAuthorSegments(pub.authors).map((seg) => {
    const match = withAuthorName.find(
      (m) => seg.includes(m.authorName as string) && !claimed.has(m.slug as string),
    )
    if (!match) return { name: seg }
    claimed.add(match.slug as string)
    return { name: seg, member: toAvatar(match) }
  })
}
