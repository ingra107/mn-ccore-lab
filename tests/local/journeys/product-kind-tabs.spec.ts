/**
 * The Manuscripts page's kind tabs (Nick 2026-10-12: "to have the option to
 * just see abstracts and grants ... would be a simple view thing", then:
 * "we can keep grants separate ... manuscripts page will have the abstract
 * and such").
 *   Manuscripts (default) keeps today's rows; Abstracts lists PRODUCTS of
 *   that kind (a project's two abstracts are two rows); All groups the
 *   manuscripts, abstracts and talks by kind (a talk, schema-v132, is its own
 *   tab beside Abstracts). Grant applications, awards and honors
 *   are not here (they live on /portal/grants). ?kind= links a tab.
 *
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/product-kind-tabs.spec.ts
 * Screenshots land in review/s61/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s61'

interface ProductJson { id: string; kind: string; stage: string; short_name: string | null; is_home: number }

let SLUG = ''
async function resolve(page: Page): Promise<void> {
  if (SLUG) return
  const res = await page.request.get('/api/projects', { headers: PI })
  const rows = ((await res.json()) as { data: { slug: string; title: string }[] }).data
  const row = rows.find((r) => r.title === 'Sepsis Outcomes Registry')
  expect(row, 'seeded project').toBeTruthy()
  SLUG = row!.slug
}
async function productsOf(page: Page): Promise<ProductJson[]> {
  const res = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await res.json()) as { products: ProductJson[] }).products
}
async function ensure(page: Page, kind: string, stage: string, name: string): Promise<void> {
  if ((await productsOf(page)).some((p) => p.kind === kind && p.short_name === name)) return
  const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data: { action: 'add', kind, stage, name } })
  expect(r.status(), `add ${kind}`).toBe(200)
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
  await resolve(page)
  await ensure(page, 'abstract', 'planning', 'ATS poster')
  await ensure(page, 'abstract', 'planning', 'SCCM talk')
  await ensure(page, 'talk', 'invited', 'UofC Grand Rounds')
  // Grant kinds on the same project: they must NOT show on this page.
  await ensure(page, 'grant_application', 'preparing', 'A0')
  await ensure(page, 'award', 'active', 'K23')
  await ensure(page, 'honor', 'preparing', 'ASCI YPSA')
})

test('Manuscripts is the default tab and keeps its rows; only the writing kinds get tabs', async ({ page }) => {
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  const tabs = page.getByTestId('product-kind-tabs').getByRole('tab')
  await expect(tabs.first()).toBeVisible({ timeout: 20_000 })
  await expect(tabs).toHaveText(['Manuscripts', 'Abstracts', 'Talks', 'All'])
  await expect(page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Manuscripts' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('List', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/50-kind-tab-manuscripts.png` })
})

test('Abstracts: one row per product, each with its own ladder; the stage writes the product', async ({ page }) => {
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  await page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Abstracts' }).click()
  await expect(page).toHaveURL(/[?&]kind=abstract/)
  await expect(page.getByTestId('product-kind-list')).toBeVisible()
  const abstracts = (await productsOf(page)).filter((p) => p.kind === 'abstract')
  expect(abstracts.length).toBe(2)
  for (const a of abstracts) {
    const r = page.getByTestId(`kind-row-${a.id}`)
    await expect(r).toBeVisible()
    await expect(r).toContainText(a.short_name!)
    await expect(r.getByRole('link')).toHaveAttribute('href', new RegExp(`/projects/${SLUG}$`))
  }
  await page.screenshot({ path: `${SHOTS}/51-kind-tab-abstracts.png` })

  const poster = abstracts.find((a) => a.short_name === 'ATS poster')!
  await page.getByTestId(`kind-stage-${poster.id}`).locator('.sr-trig').click()
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.getByRole('option', { name: 'Submitted' }).click()
  expect((await write).status()).toBe(200)
  await expect.poll(async () => (await productsOf(page)).find((p) => p.id === poster.id)!.stage).toBe('submitted')
  // The other abstract kept its own stage.
  expect((await productsOf(page)).find((p) => p.short_name === 'SCCM talk')!.stage).toBe('planning')
})

for (const kind of ['grant_application', 'nonsense']) {
  test(`?kind=${kind} has no tab here: Manuscripts shows and the address drops it`, async ({ page }) => {
    await page.goto(`/portal/manuscripts?kind=${kind}&category=`, { waitUntil: 'load' })
    await expect(page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Manuscripts' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
    await expect(page.getByTestId('product-kind-list')).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]kind=/)
  })
}

test('phone width, light and dark: the tabs and the abstract rows fit, nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const theme of ['light', 'dark']) {
    await page.goto('/portal/manuscripts', { waitUntil: 'load' })
    await page.evaluate((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
    await page.goto('/portal/manuscripts?kind=abstract', { waitUntil: 'load' })
    await expect(page.getByTestId('product-kind-list')).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
    const tabs = await page.getByTestId('product-kind-tabs').boundingBox()
    expect(tabs!.x + tabs!.width).toBeLessThanOrEqual(375)
    for (const id of (await productsOf(page)).filter((x) => x.kind === 'abstract').map((x) => x.id)) {
      const box = await page.getByTestId(`kind-stage-${id}`).boundingBox()
      expect(box!.x + box!.width, 'stage control inside the screen').toBeLessThanOrEqual(375)
    }
    await page.screenshot({ path: `${SHOTS}/56-kind-tab-abstracts-phone-${theme}.png` })
  }
})

test('Talks: the invited talk is a row on its own tab, on its own ladder', async ({ page }) => {
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  await page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Talks' }).click()
  await expect(page).toHaveURL(/[?&]kind=talk/)
  const talk = (await productsOf(page)).find((p) => p.kind === 'talk')!
  const r = page.getByTestId(`kind-row-${talk.id}`)
  await expect(r).toBeVisible({ timeout: 20_000 })
  await expect(r).toContainText('UofC Grand Rounds')
  for (const p of (await productsOf(page)).filter((x) => x.kind !== 'talk')) {
    await expect(page.getByTestId(`kind-row-${p.id}`)).toHaveCount(0)
  }
  await page.screenshot({ path: 'review/s74/02-manuscripts-talks-tab.png' })
})

test('All: the manuscripts, abstracts and talks, grouped by kind; no grant kinds', async ({ page }) => {
  await page.goto('/portal/manuscripts?kind=all', { waitUntil: 'load' })
  const list = page.getByTestId('product-kind-list')
  await expect(list).toBeVisible({ timeout: 20_000 })
  await expect(list.getByRole('heading')).toHaveText([/^Manuscripts/, /^Abstracts/, /^Talks/])
  for (const p of await productsOf(page)) {
    const r = page.getByTestId(`kind-row-${p.id}`)
    if (p.kind === 'manuscript' || p.kind === 'abstract' || p.kind === 'talk') await expect(r).toBeVisible()
    else await expect(r).toHaveCount(0)
  }
  await page.screenshot({ path: `${SHOTS}/55-kind-tab-all.png`, fullPage: true })
})
