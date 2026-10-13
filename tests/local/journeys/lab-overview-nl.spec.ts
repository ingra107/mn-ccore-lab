/**
 * Wave 3 new look, Lab Overview option A (four cards in a row, one hero number each).
 * Run: node scripts/run-journey-spec.mjs --gate tests/local/journeys/lab-overview-nl.spec.ts
 * Screenshots: review/nl-overview/ (gitignored)
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const PI = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/nl-overview'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

async function visit(page: Page, theme: string, w: number) {
  await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
  await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 })
  await page.goto('/portal/overview', { waitUntil: 'load' })
  await expect(page.getByTestId('dashboard-status-line')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
}

for (const theme of ['light', 'dark'] as const) {
  for (const w of [1440, 375] as const) {
    test(`overview ${theme} ${w}`, async ({ page }) => {
      await visit(page, theme, w)
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
      if (w === 1440) {
        // The four lead cards sit in one row at one height, each with a hero number.
        const lead = ['action-board', 'upcoming', 'project-health', 'pipeline']
        const boxes = await Promise.all(lead.map((id) => page.getByTestId(`card-${id}`).boundingBox()))
        console.log('LEAD', JSON.stringify(boxes.map((b) => b && { x: Math.round(b.x), y: Math.round(b.y), h: Math.round(b.height) })))
        for (const b of boxes) expect(b).not.toBeNull()
        expect(new Set(boxes.map((b) => Math.round(b!.y))).size, 'one row').toBe(1)
        expect(Math.max(...boxes.map((b) => b!.height)) - Math.min(...boxes.map((b) => b!.height)), 'equal height').toBeLessThanOrEqual(2)
        for (const id of lead) await expect(page.getByTestId(`card-${id}`).locator('.bento-hero .tk-v')).toBeVisible()
      }
      await page.screenshot({ path: `${SHOTS}/overview-${w}-${theme}.png`, fullPage: true })
    })
  }
}
