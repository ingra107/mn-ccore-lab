// Name display system — 4-tier display names derived from 3 stored fields.
//
// Stored per team member (D1 team_members):
//   full_name       — "Nicholas Ingraham" (formal, legal)
//   preferred_name  — "Nick" (what people call them)
//   credentials     — "MD" (optional)
//
// Derived tiers (never stored):
//   formal    — "Nicholas Ingraham, MD"    — public team page, formal contexts
//   display   — "Nick Ingraham"            — dashboards, detail panels, portal default
//   short     — "Nick I."                  — table cells, compact rows
//   initials  — "NI"                       — avatars, tiny badges
//
// Slugs are immutable identifiers. Display names can change without touching the slug.

import { getPersonInfo, directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'

export type NameTier = 'formal' | 'display' | 'short' | 'initials'

export interface NameProfile {
  slug: string
  full_name?: string | null
  preferred_name?: string | null
  credentials?: string | null
  /** Legacy display name (current team_members.name). Used as fallback for display tier. */
  name?: string | null
}

function firstToken(s: string): string {
  return s.trim().split(/\s+/)[0] ?? ''
}

function lastToken(s: string): string {
  const parts = s.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ''
}

/** Compute initials from a display-style name ("Nick Ingraham" → "NI"). */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Render a name profile at the requested tier.
 * Degrades gracefully: if full_name/preferred_name are missing, falls back to `name`.
 */
export function formatName(profile: NameProfile, tier: NameTier = 'display'): string {
  const fullName = (profile.full_name || '').trim()
  const preferred = (profile.preferred_name || '').trim()
  const legacy = (profile.name || '').trim()
  const creds = (profile.credentials || '').trim()

  // Base display — prefer preferred + last(full), else fall back to legacy `name`
  const displayBase =
    preferred && fullName ? `${preferred} ${lastToken(fullName)}` :
    preferred && legacy ? `${preferred} ${lastToken(legacy)}` :
    legacy || fullName || profile.slug || 'Unknown'

  switch (tier) {
    case 'formal': {
      const formalBase = fullName || displayBase
      return creds ? `${formalBase}, ${creds}` : formalBase
    }
    case 'display':
      return displayBase
    case 'short': {
      const firstName = preferred || firstToken(displayBase)
      const last = lastToken(fullName || legacy || '')
      return last ? `${firstName} ${last[0]}.` : firstName
    }
    case 'initials':
      return deriveInitials(displayBase)
  }
}

/**
 * Look up a team member by slug from the static team.ts data and return a
 * NameProfile. Temporary bridge until all callers fetch from the D1-backed
 * `GET /api/team/:slug/profile` endpoint.
 *
 * Falls back to legacy `getPersonInfo(slug).name` when the slug matches a
 * non-team identity (Hermes, bare emails).
 */
export function profileFromStatic(slug: string): NameProfile {
  if (!slug) return { slug: '', name: 'Unknown' }
  if (slug === 'claude-ai') return { slug, name: 'Hermes' }

  const director = directors.find((d) => d.slug === slug)
  if (director) {
    return {
      slug,
      full_name: FULL_NAME_OVERRIDES[slug] ?? director.name,
      preferred_name: PREFERRED_NAME_OVERRIDES[slug] ?? firstToken(director.name),
      credentials: director.credentials,
      name: director.name,
    }
  }

  for (const pool of [seniorMentors, facultyCollaborators, researchTeam]) {
    const m = pool.find((x) => x.slug === slug)
    if (m) {
      return {
        slug,
        full_name: FULL_NAME_OVERRIDES[slug] ?? m.name,
        preferred_name: PREFERRED_NAME_OVERRIDES[slug] ?? firstToken(m.name),
        credentials: m.credentials,
        name: m.name,
      }
    }
  }

  // Unknown / email fallback — use legacy info
  const info = getPersonInfo(slug)
  return { slug, name: info.name }
}

/** Convenience: look up + format in one call. */
export function displayName(slug: string, tier: NameTier = 'display'): string {
  return formatName(profileFromStatic(slug), tier)
}

/**
 * Overrides where `team.ts` legacy `name` is already a casual form
 * (e.g. "Nick" vs "Nicholas"). Seed data for schema-v41 backfill.
 * Keys are slug. Keep in sync with `api/migrations/seed-names-v41.sql`.
 */
const FULL_NAME_OVERRIDES: Record<string, string> = {
  nick: 'Nicholas Ingraham',
  nate: 'Nathan Mesfin',
  dudley: 'Robert Adams Dudley',
  chipman: 'Jeffrey Chipman',
  mceachron: 'Kendall McEachron',
  safadi: 'Sami Safadi',
  begnaud: 'Abbie Begnaud',
  henkle: 'Benjamin Henkle',
  macdonald: 'David MacDonald',
  trujeque: 'Joshua Trujeque',
  pendleton: 'Katherine Pendleton',
  kalinoski: 'Michael Kalinoski',
  wacker: 'David Wacker',
  arriaza: 'Steven Arriaza',
  bromley: 'Emma Bromley',
  eddington: 'Casey Eddington',
  shyu: 'Daniel Shyu',
  fitzgerald: 'Beret Fitzgerald',
  collins: 'Claire Collins',
}

const PREFERRED_NAME_OVERRIDES: Record<string, string> = {
  nick: 'Nick',
  nate: 'Nate',
  dudley: 'Adams',
  chipman: 'Jeff',
  macdonald: 'Dave',
  trujeque: 'Josh',
  pendleton: 'Katie',
  wacker: 'Dave',
  shyu: 'Dan',
  // The rest: preferred_name defaults to firstToken(full_name) so we don't
  // need an override.
}

/** SQL-friendly seed rows for the v41 backfill. Mirrors the overrides above. */
export function seedRows(): Array<{ slug: string; full_name: string; preferred_name: string }> {
  return Object.keys(FULL_NAME_OVERRIDES).map((slug) => ({
    slug,
    full_name: FULL_NAME_OVERRIDES[slug],
    preferred_name: PREFERRED_NAME_OVERRIDES[slug] ?? firstToken(FULL_NAME_OVERRIDES[slug]),
  }))
}
