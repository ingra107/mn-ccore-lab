// Small pieces of the Today skin (.tk-* in index.css) shared by the task card,
// the meeting card, the drawer and the rail: the initials face, a face stack, a
// person label (face + first name) and the check glyph. Presentational only.

import { fullNameForSlug } from '../../lib/nameUtils'
import { initialsFor, firstNameFor, firstOf, initialsOfName } from '../../lib/personLabel'

/** One person as an initials disc. `lg` is the 26px corner face on a card; `sm` 16px. */
export function Face({ slug, lg = false, sm = false }: { slug: string; lg?: boolean; sm?: boolean }) {
  const name = fullNameForSlug(slug)
  return (
    <span className={`tk-face${lg ? ' tk-lg' : ''}${sm ? ' tk-sm' : ''}`} title={name} aria-label={name}>
      {initialsFor(slug)}
    </span>
  )
}

/** A face from a bare display name (mentees and waiting-on arrive as names). */
export function NameFace({ name, sm = false }: { name: string; sm?: boolean }) {
  return <span className={`tk-face${sm ? ' tk-sm' : ''}`} title={name} aria-hidden="true">{initialsOfName(name)}</span>
}

/** THE people pattern on Today: badge + FIRST name. Pass a slug, or a free-text name. */
export function Person({ slug, name }: { slug?: string; name?: string }) {
  if (slug) return <><Face slug={slug} sm /><span className="tk-pn">{firstNameFor(slug)}</span></>
  const n = name ?? ''
  return <><NameFace name={n} sm /><span className="tk-pn">{firstOf(n)}</span></>
}

/** Up to `max` overlapping faces, then a "+n" disc. Skips blanks and repeats. */
export function Faces({ slugs, max = 3 }: { slugs: Array<string | null | undefined>; max?: number }) {
  const uniq = Array.from(new Set(slugs.filter((s): s is string => !!s)))
  if (uniq.length === 0) return null
  return (
    <span className="tk-faces">
      {uniq.slice(0, max).map((s) => <Face key={s} slug={s} />)}
      {uniq.length > max && <span className="tk-face">+{uniq.length - max}</span>}
    </span>
  )
}

export function CheckGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
