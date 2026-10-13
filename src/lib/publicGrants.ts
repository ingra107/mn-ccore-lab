/**
 * publicGrants -- the live grant rows as the public pages see them.
 *
 * GET /api/grants gives an anonymous visitor FUNDED AWARDS ONLY (Nick
 * 2026-10-12), each as { id, venue, bucket, project_title, pi, pi_name }: venue
 * is agency + mechanism ("NHLBI K23"). Applications and proposals are not in an
 * anonymous response at all; a signed-in member also gets those, with titles,
 * stages and dates (api/index.ts, FUNDED_AWARDS_ONLY). So the same code serves
 * both: the Home funding line counts active rows, and the director member pages (/team/nick-ingraham, /team/nate-mesfin)
 * list a member's own rows by PI.
 */
import type { GrantProduct } from './grants'
import { mechanismOf } from './grants'
import { displayName, fullNameForSlug } from './nameUtils'

export type PublicGrant = Pick<GrantProduct, 'id' | 'bucket'> & Partial<Omit<GrantProduct, 'id' | 'bucket'>> & {
  /** The PI's display name; an anonymous funded-award row carries it with the slug in `pi`. */
  pi_name?: string | null
}

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
 *  grants are not listed. A row with no product title shows the project title, then the venue. */
export function grantsForPi(rows: ReadonlyArray<PublicGrant>, slug: string): PersonGrantRow[] {
  return rows
    .filter((g) => isPiOf(g.pi, slug) && (g.bucket === 'active' || g.bucket === 'proposed'))
    .map((g) => ({
      mechanism: mechanismOf(g.venue) ?? '',
      title: g.short_name?.trim() || g.title?.trim() || g.project_title?.trim() || g.venue?.trim() || '',
      agency: agencyOf(g.venue),
      bucket: g.bucket,
    }))
    .sort((a, b) => Number(b.bucket === 'active') - Number(a.bucket === 'active'))
}

/** The rows a public page shows: drops stub rows ("---", no mechanism, the departmental line). The Funding rail entry and GrantsSection both read this, so the rail never links to a missing anchor. */
export function realGrants<T extends { title?: string | null; mechanism?: string | null }>(grants: ReadonlyArray<T>): T[] {
  return grants.filter((g) => {
    const t = g.title?.trim()
    const m = g.mechanism?.trim()
    return Boolean(t) && t !== '---' && t !== 'Departmental Operational Support' && Boolean(m) && m !== '---'
  })
}
