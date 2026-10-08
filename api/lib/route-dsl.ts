// route-dsl.ts — Z1.1 + Z1.2
//
// Metadata-first route registration.
//
// Replaces raw `app.get/post(...)` calls so every route declares its auth/
// visibility/entity contract once. ROUTE_REGISTRY drives:
//   - generated contract tests (route-contract.generated.test.ts) — Z1.4
//   - the `SELECT *` lint (Phase Z3.4)
//   - the Hono binding step in api/index.ts
//
// Codex's anti-recommendation (pass 4): never INFER entity from path. The
// `/:id/comments` and `/:id/ics` routes need DB parent lookup — entity must
// be explicit metadata, not string-derived.

import type { Context, Hono } from 'hono'
import { projectAnonResponse, type AnonShape } from './anon-shape'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type AuthLevel = 'public' | 'authed' | 'pi'

// Canonical entity taxonomy. Add a new value here before declaring the first
// route that maps to it — the generated test (Z1.4) asserts every
// visibility='pb-aware' route has a known entity.
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

export type VisibilityPolicy = 'pb-aware' | 'na'

interface RouteMetadataBase {
  path: string
  entity?: EntityName
  visibility?: VisibilityPolicy
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
 */
export type RouteMetadata =
  | (RouteMetadataBase & { method: 'GET'; auth: 'public'; anonShape: AnonShape })
  | (RouteMetadataBase & { method: HttpMethod; auth: Exclude<AuthLevel, 'public'>; anonShape?: never })
  | (RouteMetadataBase & { method: Exclude<HttpMethod, 'GET'>; auth: 'public'; anonShape?: never })

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
  const raw = meta as RouteMetadataBase & { method: HttpMethod; auth: AuthLevel; anonShape?: AnonShape }
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
 * How bindRegistryToHono tells an anonymous read from an identified one.
 * api/index.ts owns the answer (it holds the auth middleware's context vars
 * and REQUIRE_AUTH); route-dsl owns what happens next.
 */
export interface ReadGate {
  // Method syntax on purpose: api/index.ts passes handlers typed for its own
  // Context<AppEnv>, which method parameters accept.
  /** True when auth is enforced and the caller has neither a session nor a valid API key. */
  isAnonymous(c: Context): boolean
  /** The 401 sent to an anonymous caller of a non-public GET. */
  deny(c: Context): Response
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
 * GET routes are the read chokepoint. The route Hono actually matched decides
 * access, from its own metadata, so there is no second list of public paths
 * to drift from it. For an anonymous caller (gate.isAnonymous):
 *   - auth 'authed' | 'pi'  -> gate.deny(c), the handler never runs;
 *   - auth 'public'         -> the handler runs and its response is projected
 *                              through the route's anonShape (allowlist).
 * Identified callers (session or API key) get the handler's response as is.
 * Hono also routes HEAD through these GET handlers, so HEAD is gated too.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindRegistryToHono(app: Hono<any>, gate: ReadGate): void {
  for (const route of bindOrder(ROUTE_REGISTRY)) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'delete'
    if (route.method !== 'GET') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app[method](route.path, (c: any) => route.handler(c))
      continue
    }
    const label = `GET ${route.path}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.get(route.path, async (c: any) => {
      if (!gate.isAnonymous(c)) return route.handler(c)
      if (route.auth !== 'public') return gate.deny(c)
      return projectAnonResponse(await route.handler(c), route.anonShape, label)
    })
  }
}
