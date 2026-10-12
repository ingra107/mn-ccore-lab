// Small pieces of the Today skin (.tk-* in index.css) shared by the task card,
// the meeting card, the drawer and the rail: the initials face, a face stack, a
// person label (face + first name) and the check glyph. Presentational only.


import { initialsFor, firstNameFor, firstOf, initialsOfName, fullNameReadable, photoFor, slugForName } from '../../lib/personLabel'
import { fullNameForSlug } from '../../lib/nameUtils'
import HermesMark from '../HermesMark'
import type React from 'react'

/** THE face circle: the photo when there is one, else the initials
 *  (rules-ui-design 18). Same size and ring either way. Every face in the Hub
 *  (Today, drawers, rails, threads, attendees, profile and directory) renders
 *  through this, so no surface can show initials for someone who has a photo.
 *  The old `Avatar` component was deleted into it (2026-10-12).
 *
 *  Sizes: `sm` 16px, default 22px, `lg` 26px, or any `px` (profile photos),
 *  with `pxSm` the phone size. `variant="hue"` is the member's own hue (only
 *  inside a `.member-hue` scope); `"brand"` is the public site's ring.
 *  `hermes` draws the Hermes mark in place of a photo or initials. */
export function FaceDisc({ initials, photo, label, title, lg = false, sm = false, decorative = false, px, pxSm, variant, hermes = false }: {
  initials: string
  photo?: string
  label: string
  title?: string
  lg?: boolean
  sm?: boolean
  /** Hidden from screen readers (the name is printed beside it). */
  decorative?: boolean
  px?: number
  pxSm?: number
  variant?: 'hue' | 'brand'
  hermes?: boolean
}) {
  const cls = `tk-face${lg ? ' tk-lg' : ''}${sm ? ' tk-sm' : ''}${photo && !hermes ? ' tk-photo' : ''}${px ? ' tk-fd' : ''}${variant ? ` tk-${variant}` : ''}${hermes ? ' tk-herm' : ''}`
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }
  const style = px ? ({ '--fd': `${px}px`, '--fdm': `${pxSm ?? px}px` } as React.CSSProperties) : undefined
  return (
    <span className={cls} style={style} title={title ?? label} {...a11y}>
      {hermes
        ? <HermesMark variant="icon" size={px ? Math.round(px * 0.7) : 14} pulse />
        : photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : initials}
    </span>
  )
}

/** One person as a face. `lg` is the 26px corner face on a card; `sm` 16px. */
export function Face({ slug, lg = false, sm = false, px }: { slug: string; lg?: boolean; sm?: boolean; px?: number }) {
  return <FaceDisc initials={initialsFor(slug)} photo={photoFor(slug)} label={fullNameReadable(slug)} lg={lg} sm={sm} px={px} hermes={slug === 'claude-ai'} />
}

/** A face from a bare display name (mentees and waiting-on arrive as names).
 *  A name that is exactly a team member's gets that member's photo. */
export function NameFace({ name, sm = false }: { name: string; sm?: boolean }) {
  const slug = slugForName(name)
  return <FaceDisc initials={initialsOfName(name)} photo={slug ? photoFor(slug) : undefined} label={name} sm={sm} decorative />
}

/** A pill name shrinks to a 3em floor + ellipsis when the line is tight. A
 *  name of six characters or fewer is about that wide already, so it keeps its
 *  own width (`tk-pn-s`) instead of being padded out to the floor. CSS cannot
 *  say min(3em, max-content), so the text length picks the class. */
const pnClass = (text: string) => (text.length <= 6 ? 'tk-pn tk-pn-s' : 'tk-pn')

/** THE people pattern on Today: badge + FIRST name. Pass a slug, or a free-text name. */
export function Person({ slug, name }: { slug?: string; name?: string }) {
  if (slug) { const first = firstNameFor(slug); return <><Face slug={slug} sm /><span className={pnClass(first)}>{first}</span></> }
  const n = name ?? ''
  const first = firstOf(n)
  return <><NameFace name={n} sm /><span className={pnClass(first)}>{first}</span></>
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
  return <span className={pnClass(v)}>{v}</span>
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
