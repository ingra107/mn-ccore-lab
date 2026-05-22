import { describe, it, expect } from 'vitest'
import { actorSlug, assertProtectedNotNull, resolveActor } from './helpers'
import type { AuthUser, Env } from './helpers'

// W1 (2026-04-29) — verify EMAIL_PREFIX_TO_SLUG canonicalizes ningraha@umn.edu
// to 'nick-ingraham'. Closes A0 Decision #7: prior to W1, `ningraha:` was missing
// from the LUT so 3 INSERT sites hardcoded the literal `'ningraha'` to compensate.
// W1 added the LUT entry + flipped those 3 sites to use `'nick-ingraham'`.

describe('actorSlug — W1 ningraha canonicalization', () => {
  it('canonicalizes ningraha@umn.edu to nick-ingraham', () => {
    expect(actorSlug('ningraha@umn.edu')).toBe('nick-ingraham')
  })

  it('canonicalizes nick@umn.edu to nick-ingraham (legacy short form)', () => {
    expect(actorSlug('nick@umn.edu')).toBe('nick-ingraham')
  })

  it('canonicalizes ingra107@umn.edu to nick-ingraham (real UMN NetID)', () => {
    expect(actorSlug('ingra107@umn.edu')).toBe('nick-ingraham')
  })

  it('handles uppercase input via lowercasing', () => {
    expect(actorSlug('NINGRAHA@umn.edu')).toBe('nick-ingraham')
  })

  it('falls through to literal prefix for unknown emails', () => {
    expect(actorSlug('unknown@umn.edu')).toBe('unknown')
  })

  it('canonicalizes other team prefixes', () => {
    expect(actorSlug('bromley@umn.edu')).toBe('emma-bromley')
    expect(actorSlug('mceachron@umn.edu')).toBe('kendall-mceachron')
  })
})

// ── AM-1: protected-field null validator ──────────────────────────────────────
describe('assertProtectedNotNull — AM-1 (SEC-T0-5)', () => {
  it('rejects a null protected field on tasks', () => {
    expect(assertProtectedNotNull('tasks', { status: null })).toMatch(/status/)
    expect(assertProtectedNotNull('tasks', { priority: '' })).toMatch(/priority/)
    expect(assertProtectedNotNull('tasks', { assignee: undefined })).toMatch(/assignee/)
  })

  it('rejects a null protected field on projects', () => {
    expect(assertProtectedNotNull('projects', { category: null })).toMatch(/category/)
    expect(assertProtectedNotNull('projects', { stage: '' })).toMatch(/stage/)
    expect(assertProtectedNotNull('projects', { status: undefined })).toMatch(/status/)
  })

  it('allows a present, non-empty protected value', () => {
    expect(assertProtectedNotNull('tasks', { status: 'todo', priority: 'high', assignee: 'nick-ingraham' })).toBeNull()
    expect(assertProtectedNotNull('projects', { status: 'active', stage: 'idea', category: 'MNCCORE' })).toBeNull()
  })

  it('allows a protected field that is simply ABSENT (partial patch)', () => {
    // Only status present + valid; priority/assignee absent → fine.
    expect(assertProtectedNotNull('tasks', { status: 'done' })).toBeNull()
    // No protected fields at all in the patch → fine.
    expect(assertProtectedNotNull('tasks', { description: 'x' })).toBeNull()
  })

  it('ignores unprotected tables and empty objects', () => {
    expect(assertProtectedNotNull('inbox_events', { status: null })).toBeNull()
    expect(assertProtectedNotNull('tasks', null)).toBeNull()
    expect(assertProtectedNotNull('tasks', {})).toBeNull()
  })
})

// ── AM-2: actor-override slug validation ──────────────────────────────────────
// Minimal env stub: team_members has slugs 'nick-ingraham' and 'nate-mesfin'.
function makeActorEnv(knownSlugs: string[]): Env {
  return {
    DB: {
      prepare: (_sql: string) => ({
        bind: (slug: string) => ({
          first: async () => (knownSlugs.includes(slug) ? { 1: 1 } : null),
        }),
      }),
    },
  } as unknown as Env
}

const nickUser: AuthUser = { email: 'ingra107@umn.edu' } // → nick-ingraham
const teamUser: AuthUser = { email: 'nate@umn.edu' }     // → nate-mesfin (LUT)

describe('resolveActor — AM-2 (SEC-T0-6)', () => {
  const env = makeActorEnv(['nick-ingraham', 'nate-mesfin'])

  it('defaults to the caller slug when no override', async () => {
    const r = await resolveActor(env, nickUser, undefined, { allowImpersonation: false })
    expect(r).toEqual({ slug: 'nick-ingraham' })
  })

  it('accepts the caller acting as themselves via override', async () => {
    const r = await resolveActor(env, teamUser, 'nate-mesfin', { allowImpersonation: false })
    expect(r).toEqual({ slug: 'nate-mesfin' })
  })

  it('canonicalizes an email-looking override before validating', async () => {
    const r = await resolveActor(env, nickUser, 'ningraha@umn.edu', { allowImpersonation: false })
    expect(r).toEqual({ slug: 'nick-ingraham' }) // ningraha → nick-ingraham (own slug)
  })

  it('rejects an unknown slug override with an error', async () => {
    const r = await resolveActor(env, nickUser, 'not-a-real-member', { allowImpersonation: true })
    expect('error' in r && r.error).toMatch(/Unknown actor/)
  })

  it('blocks impersonation for non-PI/non-service callers', async () => {
    const r = await resolveActor(env, teamUser, 'nick-ingraham', { allowImpersonation: false })
    expect('error' in r && r.error).toMatch(/Not authorized to act as/)
  })

  it('allows impersonation when allowImpersonation is true (PI/service)', async () => {
    const r = await resolveActor(env, teamUser, 'nick-ingraham', { allowImpersonation: true })
    expect(r).toEqual({ slug: 'nick-ingraham' })
  })

  it('always allows claude-ai (Hermes) regardless of impersonation flag', async () => {
    const r = await resolveActor(env, teamUser, 'claude-ai', { allowImpersonation: false })
    expect(r).toEqual({ slug: 'claude-ai' })
  })
})
