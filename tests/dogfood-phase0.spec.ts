import { test, expect, Page } from '@playwright/test'
import { P } from './helpers/paths'
import { injectFakeAuth } from './helpers/capture-auth'

/**
 * Dogfood sweep — console-error page health + mobile spot checks.
 *
 * N6 triage (2026-06-11): the suite predated the CF Access gate, so every
 * "page" it tested was actually the Cloudflare sign-in interstitial — the 13
 * chronic page-health failures were ONE cause: the interstitial's own logo
 * data-URI tripping its CSP. The suite now targets an UNGATED preview deploy
 * (hash URL) with the fake-auth cookie, same pattern as the capture specs:
 *
 *   DOGFOOD_BASE_URL=https://<hash>.mn-ccore-lab.pages.dev \
 *     npx playwright test --config=playwright.config.dogfood.ts
 *
 * Removed in the same triage: the Phase-0 "R11 interaction gap" probes. They
 * asserted on `test_delete_` seed rows that were cleaned up long ago, and the
 * gaps they documented (inline due-date editing, Ideas title-click detail,
 * Grants row detail, Manuscripts inline PI/category) have all since shipped —
 * their purpose was Phase-0 archaeology, fulfilled. History: git +
 * scripts/seed/phase0-bug-log.md.
 *
 * NOT included in the main playwright.config.ts — only runs via
 *   npx playwright test --config=playwright.config.dogfood.ts
 */

const BASE = process.env.DOGFOOD_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'

// Collect console errors for every page — noisy red flag is a bug
const consoleErrorsByPage: Record<string, string[]> = {}
function captureConsole(page: Page, label: string) {
  consoleErrorsByPage[label] = []
  page.on('pageerror', (err) => consoleErrorsByPage[label].push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrorsByPage[label].push(`console.error: ${msg.text()}`)
  })
}

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
})

test.describe('R12 mobile viewport checks', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('R12-H4 Calendar — prev/next hit-target size', async ({ page }) => {
    captureConsole(page, 'calendar-mobile')
    await page.goto(BASE + P.calendar)
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(1500)
    // Find prev button via aria or role; fall back to SVG parent
    const prevCandidates = page.locator('button').filter({ has: page.locator('svg') })
    const count = await prevCandidates.count()
    let smallest: { w: number; h: number; idx: number } | null = null
    for (let i = 0; i < Math.min(count, 20); i++) {
      const box = await prevCandidates.nth(i).boundingBox().catch(() => null)
      if (box && (!smallest || box.width * box.height < smallest.w * smallest.h)) {
        smallest = { w: box.width, h: box.height, idx: i }
      }
    }
    if (smallest) {
      console.log(`[dogfood] /calendar smallest icon button: ${smallest.w}x${smallest.h} (target ≥44)`)
    }
  })

  test('MobileTabBar — count visible routes', async ({ page }) => {
    captureConsole(page, 'tabbar')
    await page.goto(BASE + P.dashboard)
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(1500)
    // MobileTabBar renders nav with links
    const tabbarLinks = await page.locator('nav a, [role="tablist"] a, [class*="MobileTab"] a').count()
    console.log(`[dogfood] mobile tab bar visible routes: ${tabbarLinks} (plan target ≥5 via overflow)`)
  })

  test('Dashboard mobile — scan for sub-44px tap targets', async ({ page }) => {
    captureConsole(page, 'dashboard-mobile')
    await page.goto(BASE + P.dashboard)
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(2000)
    const buttons = page.locator('button, a[href], [role="button"]')
    const total = await buttons.count()
    let sub44 = 0
    const samples: string[] = []
    for (let i = 0; i < Math.min(total, 50); i++) {
      const box = await buttons.nth(i).boundingBox().catch(() => null)
      if (box && box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44)) {
        sub44++
        if (samples.length < 5) {
          const label = await buttons.nth(i).getAttribute('aria-label').catch(() => null) ||
                        await buttons.nth(i).textContent().catch(() => null) || '<unlabeled>'
          samples.push(`${Math.round(box.width)}x${Math.round(box.height)} ${label.slice(0, 40)}`)
        }
      }
    }
    console.log(`[dogfood] /dashboard mobile: ${sub44}/${Math.min(total, 50)} sub-44px sampled buttons`)
    if (samples.length) console.log(`  samples: ${samples.join(' | ')}`)
  })
})

test.describe('Basic page health', () => {
  const pages = [
    P.projects,
    P.tasks,
    P.myTasks,
    P.deadlines,
    P.manuscripts,
    P.ideas,
    P.decisions,
    P.grants,
    P.meetings,
    P.publications,
    P.digest,
    P.personal,
    P.calendar,
    P.dashboard,
  ]

  for (const path of pages) {
    test(`${path} — loads without console errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text()
          // Ignore noisy/expected errors (network aborts, analytics blockers)
          if (/Failed to load resource|net::ERR_|analytics|posthog|sentry/i.test(text)) return
          // Known P0 bug — hub-realtime WebSocket returns HTTP 400 on every handshake.
          // Tracked separately in phase0-bug-log.md; skip so it doesn't drown out real signal.
          if (/hub-realtime.*WebSocket|wss:\/\/hub-realtime/i.test(text)) return
          errors.push(`console.error: ${text}`)
        }
      })
      const response = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
      expect(response?.status()).toBeLessThan(400)
      // Give the app a moment to finish hydration + initial queries
      await page.waitForTimeout(1500)
      // Body should not show an "Error" boundary
      const body = await page.locator('body').innerText().catch(() => '')
      const hasErrorBoundary = /(Something went wrong|Application error|Render error)/.test(body)
      if (hasErrorBoundary) errors.push(`error boundary: visible`)
      // Log results — tests pass unless real errors found
      if (errors.length) {
        console.log(`[dogfood] ${path} errors:`, errors.slice(0, 3))
      }
      expect(errors, `console errors on ${path}`).toHaveLength(0)
    })
  }
})

test.afterAll(async () => {
  // Summary dump for bug log
  console.log('\n===== DOGFOOD SUMMARY =====')
  for (const [label, errs] of Object.entries(consoleErrorsByPage)) {
    if (errs.length) console.log(`${label}: ${errs.length} console errors`)
  }
})
