// security-gates.test.ts — guard tests for the Hub pre-adoption security batch
//
// Covers:
//   AM-3 (SEC-T0-1): unauth /api/team omits `email`; unauth /api/meetings
//                    omits `notes`/`agenda`/`decisions`.
//   AM-4 (SEC-T0-2): non-PI /api/search excludes PB-category project hits;
//                    PI search includes them.
//   AM-6 / B11:      non-PI /api/files list on a PB-category project → 403.
//
// These use lightweight SQL-shape stubs (no real D1). Each stub inspects the
// SQL string the handler built and returns canned rows — enough to assert the
// projection/filter the handler applied.

import { describe, it, expect } from 'vitest'
import { handleGetTeam } from './team'
import { handleGetMeetings } from './meetings'
import { handleGetSearch } from './search'
import { handleListFiles } from './uploads'
import type { Env } from '../helpers'

// ── AM-3: /api/team projection ────────────────────────────────────────────────
describe('handleGetTeam — AM-3 public projection', () => {
  function teamEnv(): Env {
    const fullRow = {
      id: 'm1', name: 'Nick', slug: 'nick-ingraham', role: 'PI',
      member_type: 'director', photo_url: null, title: 'Director',
      email: 'ingra107@umn.edu', auto_created: 0,
    }
    return {
      DB: {
        prepare: (sql: string) => ({
          all: async () => {
            // Public path selects an explicit column list (no '*' / no email);
            // authed path selects '*'. Mirror that: only include email when the
            // SQL didn't restrict columns (i.e. SELECT * ...).
            const isStar = /SELECT \* FROM team_members/i.test(sql)
            const row: Record<string, unknown> = { ...fullRow }
            if (!isStar) { delete row.email; delete row.auto_created }
            return { results: [row] }
          },
        }),
      },
    } as unknown as Env
  }

  it('omits email for unauthenticated callers', async () => {
    const res = await handleGetTeam(teamEnv(), false)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).not.toHaveProperty('email')
    expect(body.data[0]).not.toHaveProperty('auto_created')
    expect(body.data[0].name).toBe('Nick') // display fields preserved
  })

  it('includes email for authenticated callers', async () => {
    const res = await handleGetTeam(teamEnv(), true)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).toHaveProperty('email', 'ingra107@umn.edu')
  })
})

// ── AM-3: /api/meetings projection ──────────────────────────────────────────────
describe('handleGetMeetings — AM-3 public projection', () => {
  function meetingsEnv(): Env {
    const fullRow = {
      id: 'mtg1', date: '2026-05-22', title: 'Lab meeting', type: 'biweekly',
      status: 'upcoming', facilitator: 'nick-ingraham',
      agenda: 'SECRET AGENDA', notes: 'PRIVATE NOTES', decisions: 'DECISIONS',
      attendees: 'everyone',
    }
    return {
      DB: {
        prepare: (sql: string) => ({
          all: async () => {
            const isStar = /SELECT \* FROM meetings/i.test(sql)
            const row: Record<string, unknown> = { ...fullRow }
            if (!isStar) { delete row.agenda; delete row.notes; delete row.decisions; delete row.attendees }
            return { results: [row] }
          },
        }),
      },
    } as unknown as Env
  }

  it('omits notes/agenda/decisions for unauthenticated callers', async () => {
    const res = await handleGetMeetings(meetingsEnv(), false)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).not.toHaveProperty('notes')
    expect(body.data[0]).not.toHaveProperty('agenda')
    expect(body.data[0]).not.toHaveProperty('decisions')
    expect(body.data[0].title).toBe('Lab meeting') // public fields preserved
  })

  it('includes notes for authenticated callers', async () => {
    const res = await handleGetMeetings(meetingsEnv(), true)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).toHaveProperty('notes', 'PRIVATE NOTES')
  })
})

// ── AM-4: /api/search PB visibility ─────────────────────────────────────────────
describe('handleGetSearch — AM-4 PB-category visibility', () => {
  // The projects query carries the PB exclusion predicate only for non-PI. The
  // stub returns a PB project hit ONLY when the SQL does NOT contain the
  // exclusion clause (i.e. canSeePb=true → no predicate → row returned).
  function searchEnv(): Env {
    return {
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            all: async () => {
              if (/FROM projects/i.test(sql) && /WHERE \(title LIKE/i.test(sql)) {
                const excludesPb = /Peripheral Brain/.test(sql)
                if (excludesPb) return { results: [] } // non-PI: PB hit filtered out
                return {
                  results: [{
                    slug: 'pb-secret', title: 'PB Secret Project',
                    category: 'Peripheral Brain', stage: 'idea', pi: 'nick-ingraham',
                    description: null, updated_at: '2026-05-01',
                  }],
                }
              }
              return { results: [] } // every other entity query → empty
            },
          }),
        }),
      },
    } as unknown as Env
  }

  it('excludes PB-category project hits for non-PI callers', async () => {
    const url = new URL('https://x/api/search?q=secret')
    const res = await handleGetSearch(url, searchEnv(), false)
    const body = await res.json() as { data: { type: string }[] }
    expect(body.data.filter((r) => r.type === 'project')).toHaveLength(0)
  })

  it('includes PB-category project hits for PI callers', async () => {
    const url = new URL('https://x/api/search?q=secret')
    const res = await handleGetSearch(url, searchEnv(), true)
    const body = await res.json() as { data: { type: string; title: string }[] }
    const projHits = body.data.filter((r) => r.type === 'project')
    expect(projHits).toHaveLength(1)
    expect(projHits[0].title).toBe('PB Secret Project')
  })
})

// ── AM-6 / B11: attachment visibility ───────────────────────────────────────────
describe('handleListFiles — B11 PB-category attachment gate', () => {
  // projects lookup returns a Peripheral Brain project for 'pb-secret'.
  function filesEnv(): Env {
    return {
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (/FROM projects/i.test(sql)) {
                const id = args[0]
                return id === 'pb-secret' ? { category: 'Peripheral Brain' } : { category: 'MNCCORE' }
              }
              return null
            },
            all: async () => ({ results: [{ id: 'f1', filename: 'secret.pdf' }] }),
          }),
        }),
      },
    } as unknown as Env
  }

  it('returns 403 for a non-PI listing files on a PB-category project', async () => {
    const url = new URL('https://x/api/files?entity_type=project&entity_id=pb-secret')
    const res = await handleListFiles(url, filesEnv(), false)
    expect(res.status).toBe(403)
  })

  it('allows a PI to list files on a PB-category project', async () => {
    const url = new URL('https://x/api/files?entity_type=project&entity_id=pb-secret')
    const res = await handleListFiles(url, filesEnv(), true)
    expect(res.status).toBe(200)
  })

  it('allows a non-PI to list files on a non-PB project', async () => {
    const url = new URL('https://x/api/files?entity_type=project&entity_id=mnccore-proj')
    const res = await handleListFiles(url, filesEnv(), false)
    expect(res.status).toBe(200)
  })
})
