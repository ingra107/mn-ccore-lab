// route-dsl.ts — Z1.1 + Z1.2
//
// Metadata-first route registration.
//
// Replaces raw `app.get/post(...)` calls so every route declares its auth/
// entity contract once. (Row visibility is not route metadata: the viewer-bound
// handle, api/lib/viewer-db.ts, applies it below every route.) ROUTE_REGISTRY drives:
//   - generated contract tests (route-contract.generated.test.ts) — Z1.4
//   - the `SELECT *` lint (Phase Z3.4)
//   - the Hono binding step in api/index.ts
//
// Codex's anti-recommendation (pass 4): never INFER entity from path. The
// `/:id/comments` and `/:id/ics` routes need DB parent lookup — entity must
// be explicit metadata, not string-derived.

import type { Context, Hono } from 'hono'
import { projectAnonResponse, type AnonRowFilter, type AnonShape } from './anon-shape'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type AuthLevel = 'public' | 'authed' | 'pi'

// Canonical entity taxonomy. Add a new value here before declaring the first
// route that maps to it — the generated test (Z1.4) asserts every non-public
// route declares one.
export type EntityName =
  | 'tasks'
  | 'projects'
  | 'artifacts'
  | 'submissions'
  | 'conferences'
  | 'regulatory'
  | 'revisions'
  | 'manuscripts'
  | 'meetings'
  | 'inbox-events'
  | 'project-documents'
  | 'deadline-cascade'
  | 'files'
  | 'notifications'
  | 'questions'
  | 'decisions'
  | 'ideas'
  | 'mentee-milestones'
  | 'grants'
  | 'grant-milestones'
  | 'team'
  | 'comments'
  | 'reactions'
  | 'subtasks'
  | 'activity'
  | 'calendar'
  | 'calendar-feeds'
  | 'paper-links'
  | 'dependencies'
  | 'expertise'
  | 'narratives'
  | 'digest'
  | 'insights'
  | 'analytics'
  | 'sessions'
  | 'pb'
  | 'search'
  | 'settings'
  | 'handoffs'
  | 'ai-requests'
  | 'mutations'
  | 'publications'
  | 'citations'
  | 'contributions'
  | 'file-activity'
  | 'auth'
  | 'health'
  | 'version'
  | 'bug-report'
  | 'lane3'
  | 'impact-trace'
  | 'meeting-cadence'
  | 'grant-intelligence'
  | 'decision-replay'
  | 'proactive-brief'
  | 'links'
  | 'misc'

interface RouteMetadataBase {
  path: string
  entity?: EntityName
  /**
   * True when result rows go through safeRow(table, row) before send.
   * Drives the SELECT * lint (Phase Z3.4): unless this is true OR auth='pi',
   * the lint warns on any SELECT * inside the handler.
   */
  projectsThroughSafeRow?: boolean
  /**
   * Codex pass-4 amendment: routes like /api/regulatory/:id/ics and
   * /api/revisions/:id/comments need a DB parent lookup to map their URL
   * id back to a project_id before the visibility gate can run. Surface
   * that lookup as explicit metadata; the generated test (Z1.4) can then
   * exercise the gate without inferring anything from the path string.
   *
   * The lookup receives the URL :id segment and returns the parent
   * project_id (or null if not project-linked).
   */
  parentLookup?: (id: string) => Promise<{ project_id: string | null }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Promise<Response> | Response
}

/**
 * A public GET is the only kind of route an anonymous caller can read, so it
 * is the only kind that carries an `anonShape`, and it MUST carry one: the
 * allowlist of response fields an anonymous caller sees (anon-shape.ts). A
 * public GET without a shape does not type-check, and defineRoute() throws on
 * it at load time for callers that cast past the type. Every other route has
 * no shape and is never read anonymously when auth is enforced.
 *
 * A public GET whose ROWS (not just columns) are partly private also carries
 * `anonRows`, the predicate a row must pass to reach an anonymous caller
 * (e.g. publications: only status 'Published'). Like anonShape it exists only
 * on a public GET, and a signed-in non-member gets the same cut.
 *
 * `servesNonMembers` (2026-10-08) exists only on a public GET: a signed-in
 * caller with no team_members row gets that handler's own answer instead of
 * the anonShape projection. GET /api/auth/me is the one user; it is how the
 * SPA learns `isMember: false` and shows the members-only page. Its handler
 * owns what a non-member sees, so it must read the caller kind itself.
 */
export type RouteMetadata =
  | (RouteMetadataBase & { method: 'GET'; auth: 'public'; anonShape: AnonShape; anonRows?: AnonRowFilter; servesNonMembers?: true })
  | (RouteMetadataBase & { method: HttpMethod; auth: Exclude<AuthLevel, 'public'>; anonShape?: never; anonRows?: never; servesNonMembers?: never })
  | (RouteMetadataBase & { method: Exclude<HttpMethod, 'GET'>; auth: 'public'; anonShape?: never; anonRows?: never; servesNonMembers?: never })

const VALID_AUTH: ReadonlySet<AuthLevel> = new Set<AuthLevel>([
  'public',
  'authed',
  'pi',
])

export const ROUTE_REGISTRY: RouteMetadata[] = []

export function defineRoute(meta: RouteMetadata): RouteMetadata {
  if (!VALID_AUTH.has(meta.auth)) {
    throw new Error(
      `auth must be one of public|authed|pi, got "${meta.auth}" for ${meta.method} ${meta.path}`,
    )
  }
  // The load-time half of the type rule, for callers that cast past it. Read
  // through the wide shape: the union says these states cannot exist.
  const raw = meta as RouteMetadataBase & { method: HttpMethod; auth: AuthLevel; anonShape?: AnonShape; anonRows?: AnonRowFilter }
  const publicGet = raw.method === 'GET' && raw.auth === 'public'
  if (publicGet && !raw.anonShape) {
    throw new Error(
      `public GET ${raw.path} has no anonShape: name the fields an anonymous caller may see, or make it auth: 'authed'`,
    )
  }
  if (raw.anonShape && !publicGet) {
    throw new Error(
      `${raw.method} ${raw.path} has an anonShape but is not a public GET; only a public GET is read anonymously`,
    )
  }
  if (raw.anonRows && !publicGet) {
    throw new Error(
      `${raw.method} ${raw.path} has anonRows but is not a public GET; only a public GET is read anonymously`,
    )
  }
  if ((raw as { servesNonMembers?: unknown }).servesNonMembers !== undefined && !publicGet) {
    throw new Error(
      `${raw.method} ${raw.path} has servesNonMembers but is not a public GET; every other route is members-only`,
    )
  }
  const dup = ROUTE_REGISTRY.find(
    (r) => r.method === meta.method && r.path === meta.path,
  )
  if (dup) {
    throw new Error(
      `duplicate route registration: ${meta.method} ${meta.path}`,
    )
  }
  ROUTE_REGISTRY.push(meta)
  return meta
}

/**
 * Test-only reset — keeps unit tests isolated. NOT exported from api/helpers.
 * Do NOT call from production code.
 */
export function _resetRegistryForTests(): void {
  ROUTE_REGISTRY.length = 0
}

// Segment rank: a literal segment is more specific than a `:param`, which is
// more specific than a `*` wildcard.
function segmentRank(seg: string): number {
  if (seg.startsWith(':')) return 1
  if (seg.includes('*')) return 2
  return 0
}

function compareSpecificity(a: string, b: string): number {
  const sa = a.split('/')
  const sb = b.split('/')
  const n = Math.min(sa.length, sb.length)
  for (let i = 0; i < n; i++) {
    const d = segmentRank(sa[i]) - segmentRank(sb[i])
    if (d !== 0) return d
  }
  return sa.length - sb.length
}

/**
 * The order bindRegistryToHono binds routes in. Hono runs matching handlers
 * in registration order, so a param route bound before a literal path that it
 * also matches answers for it: GET /api/projects/:id caught
 * /api/projects/links with id='links' because it was defined 1,300 lines
 * earlier. Binding by specificity (at the first segment where two paths
 * differ in kind, literal before `:param` before `*`) makes a literal path
 * win no matter where its defineRoute() sits in the file. The sort is a total
 * order on the rank vectors and Array.prototype.sort is stable, so routes of
 * equal shape keep their file order. Routes that can never match the same
 * request are unaffected by their relative order.
 */
export function bindOrder(routes: readonly RouteMetadata[]): RouteMetadata[] {
  return [...routes].sort((a, b) => compareSpecificity(a.path, b.path))
}

/**
 * Who is calling, as the route gate sees it. api/index.ts decides (it holds
 * the auth middleware's context vars, the team_members lookup and
 * authEnforced()); route-dsl decides what each kind may reach.
 *
 *   - 'member'     a signed-in person whose email is on a team_members row
 *                  (or a PI email), or a service caller (valid PB API key).
 *                  Only in local dev (HUB_LOCAL_DEV=1, auth not enforced) is a
 *                  credential-less caller also a member.
 *   - 'non-member' a signed-in identity (CF Access admits any @umn.edu) with
 *                  no team_members row.
 *   - 'anonymous'  auth is enforced and the caller has neither a session nor
 *                  a valid API key.
 */
export type CallerKind = 'member' | 'non-member' | 'anonymous'

export interface RouteGate {
  // Method syntax on purpose: api/index.ts passes handlers typed for its own
  // Context<AppEnv>, which method parameters accept.
  callerKind(c: Context): CallerKind
  /** The 401 sent to an anonymous caller of a non-public route. */
  deny(c: Context): Response
  /** The 403 sent to a signed-in non-member. */
  denyNonMember(c: Context): Response
}

/**
 * Bind every entry in ROUTE_REGISTRY to a Hono app. Called ONCE from
 * api/index.ts after every defineRoute() in the imported route modules has
 * run (module-load side-effect).
 *
 * The handler is wrapped to receive the raw Hono Context — route modules
 * extract what they need (request, env, params) on the inside. This keeps
 * the registration uniform and leaves the per-handler argument shape as
 * an internal detail of each route module.
 *
 * This wrapper is the access chokepoint for every route, every method. The
 * route Hono actually matched decides access, from its own metadata, so there
 * is no second list of paths to drift from it:
 *
 *   caller      | public GET                     | any other route
 *   ------------+--------------------------------+---------------------------
 *   member      | handler                        | handler
 *   non-member  | anonShape (+ anonRows) cut, or | denyNonMember (403)
 *               | handler if servesNonMembers    |
 *   anonymous   | anonShape (+ anonRows) cut     | deny (401), every method
 *               |                                | (the write gate in
 *               |                                | api/index.ts 401s first)
 *
 * A route is members-only unless it says otherwise, and the only thing it can
 * say is `auth: 'public'` on a GET (with an anonShape). There is no metadata
 * that hands a non-member a full response from any other route. The switch is
 * exhaustive over CallerKind: a new kind is a compile error here until it is
 * placed. Hono also routes HEAD through GET handlers, so HEAD is gated too.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindRegistryToHono(app: Hono<any>, gate: RouteGate): void {
  for (const route of bindOrder(ROUTE_REGISTRY)) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'delete'
    const label = `${route.method} ${route.path}`
    // Only a public GET has an anonShape (the RouteMetadata union), so a
    // non-null shape IS "this route is a public GET".
    const anonShape = route.method === 'GET' && route.auth === 'public' ? route.anonShape : null
    // Rows a logged-out caller or a non-member may not see (e.g. unpublished
    // papers). Applied on BOTH projection paths below.
    const anonRows = route.method === 'GET' && route.auth === 'public' ? route.anonRows : undefined
    const servesNonMembers = route.method === 'GET' && route.auth === 'public' && route.servesNonMembers === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app[method](route.path, async (c: any) => {
      const kind = gate.callerKind(c)
      switch (kind) {
        case 'member':
          return route.handler(c)
        case 'non-member':
          if (!anonShape) return gate.denyNonMember(c)
          if (servesNonMembers) return route.handler(c)
          return projectAnonResponse(await route.handler(c), anonShape, label, anonRows)
        case 'anonymous':
          if (anonShape) return projectAnonResponse(await route.handler(c), anonShape, label, anonRows)
          return gate.deny(c)
        default: {
          const unplaced: never = kind
          throw new Error(`caller kind ${String(unplaced)} has no access rule`)
        }
      }
    })
  }
}
