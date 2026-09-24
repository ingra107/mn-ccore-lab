/**
 * Real authenticated page check against the prod alias (#896, #1364).
 *
 * The one command a dispatched agent runs to see a Hub page the way Nick
 * sees it, with real data, read-only:
 *
 *   npx playwright test tests/real-auth-page-check.spec.ts --workers=1 --reporter=list
 *
 * Optional env:
 *   HUB_CHECK_PATH       page to open (default /portal/dashboard)
 *   PLAYWRIGHT_BASE_URL  target (default https://mn-ccore-lab.pages.dev)
 *
 * Needs CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET and HUB_TEST_MODE_KEY
 * (User-scope env vars on both laptops). Unlike the specs that skip without
 * them, this one FAILS: it is the canary for the fixture itself, so a missing
 * var must never read as a pass.
 *
 * Read-only by construction: injectRealAuth aborts every non-GET request to
 * /api/* before it leaves the browser and this spec lists them, so nothing
 * it opens can write prod data.
 *
 * Screenshot: review/real-auth-check.png. For a page-specific assertion,
 * copy this file; injectRealAuth keeps the copy read-only.
 */
import { test, expect } from '@playwright/test'
import { injectRealAuth, missingRealSessionEnv } from './helpers/capture-auth'
import { P } from './helpers/paths'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev'
const PATH = process.env.HUB_CHECK_PATH || P.dashboard

test('real-auth page check: edge + Worker auth, real data, read-only', async ({ page, context }) => {
  expect(missingRealSessionEnv(), 'real Hub session env vars missing').toEqual([])
  // injectRealAuth aborts every non-GET /api/* call and returns the list.
  const blockedWrites = await injectRealAuth(context, BASE)

  const apiDenied: string[] = []
  page.on('response', (res) => {
    const url = new URL(res.url())
    if (url.pathname.startsWith('/api/') && (res.status() === 401 || res.status() === 403)) {
      apiDenied.push(`${res.status()} ${url.pathname}`)
    }
  })

  // Backend half: the Worker must accept the session and return real rows.
  const api = await context.request.get(`${BASE}/api/tasks?limit=1`)
  expect(api.status(), '/api/tasks status with the real-auth headers').toBe(200)
  const body = await api.json()
  expect(Array.isArray(body.data) && body.data.length > 0, '/api/tasks returned no rows').toBe(true)

  // Edge + frontend half: the page itself, not the Google sign-in page.
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'load', timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  expect(new URL(page.url()).hostname, 'redirected off the Hub (CF Access edge gate)').toBe(new URL(BASE).hostname)
  const h1 = (await page.locator('h1').first().textContent({ timeout: 10000 }).catch(() => null))?.trim() ?? null
  expect(h1, 'landed on the sign-in page').not.toBe('Sign in')

  await page.screenshot({ path: 'review/real-auth-check.png', fullPage: false })
  console.log(`real-auth check: ${BASE}${PATH} h1=${JSON.stringify(h1)}`)
  console.log(`blocked non-GET /api calls: ${blockedWrites.length ? blockedWrites.join(', ') : 'none'}`)
  expect(apiDenied, '/api/* calls the page made that the Worker refused').toEqual([])
})
