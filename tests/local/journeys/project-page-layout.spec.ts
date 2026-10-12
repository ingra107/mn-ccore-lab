/**
 * The project page layout (Nick, 2026-10-12): a compact header, ONE row that
 * holds the products and the stats line (above the tabs, so every tab shows it),
 * then the tabs and a main column, and a sticky right rail like Today's.
 * Nick: "Why can't it be on the same line as the stats?"
 *
 * Runs against the local D1: `node scripts/run-journey-spec.mjs tests/local/journeys/project-page-layout.spec.ts`.
 * Screenshots land in review/s69/ (gitignored).
 */
import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s69'
const ONE = 'sepsis_outcomes_reg'
const MANY = 'layout-many-products'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

async function go(page: Page, slug: string, tab?: string) {
  await page.goto(`/portal/projects/${slug}${tab ? `?tab=${tab}` : ''}`, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
}

async function box(page: Page, testid: string) {
  const b = await page.getByTestId(testid).first().boundingBox()
  expect(b, testid).not.toBeNull()
  return b!
}

test('products and stats share one row, above the tabs, on every tab', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await go(page, ONE)
  const chips = page.getByTestId('project-products').getByRole('group', { name: 'Products' })
  await expect(chips).toBeVisible()
  const stats = await box(page, 'project-stats')
  const chipBox = (await chips.boundingBox())!
  const tabs = (await page.getByRole('tablist', { name: 'Project sections' }).boundingBox())!
  // Same row: the stats' vertical span overlaps the chips'; the stats sit to the right.
  expect(stats.y).toBeLessThan(chipBox.y + chipBox.height)
  expect(stats.y + stats.height).toBeGreaterThan(chipBox.y)
  expect(stats.x).toBeGreaterThan(chipBox.x + 20)
  // Above the tabs.
  expect(tabs.y).toBeGreaterThan(stats.y + stats.height - 1)
  // The row is slim: never a tall card.
  expect(tabs.y - chipBox.y).toBeLessThan(110)
  await page.screenshot({ path: `${SHOTS}/c-1440.png` })

  for (const tab of ['tasks', 'activity', 'files']) {
    await go(page, ONE, tab)
    await expect(page.getByTestId('project-stats')).toBeVisible()
  }
  // Products come before the Open tasks section on Overview.
  await go(page, ONE)
  const open = await box(page, 'project-open-tasks')
  expect(open.y).toBeGreaterThan(tabs.y)
})

test('a chip opens its ladder inline and a second click closes it', async ({ page }) => {
  await go(page, ONE)
  const chip = page.locator('[data-testid^="product-chip-"]').first()
  await expect(chip).toHaveAttribute('aria-expanded', 'false')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-testid^="product-detail-"]')).toBeVisible()
  await chip.click()
  await expect(page.locator('[data-testid^="product-detail-"]')).toHaveCount(0)
})

test('the rail sits right of the main column and stays on screen while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await go(page, ONE)
  const rail = page.getByTestId('project-rail')
  await expect(rail.getByTestId('project-folder')).toBeVisible()
  await expect(rail.getByTestId('project-members')).toBeVisible()
  await expect(rail.getByTestId('project-recent')).toBeVisible()
  await expect(page.getByTestId('project-open-tasks')).toBeVisible()
  await expect(rail.getByTestId('project-open-tasks')).toHaveCount(0)
  const main = await box(page, 'project-open-tasks')
  const r0 = (await rail.boundingBox())!
  expect(r0.x).toBeGreaterThan(main.x + main.width - 1)
  // The rail's width is Today's rail.
  expect(Math.round(r0.width)).toBeLessThanOrEqual(322)

  await page.mouse.wheel(0, 500)
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  const r1 = (await rail.boundingBox())!
  expect(r1.y).toBeGreaterThanOrEqual(0)
  expect(r1.y).toBeLessThan(120)
})

test('the folder panel shows two actions and no path; the duplicate Project folder chip is gone', async ({ page }) => {
  localD1(`UPDATE projects SET primary_folder = 'C:/Users/ingra107/Box/Research/Sepsis' WHERE slug = '${ONE}'`)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await go(page, ONE)
    const folder = page.getByTestId('project-folder')
    await expect(folder.getByRole('button', { name: 'Open folder' })).toBeVisible()
    await expect(folder.getByRole('button', { name: 'Work on this in Claude' })).toBeVisible()
    await expect(folder.getByRole('button', { name: 'Edit location' })).toBeAttached()
    await expect(page.getByText('Box/Research/Sepsis')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Copy path/ })).toHaveCount(0)
    // The Links card no longer repeats the folder as a chip.
    await expect(page.getByTestId('project-rail').getByText('Project folder', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/c-folder-1440.png` })
  } finally {
    localD1(`UPDATE projects SET primary_folder = NULL WHERE slug = '${ONE}'`)
  }
})

test('375px: nothing scrolls sideways, the row wraps, the rail stacks under the main column', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
    await go(page, ONE)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
    const rail = (await page.getByTestId('project-rail').boundingBox())!
    const tasks = await box(page, 'project-open-tasks')
    expect(rail.y).toBeGreaterThan(tasks.y)
    await page.screenshot({ path: `${SHOTS}/c-375-${theme}.png` })
  }
})

test.describe('many products', () => {
  // Its own project, soft-deleted afterwards, so no other spec sees these products.
  const clean = () => localD1(`UPDATE projects SET deleted_at = datetime('now') WHERE slug LIKE '${MANY}%'`)
  test.afterAll(clean)

  test('past four chips the rest fold into "+N more", which opens the grouped list', async ({ page }) => {
    const made = await page.request.post('/api/projects', { headers: PI, data: { title: 'Layout many products', slug: MANY, category: 'lab' } })
    expect(made.ok(), await made.text()).toBe(true)
    const slug = ((await made.json()) as { data: { slug: string } }).data.slug
    const have = (await (await page.request.get(`/api/projects/${slug}/products`, { headers: PI })).json()) as { products: unknown[] }
    for (let i = have.products.length; i < 6; i++) {
      const r = await page.request.post(`/api/projects/${slug}/products`, {
        headers: PI, data: { action: 'add', kind: 'manuscript', stage: 'idea', name: `Extra ${i}` },
      })
      expect(r.ok(), await r.text()).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await go(page, slug)
    const section = page.getByTestId('project-products')
    await expect(section.locator('[data-testid^="product-chip-"]')).toHaveCount(4)
    const more = section.getByTestId('product-more')
    await expect(more).toHaveText(/\+\d+ more/)
    await more.click()
    await expect(section.getByTestId('product-all-list')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/c-more-1440.png` })
    // Picking a folded product opens it and gives it a chip.
    await section.locator('[data-testid^="product-row-"]').last().click()
    await expect(section.locator('[data-testid^="product-detail-"]')).toBeVisible()
    await expect(section.locator('[data-testid^="product-chip-"][aria-expanded="true"]')).toHaveCount(1)
  })
})
