// route-contract.generated.test.ts — Z1.4
//
// Auto-generated coverage from ROUTE_REGISTRY (populated by every
// defineRoute({...}) side-effect during module load).
//
// REPLACES the manual enumeration in pb-visibility-contract.test.ts for the
// SHAPE assertions (auth-level validity, entity presence, no duplicates,
// floor route count). Adding a new route without auth/entity/visibility
// declared correctly → first run fail.
//
// The per-route four-caller BEHAVIOR matrix (non-PI on PB, non-PI on non-PB,
// PI on PB, API-key on PB) stays in pb-visibility-contract.test.ts because
// each case needs a hand-built stub env. Future Z phase can extend this
// generated file to auto-run the behavior matrix once a stub-env factory
// keyed by entity exists.
//
// Codex pass-4 amendment: routes whose URL id needs a DB parent lookup
// (e.g. /api/regulatory/:id/ics, /api/revisions/:id/comments) declare
// `parentLookup` in their RouteMetadata. The generated behavior matrix
// (future) can consume that hook to discover the project_id without parsing
// the path string.

import { describe, it, expect } from 'vitest'
import { ROUTE_REGISTRY } from '../lib/route-dsl'
// Side-effect import: pulling in api/index.ts triggers every
// defineRoute({...}) call so ROUTE_REGISTRY is populated before the tests
// below execute. (Mirror the import block from api/index.ts implicitly —
// importing the index transitively imports every route module.)
import '../index'

describe('route contract — generated from ROUTE_REGISTRY', () => {
  it('registry is non-empty (sanity check that side-effect imports ran)', () => {
    expect(ROUTE_REGISTRY.length).toBeGreaterThan(0)
  })

  it('every registered route has a valid auth level', () => {
    const valid = new Set(['public', 'authed', 'pi'])
    for (const route of ROUTE_REGISTRY) {
      expect(
        valid.has(route.auth),
        `${route.method} ${route.path} has invalid auth=${route.auth}`,
      ).toBe(true)
    }
  })

  it('every visibility=pb-aware route also has an entity declared', () => {
    for (const route of ROUTE_REGISTRY) {
      if (route.visibility === 'pb-aware') {
        expect(
          route.entity,
          `${route.method} ${route.path} is pb-aware but missing entity metadata`,
        ).toBeDefined()
      }
    }
  })

  it('no two routes share (method, path)', () => {
    const seen = new Map<string, true>()
    for (const route of ROUTE_REGISTRY) {
      const key = `${route.method} ${route.path}`
      expect(seen.has(key), `duplicate route ${key}`).toBe(false)
      seen.set(key, true)
    }
  })

  it('registry has exactly the expected route count', () => {
    // Snapshot: 236 routes as of hub-hardening-2026-05-27 merge (commit 0b5e0b86).
    // 238 as of 2026-06-10 — Bug Squasher added GET /api/bug-reports +
    // POST /api/bug-reports/:id/status (+2).
    // 239 as of 2026-06-10 — Design C (v77) added GET /api/projects/:slug/activity (+1).
    // 231 as of 2026-06-10 — PB Sector Daily Plan retirement (-8): command-center,
    // plan, plan/reorder, plan/promote, plan/history, reflection, pomodoro/start,
    // pomodoro/complete. Superseded by tasks.planned_for/plan_slot/plan_rank.
    // Adding a route → increment this number. Removing a route → decrement it.
    // This makes route deletion require explicit acknowledgment, preventing
    // silent surface regression (codex final-audit finding #9, 2026-05-28).
    // If you are intentionally adding or removing routes, update this count.
    expect(ROUTE_REGISTRY).toHaveLength(231)
  })

  it('every non-public route has either entity or visibility metadata', () => {
    // public routes (marketing pages, /api/health, etc.) intentionally
    // declare neither — they don't gate on PB. authed/pi routes should
    // always carry at least one of (entity, visibility) so the future
    // SELECT * lint (Z3.4) and behavior matrix have something to read.
    for (const route of ROUTE_REGISTRY) {
      if (route.auth === 'public') continue
      expect(
        route.entity !== undefined || route.visibility !== undefined,
        `${route.method} ${route.path} (auth=${route.auth}) has no entity nor visibility metadata`,
      ).toBe(true)
    }
  })

  // Per-route shape assertions — runs over every visibility='pb-aware' entry.
  // For now this is a SHAPE assertion (the handler is callable); the FULL
  // four-caller matrix in pb-visibility-contract.test.ts continues to cover
  // behavior. Future Z phase can extend this once a stub-env factory exists.
  describe('pb-aware routes — handler shape', () => {
    const pbAware = ROUTE_REGISTRY.filter((r) => r.visibility === 'pb-aware')
    for (const route of pbAware) {
      it(`${route.method} ${route.path} — handler is a function`, () => {
        expect(typeof route.handler).toBe('function')
      })
    }
  })
})
