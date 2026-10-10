// Small pieces of the Today skin (.tk-* in index.css) shared by the task card,
// the meeting card, the drawer and the rail: the initials face, a face stack, a
// person label (face + first name) and the check glyph. Presentational only.


import { initialsFor, firstNameFor, firstOf, initialsOfName, fullNameReadable, photoFor, slugForName } from '../../lib/personLabel'
import { fullNameForSlug } from '../../lib/nameUtils'

/** THE face circle: the photo when there is one, else the initials
 *  (rules-ui-design 18). Same size and ring either way. Every face on Today,
 *  the drawers, rails, threads and meeting attendees renders through this, so
 *  no surface can show initials for someone who has a photo. */
export function FaceDisc({ initials, photo, label, title, lg = false, sm = false, decorative = false }: {
  initials: string
  photo?: string
  label: string
  title?: string
  lg?: boolean
  sm?: boolean
  /** Hidden from screen readers (the name is printed beside it). */
  decorative?: boolean
}) {
  const cls = `tk-face${lg ? ' tk-lg' : ''}${sm ? ' tk-sm' : ''}${photo ? ' tk-photo' : ''}`
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }
  return (
    <span className={cls} title={title ?? label} {...a11y}>
      {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : initials}
    </span>
  )
}

/** One person as a face. `lg` is the 26px corner face on a card; `sm` 16px. */
export function Face({ slug, lg = false, sm = false }: { slug: string; lg?: boolean; sm?: boolean }) {
  return <FaceDisc initials={initialsFor(slug)} photo={photoFor(slug)} label={fullNameReadable(slug)} lg={lg} sm={sm} />
}

/** A face from a bare display name (mentees and waiting-on arrive as names).
 *  A name that is exactly a team member's gets that member's photo. */
export function NameFace({ name, sm = false }: { name: string; sm?: boolean }) {
  const slug = slugForName(name)
  return <FaceDisc initials={initialsOfName(name)} photo={slug ? photoFor(slug) : undefined} label={name} sm={sm} decorative />
}

/** THE people pattern on Today: badge + FIRST name. Pass a slug, or a free-text name. */
export function Person({ slug, name }: { slug?: string; name?: string }) {
  if (slug) return <><Face slug={slug} sm /><span className="tk-pn">{firstNameFor(slug)}</span></>
  const n = name ?? ''
  return <><NameFace name={n} sm /><span className="tk-pn">{firstOf(n)}</span></>
}

// Each word needs a lowercase letter after the capital, so acronyms and
// all-caps values (IRB, NIH) are not names. "Pharmacy" still passes: a word
// shape cannot tell it from a surname. The roster lookup in Who() only sees
// lowercase slugs (SLUG_LIKE), so it never vets a capitalised value; only a
// roster of display names or known organisations could.
/** A name that is a person: 1-3 capitalised words ("Casey", "Dr. Grandon",
 *  "Lianne Siegel"). A sentence or a lowercase phrase is not. */
const NAME_LIKE = /^[A-Z][a-z][A-Za-z0-9_.'-]*( +[A-Z][a-z][A-Za-z0-9_.'-]*){0,2}$/
const SLUG_LIKE = /^[a-z][a-z0-9-]*$/

/** waiting_on / promised_to are free text. A face + first name only when the
 *  value is a person (known team slug, or name-shaped); a phrase such as
 *  "waiting for Dr. Grandon to respond" stays plain text, never a bogus "WR"
 *  disc. */
export function Who({ value }: { value: string }) {
  const v = value.trim()
  if (SLUG_LIKE.test(v) && fullNameForSlug(v) !== v) return <Person slug={v} />
  if (NAME_LIKE.test(v)) return <Person name={v} />
  return <span className="tk-pn">{v}</span>
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
