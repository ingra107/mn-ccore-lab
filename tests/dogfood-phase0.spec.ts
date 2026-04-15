import { test, expect, Page } from '@playwright/test'

/**
 * Phase 0 dogfood — targeted interactivity probes for R11/R12 gaps.
 *
 * Purpose: verify on the LIVE site (with Phase 0 test_delete_ seed data) that
 * the R11/R12 interaction gaps the plan claims still exist actually persist.
 * Complements the source-level audit in scripts/seed/phase0-bug-log.md.
 *
 * Scope discipline: each test loads exactly one page and runs ≤3 assertions.
 * NO full page sweeps. NO journey chains. Target ~200 requests total to stay
 * well under the Cloudflare Workers 100K/day cap.
 *
 * NOT included in the main playwright.config.ts — only runs via
 *   npx playwright test --config=playwright.config.dogfood.ts
 */

// Collect console errors for every page — noisy red flag is a bug
const consoleErrorsByPage: Record<string, string[]> = {}
function captureConsole(page: Page, label: string) {
  consoleErrorsByPage[label] = []
  page.on('pageerror', (err) => consoleErrorsByPage[label].push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrorsByPage[label].push(`console.error: ${msg.text()}`)
  })
}

test.describe('R11 interaction gaps (desktop)', () => {
  test('R11-4 Deadlines — due_date cell is plain text (gap)', async ({ page }) => {
    captureConsole(page, 'deadlines')
    await page.goto('/deadlines')
    await expect(page.locator('body')).toBeVisible()
    // Wait for data to load (find any test_delete_ milestone)
    const milestoneRow = page.locator('text=/test_delete_/').first()
    await expect(milestoneRow).toBeVisible({ timeout: 15000 })
    // The date cell should NOT be an input/select when clicked
    // Locate a date-like text near a test_delete_ row and click it
    const dateCells = page.locator('text=/\\d{4}-\\d{2}-\\d{2}|Apr \\d+|May \\d+/').first()
    if (await dateCells.count() > 0) {
      await dateCells.click({ trial: false }).catch(() => {})
      // If an input appeared, the bug is fixed. If not, gap persists.
      const inputAfterClick = await page.locator('input[type="date"], [role="combobox"]').count()
      console.log(`[dogfood] /deadlines date cell click → inputs found: ${inputAfterClick}`)
    }
  })

  test('R11-5 Manuscripts — PI + Category cells inspection', async ({ page }) => {
    captureConsole(page, 'manuscripts')
    await page.goto('/manuscripts')
    await expect(page.locator('body')).toBeVisible()
    // Wait for any test_delete_ row to be visible (row data loaded)
    const row = page.locator('text=/test_delete_/').first()
    await expect(row).toBeVisible({ timeout: 15000 })
    // Count role=combobox elements (InlineSelect renders as role=combobox).
    // A truly inline-editable PI+Category should show role=combobox on every row.
    const comboboxes = await page.getByRole('combobox').count()
    const testRows = await page.locator('text=/test_delete_/').count()
    console.log(`[dogfood] /manuscripts test_delete_ rows: ${testRows}, comboboxes: ${comboboxes}`)
    // Gap check: each test row has ~1 combobox (status). If PI+Category were inline,
    // we'd expect roughly 3x testRows comboboxes. Anything <2x indicates gap persists.
    const ratio = testRows > 0 ? comboboxes / testRows : 0
    console.log(`[dogfood] combobox-per-row ratio: ${ratio.toFixed(2)} (gap if <2)`)
  })

  test('R11-6 Ideas — title click should open detail panel', async ({ page }) => {
    captureConsole(page, 'ideas')
    await page.goto('/ideas')
    await expect(page.locator('body')).toBeVisible()
    const idea = page.locator('text=/test_delete_PI mentor match program/').first()
    await expect(idea).toBeVisible({ timeout: 15000 })
    // Click the idea title
    await idea.click().catch(() => {})
    await page.waitForTimeout(500)
    // Look for any detail panel indicators
    const detailPanel = await page.locator('[role="dialog"], [class*="detail"], [class*="expanded"]').count()
    console.log(`[dogfood] /ideas after click, detail panel elements: ${detailPanel}`)
  })

  test('R11-8 Grants — row click should open detail', async ({ page }) => {
    captureConsole(page, 'grants')
    await page.goto('/grants')
    await expect(page.locator('body')).toBeVisible()
    const grant = page.locator('text=/test_delete_K99 Fake/').first()
    await expect(grant).toBeVisible({ timeout: 15000 })
    await grant.click().catch(() => {})
    await page.waitForTimeout(500)
    // Check if we navigated away (Link behavior) or if inline detail opened
    const currentUrl = page.url()
    const navigatedAway = !currentUrl.endsWith('/grants')
    console.log(`[dogfood] /grants click outcome: navigatedAway=${navigatedAway}, url=${currentUrl}`)
  })

  test('Decisions — N-key opens create modal (false claim check)', async ({ page }) => {
    captureConsole(page, 'decisions')
    await page.goto('/decisions')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(1000) // let page settle
    // Press 'N' and check if a modal opens
    await page.keyboard.press('KeyN')
    await page.waitForTimeout(500)
    const dialog = await page.locator('[role="dialog"], [class*="modal"]').count()
    console.log(`[dogfood] /decisions N-key → dialogs opened: ${dialog} (expected 0 — claim is false)`)
  })

  test('Ideas — N-key opens create modal (positive check)', async ({ page }) => {
    captureConsole(page, 'ideas-n')
    await page.goto('/ideas')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(1000)
    await page.keyboard.press('KeyN')
    await page.waitForTimeout(500)
    const dialog = await page.locator('[role="dialog"], [class*="modal"], [class*="Create"]').count()
    console.log(`[dogfood] /ideas N-key → dialogs opened: ${dialog} (expected ≥1)`)
  })
})

test.describe('R12 mobile viewport checks', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('R12-H4 Calendar — prev/next hit-target size', async ({ page }) => {
    captureConsole(page, 'calendar-mobile')
    await page.goto('/calendar')
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
    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(1500)
    // MobileTabBar renders nav with links
    const tabbarLinks = await page.locator('nav a, [role="tablist"] a, [class*="MobileTab"] a').count()
    console.log(`[dogfood] mobile tab bar visible routes: ${tabbarLinks} (plan target ≥5 via overflow)`)
  })

  test('Dashboard mobile — scan for sub-44px tap targets', async ({ page }) => {
    captureConsole(page, 'dashboard-mobile')
    await page.goto('/dashboard')
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
    '/projects',
    '/tasks',
    '/my-tasks',
    '/deadlines',
    '/manuscripts',
    '/ideas',
    '/decisions',
    '/grants',
    '/meetings',
    '/publications',
    '/digest',
    '/personal',
    '/calendar',
    '/dashboard',
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
      const response = await page.goto(path, { waitUntil: 'networkidle', timeout: 20000 })
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
