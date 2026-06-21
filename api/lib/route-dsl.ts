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

import type { Hono } from 'hono'

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
  | 'email-drafts'
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

export interface RouteMetadata {
  method: HttpMethod
  path: string
  auth: AuthLevel
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

/**
 * Bind every entry in ROUTE_REGISTRY to a Hono app. Called ONCE from
 * api/index.ts after every defineRoute() in the imported route modules has
 * run (module-load side-effect).
 *
 * The handler is wrapped to receive the raw Hono Context — route modules
 * extract what they need (request, env, params) on the inside. This keeps
 * the registration uniform and leaves the per-handler argument shape as
 * an internal detail of each route module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindRegistryToHono(app: Hono<any>): void {
  for (const route of ROUTE_REGISTRY) {
    const method = route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'delete'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app[method](route.path, (c: any) => route.handler(c))
  }
}
