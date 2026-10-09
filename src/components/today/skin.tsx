// Small pieces of the Today skin (.tk-* in index.css) shared by the task card,
// the meeting card and the rail: the initials face, a face stack, and the
// check glyph. Presentational only; no data fetching.

import { fullNameForSlug } from '../../lib/nameUtils'

/** Two letters from a person's full name ("Casey Eddington" -> "CE"). */
function initialsFor(slug: string): string {
  const parts = fullNameForSlug(slug).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0][0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (a + b).toUpperCase() || '?'
}

/** One person as an initials disc. `lg` is the 26px corner face on a card. */
export function Face({ slug, lg = false }: { slug: string; lg?: boolean }) {
  const name = fullNameForSlug(slug)
  return (
    <span className={`tk-face${lg ? ' tk-lg' : ''}`} title={name} aria-label={name}>
      {initialsFor(slug)}
    </span>
  )
}

/** A face from a bare display name (mentees arrive as names, not slugs). */
export function NameFace({ name }: { name: string }) {
  const parts = name.split(/\s+/).filter(Boolean)
  const ini = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?'
  return <span className="tk-face" title={name} aria-hidden="true">{ini}</span>
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
