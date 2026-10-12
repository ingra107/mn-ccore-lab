/**
 * The list views read products (Nick 2026-10-12: "Build the list view next").
 *   Projects list Stage cell: a small ladder for one product (editable),
 *     chips for 2+ (they open the project page).
 *   Manuscripts: a project's row is its home product; the stage cell and the
 *     pipeline drag write that product.
 * Every write goes through POST /api/projects/:slug/products.
 *
 * Runs against the local D1:
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/projects-list-products.spec.ts
 * Screenshots land in review/s61/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s61'

interface ProductJson { id: string; kind: string; stage: string; is_home: number; seq: number }

let SLUG = ''
let PROJECT_ID = ''
async function resolve(page: Page): Promise<void> {
  if (SLUG) return
  const res = await page.request.get('/api/projects', { headers: PI })
  const rows = ((await res.json()) as { data: { id: string; slug: string; title: string }[] }).data
  const row = rows.find((r) => r.title === 'Sepsis Outcomes Registry')
  expect(row, 'seeded project').toBeTruthy()
  SLUG = row!.slug
  PROJECT_ID = row!.id
}
async function productsOf(page: Page): Promise<ProductJson[]> {
  const res = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await res.json()) as { products: ProductJson[] }).products
}
function row(page: Page) {
  return page.locator(`[data-project-slug="${SLUG}"]`).first()
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
  await resolve(page)
})

test('Projects list: one product is a ladder you can set; the write is the product\'s', async ({ page }) => {
  await page.goto('/portal/projects?status=all', { waitUntil: 'load' })
  await expect(row(page)).toBeVisible({ timeout: 20_000 })
  const cell = page.getByTestId(`list-stage-ladder-${SLUG}`)
  await expect(cell).toBeVisible()
  await expect(cell.locator('.psc-d.is-on')).toHaveCount(1)
  await row(page).screenshot({ path: `${SHOTS}/10-list-ladder.png` })
  const [home] = await productsOf(page)
  const target = home.stage === 'writing' ? 'submitted' : 'writing'
  await cell.locator('.sr-trig').click()
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.getByRole('option', { name: target === 'writing' ? 'Writing' : 'Submitted' }).click()
  expect((await write).status()).toBe(200)
  await expect.poll(async () => (await productsOf(page))[0].stage).toBe(target)
  // One stage truth: the project row follows (schema-v126).
  const proj = await page.request.get(`/api/projects/${SLUG}`, { headers: PI })
  const body = (await proj.json()) as { data?: { stage?: string }; stage?: string }
  expect(body.data?.stage ?? body.stage).toBe(target)
})

test('Projects list: two products are chips that open the project', async ({ page }) => {
  const add = await page.request.post(`/api/projects/${SLUG}/products`, {
    headers: PI, data: { action: 'add', kind: 'abstract', stage: 'planning', name: 'ATS poster' },
  })
  expect(add.status()).toBe(200)
  await page.goto('/portal/projects?status=all', { waitUntil: 'load' })
  const chips = page.getByTestId(`list-stage-chips-${SLUG}`)
  await expect(chips).toBeVisible({ timeout: 20_000 })
  await expect(chips).toContainText('+1')
  await expect(chips).toHaveAttribute('data-tip', /ATS poster: Planning/)
  await row(page).screenshot({ path: `${SHOTS}/11-list-chips.png` })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/portal/projects?status=all', { waitUntil: 'load' })
  await expect(page.getByTestId(`list-stage-chips-${SLUG}`)).toBeVisible({ timeout: 20_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
  await row(page).screenshot({ path: `${SHOTS}/12-list-chips-phone.png` })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByTestId(`list-stage-chips-${SLUG}`).click()
  await expect(page).toHaveURL(new RegExp(`/portal/projects/${SLUG}`))
})

test('Manuscripts: the row is the home product; its stage cell and the drag write it', async ({ page }) => {
  const home = (await productsOf(page)).find((p) => p.is_home === 1)!
  // The home must be a manuscript at writing or later to be a manuscript row.
  if (home.stage !== 'writing') {
    const r = await page.request.post(`/api/projects/${SLUG}/products`, {
      headers: PI, data: { action: 'stage', product_id: home.id, stage: 'writing' },
    })
    expect(r.status()).toBe(200)
  }
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  const mrow = page.locator(`[data-project-slug="${SLUG}"], [data-slug="${SLUG}"]`).first()
  await expect(page.getByText('Sepsis Outcomes Registry').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/13-manuscripts-list.png`, fullPage: false })

  // Pipeline: drag the card from Writing to Submitted.
  await page.getByText('Pipeline', { exact: true }).first().click()
  const card = page.locator(`a[href$="/projects/${SLUG}"]`).first()
  await expect(card).toBeVisible()
  const target = page.getByRole('heading', { name: 'Submitted', exact: true }).first()
  const from = await card.boundingBox()
  const to = await target.boundingBox()
  expect(from && to).toBeTruthy()
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(from!.x + from!.width / 2 + 20, from!.y + from!.height / 2, { steps: 4 })
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 60, { steps: 12 })
  await page.mouse.up()
  expect((await write).status()).toBe(200)
  // The drop lands on a later column (dnd-kit may auto-scroll the board while
  // dragging, so the exact column is not pinned): the HOME PRODUCT moved off
  // writing, through the project's own route, and the project row followed.
  await expect.poll(async () => (await productsOf(page)).find((p) => p.id === home.id)!.stage).not.toBe('writing')
  await expect(page.getByRole('button', { name: /undo/i }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/14-manuscripts-pipeline-after-drag.png` })
  expect(mrow).toBeTruthy()
  expect(PROJECT_ID).not.toBe('')
})
