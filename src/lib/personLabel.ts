// One way to name a person on Today: a small initials badge + FIRST name.
// (Nick 2026-10-09 on the drawer activity lines: "so sleek and elegant with the
// badges and first name so it leaves so much room and doesn't clutter".)
// The badge is today/skin.tsx's Face; these helpers feed it.

import { fullNameForSlug, displayName } from './nameUtils'
import { getPersonInfo, getAllMembers } from '../data/team'

/** The person's profile photo, or undefined. The same lookup every Avatar
 *  caller uses (getPersonInfo), so a face on Today and a face on the Team page
 *  show the same picture (rules-ui-design 18). */
export function photoFor(slug: string): string | undefined {
  return slug ? getPersonInfo(slug).photoUrl : undefined
}

/** A free-text name ("Casey Eddington") that is exactly a team member's name
 *  maps to that member's slug; anything else is not a team member. */
export function slugForName(name: string): string | undefined {
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  const hit = getAllMembers().find((m) => m.slug && (m.name.toLowerCase() === n || fullNameForSlug(m.slug).toLowerCase() === n))
  return hit?.slug
}

/** A slug the static team data does not know ("lianne-siegel") reads as a name
 *  ("Lianne Siegel") rather than as a raw slug. Known people pass through. */
function readable(slug: string, name: string): string {
  if (name !== slug) return name
  return slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Two letters from a person's full name ("Casey Eddington" -> "CE"). */
/** Full name for display and screen readers: the team name, or a readable form of an unknown slug. */
export function fullNameReadable(slug: string): string {
  return readable(slug, fullNameForSlug(slug))
}

export function initialsFor(slug: string): string {
  const parts = readable(slug, fullNameForSlug(slug)).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const a = parts[0][0] ?? ''
  const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (a + b).toUpperCase() || '?'
}

/** First name by the Hub's naming rule (preferred name wins: "Adams", "Nick"). */
export function firstNameFor(slug: string): string {
  return readable(slug, displayName(slug, 'display')).split(/\s+/)[0] || slug
}

/** First token of a free-text name ("Casey Eddington" -> "Casey"). */
export function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/** Initials from a free-text name. */
export function initialsOfName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?'
}

/** Team slugs inside server-written text ("Created task: X → nick-ingraham",
 *  "Added adams-dudley to CCI") read as first names ("→ Nick", "Added Adams").
 *  Only slugs the team data knows are replaced, as whole tokens, so a hyphenated
 *  word that merely looks like a slug is left alone. */
export function nameSlugsInText(text: string): string {
  if (!text) return text
  const slugs = getAllMembers().map((m) => m.slug).filter((s): s is string => !!s && s.includes('-'))
  if (slugs.length === 0) return text
  const escaped = slugs.sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![\\w-])(${escaped.join('|')})(?![\\w-])`, 'g')
  return text.replace(re, (slug) => firstNameFor(slug))
}
