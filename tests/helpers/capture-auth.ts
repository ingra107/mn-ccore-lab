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
 *     CLOUDFLARE's own edge redirect on the canonical prod domain. Omit when
 *     already pointed at an ungated preview-hash deploy.
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
 */
export function realAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const cfId = process.env.CF_ACCESS_CLIENT_ID
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET
  if (cfId && cfSecret) {
    headers['CF-Access-Client-Id'] = cfId
    headers['CF-Access-Client-Secret'] = cfSecret
  }
  const testModeKey = process.env.HUB_TEST_MODE_KEY || process.env.TEST_MODE_KEY
  if (testModeKey) {
    headers['X-Test-Mode-Key'] = testModeKey
    headers['X-Test-User'] = process.env.TEST_USER_EMAIL || 'ingra107@umn.edu'
  }
  return headers
}

/**
 * True only when the backend bypass is available — the piece that actually
 * unlocks real DATA, not just the Cloudflare edge gate. `HUB_TEST_MODE_KEY`
 * is a Cloudflare Worker secret, so this is false in most environments by
 * design; callers should `test.skip(!hasRealSessionEnv(), ...)` rather than
 * fail when it's absent (same honesty pattern as `hub-audit.ts`'s own
 * `!! HUB_TEST_MODE_KEY not set` warning).
 */
export function hasRealSessionEnv(): boolean {
  return Boolean(process.env.HUB_TEST_MODE_KEY || process.env.TEST_MODE_KEY)
}

/**
 * Full real-session setup for a spec that needs authenticated prod (or
 * preview) DATA visible in the DOM: frontend chrome (`injectFakeAuth`) plus
 * the backend bypass headers (`realAuthHeaders`) applied to every request
 * the context's pages make. Check `hasRealSessionEnv()` first and
 * `test.skip()` when false — this function still runs without it (frontend
 * chrome only, same as calling `injectFakeAuth` alone) so it degrades rather
 * than throws.
 */
export async function injectRealAuth(context: BrowserContext, baseUrl: string) {
  await injectFakeAuth(context, baseUrl)
  const headers = realAuthHeaders()
  if (!headers['X-Test-Mode-Key']) {
    console.warn(
      'injectRealAuth: HUB_TEST_MODE_KEY/TEST_MODE_KEY not set — context has ' +
        'frontend/edge auth only, backend API calls will still 401. Set the ' +
        'env var (see realAuthHeaders() docstring) or test.skip().',
    )
  }
  await context.setExtraHTTPHeaders(headers)
}
