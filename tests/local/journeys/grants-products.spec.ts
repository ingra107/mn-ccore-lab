/**
 * The Grants page reads products (Nick 2026-10-12: "use the current grants page
 * to build out and make sure it reads the right stuff"). Rows are grant
 * products; an award draws a solid bar, an application a hypothetical one
 * ("muted"); bars move by dragging ("you could actually move some of those
 * dates by just moving those bars") or from the keyboard.
 *
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/grants-products.spec.ts
 * Screenshots land in review/s65/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s65'

interface Product { id: string; kind: string; stage: string; short_name: string | null; period_start: string | null; period_end: string | null; amount_usd: number | null; venue: string | null }

let SLUG = ''
const ids: Record<string, string> = {}

async function products(page: Page): Promise<Product[]> {
  const res = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await res.json()) as { products: Product[] }).products
}
async function post(page: Page, data: Record<string, unknown>) {
  const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data })
  expect(r.status(), JSON.stringify(data)).toBe(200)
  return (await r.json()) as { product?: Product }
}
async function ensure(page: Page, name: string, kind: string, stage: string, fields: Record<string, unknown>) {
  let p = (await products(page)).find((x) => x.short_name === name)
  if (!p) p = (await post(page, { action: 'add', kind, stage, name })).product as Product
  ids[name] = p.id
  await post(page, { action: 'terms', product_id: p.id, fields })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
  if (!SLUG) {
    const res = await page.request.get('/api/projects', { headers: PI })
    const rows = ((await res.json()) as { data: { slug: string; title: string }[] }).data
    SLUG = rows.find((r) => r.title === 'Sepsis Outcomes Registry')!.slug
    await ensure(page, 'K23', 'award', 'active', { venue: 'NHLBI K23', period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: 644588 })
    await ensure(page, 'A0', 'grant_application', 'preparing', { venue: 'NHLBI R01', period_start: '2027-07-01' })
  }
})

async function open(page: Page, view: 'list' | 'timeline', theme = 'light') {
  await page.goto('/portal/dashboard', { waitUntil: 'load' })
  await page.evaluate((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
  await page.goto('/portal/grants', { waitUntil: 'load' })
  await expect(page.getByTestId(`grant-row-${ids.K23}`)).toBeVisible({ timeout: 20_000 })
  if (view === 'timeline') {
    await page.getByText('Timeline', { exact: true }).first().click()
    await expect(page.getByTestId('grant-gantt')).toBeVisible()
  }
}

test('List: each grant product is a row with its project, ladder and terms; edits write the product', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'list')
  const k23 = page.getByTestId(`grant-row-${ids.K23}`)
  await expect(k23).toContainText('K23')
  await expect(k23).toContainText('$645K')
  await expect(page.getByTestId(`grant-row-${ids.A0}`)).toContainText('NHLBI R01')
  // An application offers no amount (only an award funds).
  await expect(page.getByTestId(`grant-amount-${ids.A0}`)).toHaveCount(0)
  await expect(page.getByTestId('grant-funding-total')).toContainText('active funding')
  await page.screenshot({ path: `${SHOTS}/01-grants-list-1440-light.png` })

  // Inline venue edit -> the product's venue.
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.getByTestId(`grant-venue-${ids.A0}`).click()
  const input = page.getByTestId(`grant-venue-${ids.A0}-input`)
  await input.fill('NHLBI R01 (A0)')
  await input.press('Enter')
  expect((await write).status()).toBe(200)
  await expect.poll(async () => (await products(page)).find((p) => p.id === ids.A0)!.venue).toBe('NHLBI R01 (A0)')
  await expect(page.getByRole('button', { name: /undo/i }).first()).toBeVisible()
})

test('Timeline: the award is solid, the application hypothetical; dragging the award moves both ends', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'timeline')
  const award = page.getByTestId(`gantt-bar-${ids.K23}`)
  const app = page.getByTestId(`gantt-bar-${ids.A0}`)
  await expect(award).not.toHaveClass(/is-hyp/)
  await expect(app).toHaveClass(/is-hyp/)
  await page.screenshot({ path: `${SHOTS}/02-grants-timeline-1440-light.png` })

  const before = (await products(page)).find((p) => p.id === ids.K23)!
  const box = (await award.boundingBox())!
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  expect((await write).status()).toBe(200)
  const after = (await products(page)).find((p) => p.id === ids.K23)!
  expect(after.period_start! > before.period_start!).toBe(true)
  const len = (p: Product) => Date.parse(p.period_end!) - Date.parse(p.period_start!)
  expect(len(after)).toBe(len(before))                       // the award kept its length
  await expect(page.getByRole('button', { name: /undo/i }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/03-grants-timeline-after-drag.png` })
})

test('Timeline from the keyboard: arrows move the proposed start a week each, Enter saves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'timeline')
  const before = (await products(page)).find((p) => p.id === ids.A0)!.period_start!
  const app = page.getByTestId(`gantt-bar-${ids.A0}`)
  await app.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.keyboard.press('Enter')
  expect((await write).status()).toBe(200)
  const after = (await products(page)).find((p) => p.id === ids.A0)!
  expect((Date.parse(after.period_start!) - Date.parse(before)) / 86_400_000).toBe(14)
  expect(after.period_end).toBeNull()                         // an application has no end
})

test('Post-award: add a milestone; it is a diamond on the award\'s row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'list')
  await page.getByRole('tab', { name: 'Post-Award' }).click()
  await page.getByTestId('add-milestone').click()
  await page.locator('#ms-title').fill('Year 4 RPPR')
  await page.locator('#ms-due').fill('2026-09-15')
  await page.locator('#ms-hard').fill('2026-10-15')
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.getByTestId('milestone-save').click()
  expect((await write).status()).toBe(200)
  await expect(page.getByTestId('post-award')).toContainText('Year 4 RPPR')
  await page.screenshot({ path: `${SHOTS}/04-grants-post-award.png` })
  await page.getByRole('tab', { name: 'My Grants' }).click()
  await page.getByText('Timeline', { exact: true }).first().click()
  await expect(page.locator('[data-testid^="gantt-ms-"]').first()).toBeVisible()
})

for (const theme of ['light', 'dark']) {
  test(`1440 and 375, ${theme}: list and timeline render; nothing scrolls sideways on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'list', theme)
    await page.screenshot({ path: `${SHOTS}/10-list-1440-${theme}.png` })
    await open(page, 'timeline', theme)
    await page.screenshot({ path: `${SHOTS}/11-timeline-1440-${theme}.png` })
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'list', theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
    await page.screenshot({ path: `${SHOTS}/12-list-375-${theme}.png`, fullPage: true })
    await open(page, 'timeline', theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
    const bar = (await page.getByTestId(`gantt-bar-${ids.K23}`).boundingBox())!
    expect(bar.x + bar.width).toBeLessThanOrEqual(376)
    await page.screenshot({ path: `${SHOTS}/13-timeline-375-${theme}.png`, fullPage: true })
  })
}
