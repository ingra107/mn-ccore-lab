// route-contract.generated.test.ts — Z1.4
//
// Auto-generated coverage from ROUTE_REGISTRY (populated by every
// defineRoute({...}) side-effect during module load).
//
// Shape assertions only (auth-level validity, entity presence, no
// duplicates, floor route count). Row visibility is not route metadata: the
// viewer-bound handle (api/lib/viewer-db.ts) applies it under every route,
// and viewer-sweep.test.ts drives every route at a hidden row.
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
    // 262 as of 2026-07-23 — Artifacts Reference Gallery (+4, schema-v104):
    //   GET    /api/artifacts/gallery      — curated tagged artifacts, newest-first.
    //   GET    /api/artifact-tags          — distinct tags + counts.
    //   POST   /api/artifacts/:id/tags     — add a collection tag (authed team).
    //   DELETE /api/artifacts/:id/tags/:tag — remove a collection tag (authed team).
    // 263 as of 2026-07-24 — artifact body search (+1, backlog #913):
    //   GET    /api/artifacts/search?q=   — ids of shelved artifacts whose title
    //                                       or body matches; ids only, never bodies.
    // 265 as of 2026-08-01 — member-curated featured publications (+2, PB #906,
    //   schema-v106):
    //   GET /api/team/:slug/featured-publications — public; the member's own
    //       Top-10, in the member's own order.
    //   PUT /api/team/:slug/featured-publications — ordered replace-set, max 10,
    //       member-or-PI. This is the FIRST PUT in the registry — every other
    //       write is a POST. The write-auth gate (index.ts step 5,
    //       WRITE_AUTH_METHODS) and corsHeadersFor both already name PUT, so
    //       nothing had to change for it; it just now has a live caller.
    // 267 as of 2026-09-08 — the `meeting` entity feed (+2, #124):
    //   GET  /api/meetings/:id/activity — a meeting's conversation roots.
    //   POST /api/meetings/:id/activity — say something on a meeting (@hermes
    //        included; the ask carries the meeting's agenda, notes, decisions,
    //        tasks and the path to the archived transcript).
    // 271 as of 2026-09-16 — a project's published output (+4, #129):
    //   GET  /api/projects/:slug/publications — the papers a project produced.
    //   POST /api/projects/:slug/publications — link { publication_id, role }.
    //   POST /api/projects/:slug/publications/:pubId/delete — unlink.
    //   GET  /api/project-publications — every link, for the row chips.
    // 272 as of 2026-09-24 — archive/restore a project link (+1, PB #2089):
    //   POST /api/links/:id/role — { role: 'key' | 'archive' }.
    // 269 as of 2026-09-30 — the email-drafts mirror retired (-3, PB #8836):
    //   GET /api/email-drafts, GET /api/email-drafts/pending,
    //   POST /api/email-drafts/sync-bulk. Its only reader, a hidden card,
    //   never showed a draft.
    // 270 as of 2026-10-05 — Prep seeds attendees from the calendar (+1, PB #2225):
    //   POST /api/meetings/prep-from-event — { uid, start_at, day }.
    // 267 as of 2026-10-07 — the PB relay web UI retired (-3): GET and POST
    //   /api/pb/relay, POST /api/pb/relay/:index/complete. Their only client,
    //   RelayCard, lost its page in the 2026-06-10 PB Sector retirement; PB had
    //   no caller.
    // 268 as of 2026-10-08 — GET /api/today/mentees (+1): Today's MENTEES row,
    //   which read the viewer's own task list and so never matched a mentee.
    // 269 as of 2026-10-08 — POST /api/team (+1): a PI adds a member. Sign-in
    //   no longer creates team_members rows, so this is how an email joins.
    // 270 as of 2026-10-08 — GET /api/realtime/ticket (+1): the single-use
    //   ticket hub-realtime now requires before it accepts a WebSocket.
    // Adding a route → increment this number. Removing a route → decrement it.
    // This makes route deletion require explicit acknowledgment, preventing
    // silent surface regression (codex final-audit finding #9, 2026-05-28).
    // If you are intentionally adding or removing routes, update this count.
    // 259 as of 2026-10-09 — dead-route sweep (-15): GET /api/team/:slug/cv-data,
    //   /api/team/by-expertise, /api/graph/collaboration, /api/papers/by-project,
    //   /api/expertise/suggest, /api/revisions/active, /api/tasks/:id/updates;
    //   POST /api/artifacts/:id/delete, /api/deadline-dependencies (+ :id/delete),
    //   /api/decisions/:id/update, /api/digest-email (+ /send),
    //   /api/mentee-milestones/:id/complete, /api/regulatory/:id/renew.
    //   No client in any repo called them.
    // 262 as of 2026-10-09 — a person's pinned projects (+3, nav redesign):
    //   GET /api/pins, POST /api/pins, DELETE /api/pins/:project. Stored in
    //   the existing watchlist table (schema-v49); api/routes/pins.ts.
    // 267 as of 2026-10-09 — meeting access, schema-v122 (+5): GET
    //   /api/meetings/:id/access (PB key, Hermes), POST /api/meetings/:id/projects,
    //   DELETE /api/meetings/:id/projects/:projectId, GET + POST /api/thread-seen.
    expect(ROUTE_REGISTRY).toHaveLength(267)
  })

  // cv-data returned team_members.email for mentee rows to any signed-in user
  // and nothing called it. A route that does not exist cannot leak, so the
  // fix is the absence: this pins it. Re-adding a route here needs a caller.
  it('the dead routes stay deleted', () => {
    const gone = [
      'GET /api/team/:slug/cv-data', 'GET /api/team/by-expertise', 'GET /api/graph/collaboration',
      'GET /api/papers/by-project', 'GET /api/expertise/suggest', 'GET /api/revisions/active',
      'GET /api/tasks/:id/updates', 'POST /api/artifacts/:id/delete', 'POST /api/deadline-dependencies',
      'POST /api/deadline-dependencies/:id/delete', 'POST /api/decisions/:id/update',
      'POST /api/digest-email', 'POST /api/digest-email/send',
      'POST /api/mentee-milestones/:id/complete', 'POST /api/regulatory/:id/renew',
    ]
    const have = new Set(ROUTE_REGISTRY.map((r) => `${r.method} ${r.path}`))
    for (const key of gone) expect(have.has(key), `${key} is back`).toBe(false)
    // The POST sibling of the deleted GET stays.
    expect(have.has('POST /api/tasks/:id/updates')).toBe(true)
  })

  it('every non-public route has entity metadata', () => {
    // public routes (marketing pages, /api/health, etc.) may declare none.
    // authed/pi routes carry an entity so the SELECT * lint (Z3.4) has
    // something to read. (Row visibility is not route metadata: the
    // viewer-bound handle applies it, api/lib/viewer-db.ts.)
    for (const route of ROUTE_REGISTRY) {
      if (route.auth === 'public') continue
      expect(
        route.entity !== undefined,
        `${route.method} ${route.path} (auth=${route.auth}) has no entity metadata`,
      ).toBe(true)
    }
  })
})
