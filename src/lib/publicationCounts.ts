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

/** Rows that are not papers: test fixtures (`test_delete_ ...`), the
 *  `[Table]` / `[Figure]` pieces of a 2004 report, and the `Supplementary
 *  Materials N from ...` / `Data from ...` deposits that came in beside a paper.
 *  usePublications drops them, so no count or list sees them. */
export function isPlaceholderPublication(p: Pick<Publication, 'title'>): boolean {
  return /^\s*(test_|\[(table|figure)\b|supplementary materials?\b|data from\b)/i.test(p.title)
}

const doiKey = (doi: string | undefined) =>
  doi ? doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : ''
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

type Dedupable = Pick<Publication, 'title' | 'doi' | 'year' | 'featured'>

/** True when `b` should replace `a` as a group's survivor: a featured row wins,
 *  then the newest year. */
function replaces(a: Dedupable, b: Dedupable): boolean {
  if (!!b.featured !== !!a.featured) return !!b.featured
  return b.year > a.year
}

function collapse<T extends Dedupable>(list: T[], key: (p: T) => string): T[] {
  const slot = new Map<string, number>()
  const out: T[] = []
  for (const p of list) {
    const k = key(p)
    if (!k) { out.push(p); continue }
    const at = slot.get(k)
    if (at === undefined) { slot.set(k, out.length); out.push(p) }
    else if (replaces(out[at], p)) out[at] = p
  }
  return out
}

/** One row per paper: collapse rows that share a DOI, then rows that share a
 *  normalized title (a preprint and its published version carry different DOIs
 *  and the same title). Of a group the survivor is a featured row, else the
 *  newest year, else the first; it keeps the position of the group's first row. */
export function dedupePublications<T extends Dedupable>(pubs: ReadonlyArray<T>): T[] {
  return collapse(collapse([...pubs], (p) => doiKey(p.doi)), (p) => titleKey(p.title))
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

/**
 * Does one byline segment name the person whose PubMed-style `authorName` is
 * given ("Ingraham NE")? The ONE name matcher: the author column, the lab
 * first-author stat and a member's paper list all read it. D1 bylines come in
 * two styles side by side:
 *   - PubMed "Ingraham NE": the whole name must match. A substring test lets
 *     "Collins C" match "Collins CA", a different author.
 *   - full name "Nicholas E. Ingraham": the surname ends the segment and the
 *     given names' initials agree with the PubMed initials. Matching only the
 *     PubMed form left most lab first authors unmatched ("19 with a lab first
 *     author" of 579; G12-6, 2026-10-14).
 *
 * "Agree" means no initial contradicts another, so a namesake whose middle
 * initial differs stays out ("David X. Wacker" is not "Wacker DA"). One
 * initials run must start the other, either side may leave the middle off
 * ("Nicholas Ingraham" for "Ingraham NE", "Kendall R. McEachron" for
 * "McEachron K"), or the PubMed initials may follow extra leading given names
 * ("A. Claire Collins" for "Collins C"). A stranger with the same surname and
 * no contradicting initial cannot be told apart from the byline alone, in
 * either form.
 */
export function segmentNamesAuthor(segment: string, authorName: string): boolean {
  const seg = normaliseAuthor(segment)
  const want = normaliseAuthor(authorName)
  if (!seg || !want) return false
  if (seg === want) return true
  const parts = want.split(' ')
  if (parts.length < 2) return false
  const surname = parts.slice(0, -1).join(' ').toLowerCase()
  const wantInitials = parts[parts.length - 1].toLowerCase()
  const words = seg.split(' ')
  const n = parts.length - 1
  if (words.length <= n) return false
  if (words.slice(-n).join(' ').toLowerCase() !== surname) return false
  const segInitials = words.slice(0, -n).map(givenInitials).join('')
  if (!segInitials) return false
  return segInitials.startsWith(wantInitials) || wantInitials.startsWith(segInitials) || segInitials.endsWith(wantInitials)
}

/** A given-name word's initials: "Nicholas" -> "n"; an initials run left by
 *  the punctuation strip ("J.G." -> "JG") -> "jg". */
function givenInitials(word: string): string {
  return /^\p{Lu}{1,3}$/u.test(word) ? word.toLowerCase() : word.charAt(0).toLowerCase()
}

/** True when the byline lists `authorName` (either byline style). */
export function bylineHasAuthor(authors: string | undefined, authorName: string): boolean {
  if (!authors) return false
  return authors.split(/[,;]/).some((a) => segmentNamesAuthor(a, authorName))
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
  if (member.authorName && bylineHasAuthor(pub.authors, member.authorName)) return true
  if (!slug || !slugs.includes(slug)) return false
  // A stored slug is a claim; the byline is the record (Rule 89). The slug
  // still credits a byline the matcher cannot parse ("Safadi, S.", "Ingraham
  // N") and a group author ("COVID-OUT Study Team"), but not a byline that
  // never names the member and has no group: D1 credits two staff with a CCI
  // paper they did not write (review of ov14/h10-public, 2026-10-14).
  if (!member.authorName || !pub.authors?.trim()) return true
  return bylineHasSurname(pub.authors, member.authorName) || GROUP_AUTHOR.test(pub.authors)
}

/** A consortium or study-group byline entry, whose members are not listed. */
const GROUP_AUTHOR = /\b(study team|study group|consortium|investigators|collaborative|network|working group)\b/i

/** True when the byline carries the surname of `authorName` as whole words. */
function bylineHasSurname(authors: string, authorName: string): boolean {
  const parts = normaliseAuthor(authorName).toLowerCase().split(' ')
  const surname = (parts.length > 1 ? parts.slice(0, -1) : parts).join(' ')
  const byline = ` ${normaliseAuthor(authors.replace(/[,;]/g, ' ')).toLowerCase()} `
  return byline.includes(` ${surname} `)
}

export function memberPublications<T extends Pick<Publication, 'authors' | 'authorSlugs'>>(
  pubs: ReadonlyArray<T>,
  member: Pick<TeamMember, 'slug' | 'authorName'> | undefined,
): T[] {
  if (!member) return []
  return pubs.filter((p) => isMemberPublication(p, member))
}
