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
    // 238 as of 2026-06-11 — Hermes Artifacts v1 (+7): GET /api/artifacts,
    // GET /api/artifacts/:id/activity, GET /api/artifacts/:id, POST /api/artifacts,
    // POST /api/artifacts/:id/revise, POST /api/artifacts/:id/comments,
    // POST /api/artifacts/:id/delete.
    // 240 as of 2026-06-11 — per-viewer seen tracking / new-activity signal
    // (schema v81, +2): POST /api/seen, GET /api/seen/unseen.
    // 241 as of 2026-06-20 — typed-links Phase 2 (+1): GET /api/links (PB sync pull).
    // 243 as of 2026-06-21 — B3 Task 8 (+2): GET /api/tasks/:id/links,
    //   GET /api/projects/:slug/links (frontend-accessible stored-links sub-resources).
    // 244 as of 2026-06-21 — backlog #147 (+1): GET /api/projects/links (bulk).
    // 251 as of 2026-07-04 (backlog #470 — stale-snapshot catch-up, 7 additions
    // accrued across commits that shipped without bumping this count):
    //   e4556df9 feat(api): launch-log routes for @-tag delegation (+4):
    //     GET /api/launch-log, POST /api/launch-log,
    //     POST /api/launch-log/:id/status, POST /api/launch-log/:id/refire
    //   f90cdcf9 feat(launch): Hub-minted opaque-token launch protocol (+1):
    //     POST /api/launch-log/:id/claim
    //   ee0b1a6b feat(launch-log): unscoped PI-gated GET (+1):
    //     GET /api/pb/launch-log/pending
    //   826fd3bf feat(today): durable note capture + @backlog tag (+1):
    //     POST /api/inbox-events (browser single-capture; GET already existed)
    // 252 as of 2026-07-06 — 448b0228 feat(activity): manual delete (+1):
    //   POST /api/activity/:id/delete (shipped without bumping this count;
    //   caught red at HEAD during #485 work).
    // 253 as of 2026-07-07 — 7a3a5a3d T5: POST /api/meetings/:id/meta (+1)
    //   (shipped without bumping this count; caught red at HEAD during the
    //   task-comment paste-to-image work).
    // 250 as of 2026-07-07 — T19 (#547) action_items retirement (-3):
    //   GET /api/action-items, POST /api/action-items,
    //   POST /api/action-items/:id/toggle. All six live readers converted to
    //   the tasks model; the action_items TABLE stays (rollback net).
    // 251 as of 2026-07-09 — activity-provenance readability (+1):
    //   POST /api/activity/:id/edit (author-or-PI comment/note body edit; #93).
    // 252 as of 2026-07-21 — undoable quick-delete (+1):
    //   POST /api/tasks/:id/restore. Symmetric counterpart to :id/delete —
    //   delete was one-way at the HTTP boundary even though the mutation layer
    //   has always supported undelete, which is why the only "undo delete" in
    //   the UI was a 5s deferred commit.
    // 254 as of 2026-07-22 — threaded replies (+2, #98):
    //   GET  /api/activity/:id/replies — the thread under one root, oldest-first.
    //   POST /api/activity/:id/replies — reply to a specific comment.
    // 255 as of 2026-07-22 — dismiss/restore a thread (+1, Hermes wave Phase 2):
    //   POST /api/activity/:id/hide — hide (retain) or restore a thread root +
    //   its replies. Symmetric { hidden: boolean }; author-or-PI.
    // 257 as of 2026-07-22 — the `day` entity feed (+2, Hermes wave Phase 3):
    //   GET  /api/days/:date/activity — a day's conversation roots (Today-bar).
    //   POST /api/days/:date/activity — start/add to a day conversation.
    // 258 as of 2026-07-23 — Hermes wave Phase 10 (+1): GET /api/hermes/day-index
    //   — the PB listener's leak-safe older-day retrieval (requester-scoped,
    //   API-key-only, own-only day roots; see api/routes/hermes.ts header).
    // Adding a route → increment this number. Removing a route → decrement it.
    // This makes route deletion require explicit acknowledgment, preventing
    // silent surface regression (codex final-audit finding #9, 2026-05-28).
    // If you are intentionally adding or removing routes, update this count.
    expect(ROUTE_REGISTRY).toHaveLength(258)
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
