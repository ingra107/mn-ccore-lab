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
