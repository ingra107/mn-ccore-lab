// member-publications.ts -- the one SQL rule for "this member's papers".
//
// publications.authors holds names ("Ingraham NE"), never slugs; the member's
// slug lives in publications.author_slugs (a JSON array, or a comma string on
// a few legacy rows). The trajectory route matched the slug against `authors`
// and returned no paper for anyone (overnight audit 2026-10-14, G9-1), while
// the contributions route already used author_slugs. Both read through here
// now, so the two cannot drift again. The client's rule
// (src/lib/publicationCounts.ts::isMemberPublication) checks author_slugs first.

/** WHERE fragment; bind memberSlugParam(slug) to its one `?`. */
export const MEMBER_PUBLICATIONS_WHERE = 'author_slugs LIKE ?'

export function memberSlugParam(slug: string): string {
  return `%${slug}%`
}
