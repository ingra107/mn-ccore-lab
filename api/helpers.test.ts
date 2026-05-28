import { describe, it, expect } from 'vitest'
import {
  actorSlug, assertProtectedNotNull, resolveActor,
  actorSlugFromRequest, canSeePbProject, assertProjectVisible,
  projectRefToCanonical, safeTaskRow, safeRow, TABLE_PRIVATE_COLS,
} from './helpers'
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

// ── A1: actorSlugFromRequest ──────────────────────────────────────────────────

// Minimal env with TEST_MODE_KEY for auth bypass
function makeAuthEnv(testModeKey = 'test-key'): Env {
  return { TEST_MODE_KEY: testModeKey, DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as unknown as Env
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/', { headers })
}

describe('actorSlugFromRequest — A1', () => {
  it('returns canonical slug for an authenticated test user', async () => {
    const env = makeAuthEnv('local-test-key')
    const req = makeRequest({
      'X-Test-Mode-Key': 'local-test-key',
      'X-Test-User': 'ingra107@umn.edu',
    })
    const slug = await actorSlugFromRequest(req, env)
    expect(slug).toBe('nick-ingraham')
  })

  it('returns the LUT-mapped slug, not raw email prefix', async () => {
    const env = makeAuthEnv('local-test-key')
    const req = makeRequest({
      'X-Test-Mode-Key': 'local-test-key',
      'X-Test-User': 'nate@umn.edu',
    })
    const slug = await actorSlugFromRequest(req, env)
    expect(slug).toBe('nate-mesfin')
  })

  it('returns null when unauthenticated (no JWT, no test headers)', async () => {
    const env = makeAuthEnv('local-test-key')
    const req = makeRequest({})
    const slug = await actorSlugFromRequest(req, env)
    expect(slug).toBeNull()
  })

  it('returns null when test key is wrong', async () => {
    const env = makeAuthEnv('local-test-key')
    const req = makeRequest({
      'X-Test-Mode-Key': 'wrong-key',
      'X-Test-User': 'ingra107@umn.edu',
    })
    const slug = await actorSlugFromRequest(req, env)
    expect(slug).toBeNull()
  })
})

// ── A3: projectRefToCanonical ─────────────────────────────────────────────────

// Minimal DB stub for project lookups
function makeProjectEnv(projects: Array<{ id: string; slug: string | null; category?: string }>): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (ref1: string, ref2: string) => ({
          first: async <T>() => {
            const row = projects.find(p => p.id === ref1 || p.slug === ref2)
            if (!row) return null
            // Return different shapes based on what SQL asks for
            if (sql.includes('category')) return row as unknown as T
            return { id: row.id, slug: row.slug } as unknown as T
          },
        }),
      }),
    },
    // PI emails: only ingra107
    TEST_MODE_KEY: 'test-key',
  } as unknown as Env
}

describe('projectRefToCanonical — A3', () => {
  const env = makeProjectEnv([
    { id: 'proj_ABC', slug: 'my-project', category: 'MNCCORE' },
    { id: 'proj_DEF', slug: null, category: 'CLIF' },
    { id: 'proj_PB', slug: 'pb-project', category: 'Peripheral Brain' },
  ])

  it('resolves by id → returns slug form when slug present', async () => {
    const result = await projectRefToCanonical(env, 'proj_ABC')
    expect(result).toBe('my-project')
  })

  it('resolves by slug → returns slug form', async () => {
    const result = await projectRefToCanonical(env, 'my-project')
    expect(result).toBe('my-project')
  })

  it('resolves by id → returns id form when slug is null', async () => {
    const result = await projectRefToCanonical(env, 'proj_DEF')
    expect(result).toBe('proj_DEF')
  })

  it('returns null for an unknown ref', async () => {
    const result = await projectRefToCanonical(env, 'not-a-project')
    expect(result).toBeNull()
  })
})

// ── A2: canSeePbProject + assertProjectVisible ────────────────────────────────

// DB stub that can return projects with a category, plus lab_settings for PI emails
function makePbEnv(projects: Array<{ id: string; slug: string | null; category: string }>): Env {
  const piEmailsRow = { value: JSON.stringify(['ingra107@umn.edu', 'nicholas.ingraham@gmail.com']) }

  return {
    TEST_MODE_KEY: 'test-key',
    DB: {
      prepare: (sql: string) => {
        // lab_settings query (PI emails)
        if (sql.includes('lab_settings')) {
          return {
            first: async () => piEmailsRow,
          }
        }
        // project lookup — two bound params (id, slug)
        return {
          bind: (ref1: string, ref2: string) => ({
            first: async () => {
              const row = projects.find(p => p.id === ref1 || p.slug === ref2)
              return row ?? null
            },
          }),
        }
      },
    },
  } as unknown as Env
}

function makePbRequest(email: string, testKey = 'test-key'): Request {
  return new Request('https://example.com/', {
    headers: {
      'X-Test-Mode-Key': testKey,
      'X-Test-User': email,
    },
  })
}

describe('canSeePbProject + assertProjectVisible — A2', () => {
  const projects = [
    { id: 'proj_PB', slug: 'pb-project', category: 'Peripheral Brain' },
    { id: 'proj_MC', slug: 'mnccore-project', category: 'MNCCORE' },
  ]
  const env = makePbEnv(projects)

  it('PI caller + PB project → canSeePbProject true', async () => {
    const req = makePbRequest('ingra107@umn.edu')
    const result = await canSeePbProject(req, env, 'pb-project')
    expect(result).toBe(true)
  })

  it('non-PI caller + PB project → canSeePbProject false', async () => {
    const req = makePbRequest('nate@umn.edu')
    const result = await canSeePbProject(req, env, 'pb-project')
    expect(result).toBe(false)
  })

  it('non-PI caller + non-PB project → canSeePbProject true', async () => {
    const req = makePbRequest('nate@umn.edu')
    const result = await canSeePbProject(req, env, 'mnccore-project')
    expect(result).toBe(true)
  })

  it('PI caller + non-PB project → canSeePbProject true', async () => {
    const req = makePbRequest('ingra107@umn.edu')
    const result = await canSeePbProject(req, env, 'mnccore-project')
    expect(result).toBe(true)
  })

  it('PI caller + unknown project ref → canSeePbProject true (PI pass-through; route handles 404)', async () => {
    // Fix 1: PI/API-key callers get true on unknown refs so the route's own 404
    // logic runs. Previously this was fail-closed, causing a spurious 403 before
    // the 404 was ever reached (soft-deleted PB projects triggered this).
    const req = makePbRequest('ingra107@umn.edu')
    const result = await canSeePbProject(req, env, 'does-not-exist')
    expect(result).toBe(true)
  })

  it('non-PI caller + unknown project ref → canSeePbProject false (fail-closed)', async () => {
    // Non-PI callers remain fail-closed on unknown refs — the ref could be a PB
    // project and we can't prove otherwise without a DB row.
    const req = makePbRequest('nate@umn.edu')
    const result = await canSeePbProject(req, env, 'does-not-exist')
    expect(result).toBe(false)
  })

  it('assertProjectVisible: non-PI + PB project → 403 Response', async () => {
    const req = makePbRequest('nate@umn.edu')
    const response = await assertProjectVisible(req, env, 'pb-project')
    expect(response).not.toBeNull()
    expect(response!.status).toBe(403)
  })

  it('assertProjectVisible: PI + PB project → null (pass)', async () => {
    const req = makePbRequest('ingra107@umn.edu')
    const response = await assertProjectVisible(req, env, 'pb-project')
    expect(response).toBeNull()
  })

  it('assertProjectVisible: non-PI + non-PB project → null (pass)', async () => {
    const req = makePbRequest('nate@umn.edu')
    const response = await assertProjectVisible(req, env, 'mnccore-project')
    expect(response).toBeNull()
  })

  it('assertProjectVisible: PI + unknown ref → null (pass; route handles 404)', async () => {
    // Fix 1: PI callers pass through on unknown refs so the route returns 404,
    // not the spurious 403 that was generated when soft-deleted PB projects
    // returned null from the (now-removed) deleted_at IS NULL filter.
    const req = makePbRequest('ingra107@umn.edu')
    const response = await assertProjectVisible(req, env, 'not-a-project')
    expect(response).toBeNull()
  })

  it('assertProjectVisible: non-PI + unknown ref → 403 (fail-closed)', async () => {
    // Non-PI callers still get 403 on unknown refs — the ref could be a PB project.
    const req = makePbRequest('nate@umn.edu')
    const response = await assertProjectVisible(req, env, 'not-a-project')
    expect(response).not.toBeNull()
    expect(response!.status).toBe(403)
  })
})

// ── A4: safeTaskRow ───────────────────────────────────────────────────────────

describe('safeTaskRow — A4', () => {
  it('strips the notes field from a full task row', () => {
    const row = {
      id: 'task_123',
      title: 'Do something',
      assignee: 'nick-ingraham',
      status: 'todo',
      priority: 'high',
      notes: 'private brain.db content — must not leak',
      description: 'public description',
    }
    const safe = safeTaskRow(row)
    expect(safe).not.toHaveProperty('notes')
    expect(safe.title).toBe('Do something')
    expect(safe.id).toBe('task_123')
    expect(safe.description).toBe('public description')
  })

  it('does not add fields that were absent', () => {
    const row = { id: 'task_456', title: 'Minimal' }
    const safe = safeTaskRow(row)
    expect(Object.keys(safe)).toEqual(['id', 'title'])
  })

  it('strips notes even when present alongside other allowed cols', () => {
    const row = {
      id: 'task_789',
      title: 'Test',
      notes: 'secret',
      completed: 0,
      created_at: '2026-01-01',
    }
    const safe = safeTaskRow(row)
    expect(safe).not.toHaveProperty('notes')
    expect(safe.completed).toBe(0)
    expect(safe.created_at).toBe('2026-01-01')
  })

  it('returns a copy — does not mutate the original', () => {
    const row = { id: 'task_999', notes: 'secret', title: 'Original' }
    const safe = safeTaskRow(row)
    expect(row).toHaveProperty('notes') // original unchanged
    expect(safe).not.toHaveProperty('notes')
  })
})

// ── T2.5: safeRow registry-driven dispatch ───────────────────────────────────

describe('safeRow + TABLE_PRIVATE_COLS — T2.5', () => {
  it('strips tasks.notes when called with table=tasks', () => {
    const row = { id: 'task_1', notes: 'secret', title: 'public' }
    const safe = safeRow('tasks', row)
    expect(safe).not.toHaveProperty('notes')
    expect(safe.title).toBe('public')
  })

  it('returns row unchanged for a table with no private cols (projects)', () => {
    const row = { id: 'proj_1', title: 'My project', category: 'MNCCORE' }
    const safe = safeRow('projects', row)
    expect(safe).toEqual(row)
  })

  it('returns row unchanged for an unknown table', () => {
    const row = { id: 'x_1', foo: 'bar' }
    const safe = safeRow('not_a_table', row)
    expect(safe).toEqual(row)
  })

  it('TABLE_PRIVATE_COLS contains tasks → {notes}', () => {
    expect(TABLE_PRIVATE_COLS.tasks).toBeDefined()
    expect(TABLE_PRIVATE_COLS.tasks.has('notes')).toBe(true)
  })

  it('safeTaskRow remains a backward-compat wrapper around safeRow', () => {
    const row = { id: 'task_compat', notes: 'secret', title: 'x' }
    expect(safeTaskRow(row)).toEqual(safeRow('tasks', row))
  })
})
