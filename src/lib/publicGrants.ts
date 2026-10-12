/**
 * publicGrants -- the live grant rows as the public pages see them.
 *
 * GET /api/grants gives an anonymous visitor only { id, venue, bucket } (venue is
 * agency + mechanism: "NHLBI K23"); a signed-in member also gets the title, the
 * PI and the rest (api/index.ts, defineRoute /api/grants). So:
 *  - the Home funding line needs only venue and bucket and works for everyone;
 *  - a lab member's own grants (/nick, /nate) need the PI, so they appear only
 *    when the response carries it. For an anonymous visitor the list is empty,
 *    never a guess and never a hard-coded one.
 */
import type { GrantProduct } from './grants'
import { mechanismOf } from './grants'
import { displayName, fullNameForSlug } from './nameUtils'

export type PublicGrant = Pick<GrantProduct, 'id' | 'bucket'> & Partial<Omit<GrantProduct, 'id' | 'bucket'>>

/** "NHLBI K23" -> "NHLBI"; a venue with no mechanism is the agency alone. */
export function agencyOf(venue: string | null | undefined): string {
  if (!venue) return ''
  const mech = mechanismOf(venue)
  return (mech ? venue.replace(new RegExp(`\\b${mech}\\b`, 'i'), '') : venue).replace(/\s+/g, ' ').trim()
}

/** True when the grant's PI field names this member (a slug or a display name). */
export function isPiOf(pi: string | null | undefined, slug: string): boolean {
  if (!pi) return false
  const want = pi.trim().toLowerCase()
  return want === slug || want === displayName(slug).toLowerCase() || want === fullNameForSlug(slug).toLowerCase()
}

export interface PersonGrantRow {
  mechanism: string
  title: string
  agency: string
  bucket: GrantProduct['bucket']
}

/** One member's grants for the funding section: active, then proposed. Ended
 *  grants are not listed. A row with no title shows its venue. */
export function grantsForPi(rows: ReadonlyArray<PublicGrant>, slug: string): PersonGrantRow[] {
  return rows
    .filter((g) => isPiOf(g.pi, slug) && (g.bucket === 'active' || g.bucket === 'proposed'))
    .map((g) => ({
      mechanism: mechanismOf(g.venue) ?? '',
      title: g.short_name?.trim() || g.title?.trim() || g.venue?.trim() || '',
      agency: agencyOf(g.venue),
      bucket: g.bucket,
    }))
    .sort((a, b) => Number(b.bucket === 'active') - Number(a.bucket === 'active'))
}
