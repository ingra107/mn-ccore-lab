// tests/helpers/capture-auth.ts
import type { BrowserContext } from '@playwright/test'

/**
 * Inject a fake `CF_Authorization` JWT cookie so `RequireAuth` treats the
 * Playwright context as signed in.
 *
 * Context — 2026-04-21 flipped `VITE_REQUIRE_AUTH=1`, which makes every
 * `/portal/*` route render a branded sign-in splash when `useAuth()` has
 * no user. Capture runs against an ungated preview deploy hit that
 * splash instead of the Hub. `useAuth()` reads the cookie client-side
 * via `decodeJwtPayload` — no signature verification — so a
 * well-formed but unsigned token is sufficient to flip
 * `isAuthenticated` → true.
 *
 * Backend writes are still gated by real JWKS verification in
 * `api/jwt-verify.ts`. Capture runs are read-only, so that's fine.
 *
 * What this does NOT do (#1364): it never clears Cloudflare Access's EDGE
 * gate on the canonical prod domain. The edge redirects `/portal/*` to the
 * Google sign-in page before any app code runs, so the forged cookie is never
 * read. It only works against a target with no edge gate (a local dev
 * server, or a preview deploy Access does not cover). For the prod alias use `injectRealAuth()` below. The 2026-07-30
 * contrast-test commit (f1ee7a84) already recorded the guard firing on gated
 * prod with this helper alone, so this was never a regression, only a
 * helper used against a target it was not built for.
 *
 * Cookie must not be httpOnly (useAuth reads `document.cookie`).
 */
export async function injectFakeAuth(context: BrowserContext, baseUrl: string) {
  const payload = {
    email: 'ingra107@umn.edu',
    name: 'Nicholas Ingraham',
    iat: Math.floor(Date.now() / 1000),
    exp: 9999999999,
  }
  const b64url = (s: string) =>
    Buffer.from(s)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const token = `${header}.${body}.fake`
  await context.addCookies([
    {
      name: 'CF_Authorization',
      value: token,
      url: baseUrl,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ])
}

/**
 * #896 — a shared fixture for real, backend-authenticated Hub DATA in a
 * Playwright DOM check, not just the frontend chrome `injectFakeAuth()`
 * unlocks.
 *
 * `injectFakeAuth()` above only satisfies `useAuth()`'s client-side, unsigned
 * cookie decode — it does not touch `api/jwt-verify.ts`'s real JWKS check, so
 * every `/api/*` fetch a page makes still 401s and the DOM renders real nav
 * with zero data (confirmed live 2026-07-22, see `agent_knowledge` topic
 * `cf_access_blocks_agent_playwright_prod_auth`).
 *
 * This is NOT a new auth mechanism. It is the exact recipe already proven in
 * `scripts/hub-audit.ts`'s `newDesktopCtx`/`authHeaders` (14 PASS / 0 INFO / 0
 * FAIL reading + writing real prod task rows, commit `ed025704`, 2026-04-25)
 * and `scripts/massive-audit/lib/auth.ts`'s `browserHeaders`, extracted here
 * so `tests/*.spec.ts` specs (the `@playwright/test` suite, not the
 * standalone audit scripts) don't reinvent it. Two independent bypasses
 * stack, matching the two independent gates a real request crosses:
 *   - `CF-Access-Client-Id`/`-Secret` (a real CF Access service token) clears
 *     CLOUDFLARE's own edge redirect on the canonical prod domain. Always
 *     sent; a target with no edge gate ignores it.
 *   - `X-Test-Mode-Key` + `X-Test-User` clears the WORKER's own JWKS check
 *     (`api/helpers.ts:getAuthUser`, still live at HEAD) — the half
 *     `injectFakeAuth()` never reaches, because CF Access service-token JWTs
 *     carry no `email` claim for the JWKS path to read.
 *
 * Same env var names as `scripts/hub-audit.ts` so one env setup serves both
 * the standalone audit script and Playwright specs: `CF_ACCESS_CLIENT_ID`,
 * `CF_ACCESS_CLIENT_SECRET`, `HUB_TEST_MODE_KEY` (or `TEST_MODE_KEY`),
 * `TEST_USER_EMAIL` (defaults to Nick's UMN address, which resolves via
 * `EMAIL_PREFIX_TO_SLUG` to the canonical task-owning slug).
 *
 * Canary + the one command an agent runs for a real authenticated page check:
 * `tests/real-auth-page-check.spec.ts` (usage in its header).
 */

/** The env vars a real session needs, as groups: any one name in a group satisfies it. */
const REAL_SESSION_ENV: string[][] = [
  ['CF_ACCESS_CLIENT_ID'],
  ['CF_ACCESS_CLIENT_SECRET'],
  ['HUB_TEST_MODE_KEY', 'TEST_MODE_KEY'],
]

/**
 * Names of the env vars a real session still lacks; empty when all are set.
 * Both halves are required: the CF Access pair for the edge, the test-mode
 * key for the Worker. The pre-#1364 check looked at the test-mode key only,
 * so a machine missing the CF pair passed the skip-guard and landed on the
 * sign-in page.
 */
export function missingRealSessionEnv(): string[] {
  return REAL_SESSION_ENV.filter((group) => !group.some((name) => process.env[name])).map((group) =>
    group.join(' or '),
  )
}

/** True only when every var a real session needs is set. Use as `test.skip(!hasRealSessionEnv(), realSessionSkipReason())`. */
export function hasRealSessionEnv(): boolean {
  return missingRealSessionEnv().length === 0
}

/** Skip reason naming exactly which vars are missing. */
export function realSessionSkipReason(): string {
  return `real Hub session env missing: ${missingRealSessionEnv().join(', ')} (User-scope env vars; see tests/helpers/capture-auth.ts)`
}

function realAuthHeaders(): Record<string, string> {
  return {
    'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID!,
    'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
    'X-Test-Mode-Key': (process.env.HUB_TEST_MODE_KEY || process.env.TEST_MODE_KEY)!,
    'X-Test-User': process.env.TEST_USER_EMAIL || 'ingra107@umn.edu',
  }
}

/**
 * Full real-session setup for a spec that needs the prod alias or real DATA
 * in the DOM: frontend chrome (`injectFakeAuth`) plus the edge and backend
 * headers on every request the context makes.
 *
 * THROWS when any var is missing. It used to warn and return a context with
 * frontend auth only, which on prod renders the sign-in page and on a
 * preview renders chrome with zero data: a half-authenticated context that
 * looked like a working one. Callers `test.skip(!hasRealSessionEnv(),
 * realSessionSkipReason())` first.
 *
 * READ-ONLY by construction: this session reads and could write real prod
 * rows, so every non-GET `/api/*` request the context's pages send is
 * aborted before it leaves the browser (merely opening Today POSTs
 * `/api/seen`). The returned array lists what was blocked. A page-level
 * `page.route()` still runs first, so a spec can fulfil a request itself.
 * Deliberate prod writes belong in `scripts/hub-audit.ts`, not here.
 */
export async function injectRealAuth(context: BrowserContext, baseUrl: string): Promise<string[]> {
  const missing = missingRealSessionEnv()
  if (missing.length) {
    throw new Error(`injectRealAuth: ${realSessionSkipReason()}`)
  }
  await injectFakeAuth(context, baseUrl)
  await context.setExtraHTTPHeaders(realAuthHeaders())
  const blockedWrites: string[] = []
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue()
    blockedWrites.push(`${req.method()} ${new URL(req.url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  return blockedWrites
}
