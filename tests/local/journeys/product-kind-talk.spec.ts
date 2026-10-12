/**
 * The talk kind (schema-v132; Nick 2026-10-12: "if i have to give a talk for
 * CRIKEY then talk would be a product"; ladder "Invited > Preparing >
 * Delivered (Declined)").
 *   New Project asks the kind: Talk is on the list, and picking it puts the
 *   stage on the talk ladder. The project is born with a Talk home product and
 *   shows it as its chip. The add-product "+" offers Talk with the same ladder.
 *
 *   node scripts/run-journey-spec.mjs tests/local/journeys/product-kind-talk.spec.ts
 * Screenshots land in review/s74/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s74'
const LADDER = ['Invited', 'Preparing', 'Delivered', 'Declined']
// Unique per run: a dev D1 persists between runs, the gate's does not.
const TITLE = `CRIKEY talk ${Date.now()}`

interface ProductJson { id: string; kind: string; stage: string; is_home: number }

async function slugOf(page: Page, title: string): Promise<string | undefined> {
  const res = await page.request.get('/api/projects', { headers: PI })
  const rows = ((await res.json()) as { data: { slug: string; title: string }[] }).data
  return rows.find((r) => r.title === title)?.slug
}
async function productsOf(page: Page, slug: string): Promise<ProductJson[]> {
  const res = await page.request.get(`/api/projects/${slug}/products`, { headers: PI })
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { products: ProductJson[] }).products
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

test('New Project offers Talk; the stage follows the talk ladder; the project is born a talk', async ({ page }) => {
  await page.goto('/portal/projects', { waitUntil: 'load' })
  await page.locator('.new-project-btn').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await dialog.locator('#project-title').fill(TITLE)

  // Category, First product, Stage: the three InlineSelects, in that order.
  const kindTrigger = dialog.locator('.sr-trig').nth(1)
  const stageTrigger = dialog.locator('.sr-trig').nth(2)
  await kindTrigger.click()
  const talkOption = page.getByRole('option', { name: 'Talk', exact: true })
  await expect(talkOption).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-new-project-kind-picker.png` })
  await talkOption.click()
  await expect(stageTrigger).toContainText('Invited')
  await stageTrigger.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(LADDER)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()

  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect.poll(() => slugOf(page, TITLE), { timeout: 20_000 }).toBeTruthy()
  const slug = (await slugOf(page, TITLE))!
  const products = await productsOf(page, slug)
  expect(products.map((p) => ({ kind: p.kind, stage: p.stage, is_home: p.is_home })))
    .toEqual([{ kind: 'talk', stage: 'invited', is_home: 1 }])

  await page.goto(`/portal/projects/${slug}`, { waitUntil: 'load' })
  const section = page.getByTestId('project-products')
  await expect(section).toBeVisible({ timeout: 20_000 })
  const chip = section.getByTestId(`product-chip-${products[0].id}`)
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('Invited')
  await section.screenshot({ path: `${SHOTS}/03-project-talk-chip.png` })
  await chip.click()
  await expect(page.getByTestId(`product-detail-${products[0].id}`)).toBeVisible()
  for (const stage of ['invited', 'preparing', 'delivered', 'declined']) {
    await expect(page.getByTestId(`stage-dot-${stage}`)).toBeVisible()
  }
  await section.screenshot({ path: `${SHOTS}/04-project-talk-ladder.png` })
})

test('the add-product "+" offers Talk on its own ladder', async ({ page }) => {
  const slug = (await slugOf(page, TITLE))!
  await page.goto(`/portal/projects/${slug}`, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('product-add-toggle').click()
  const kinds = await page.getByTestId('product-add-kind').locator('option').allTextContents()
  expect(kinds).toContain('Talk')
  expect(kinds.indexOf('Talk')).toBe(kinds.indexOf('Abstract / presentation') + 1)
  await page.getByTestId('product-add-kind').selectOption('talk')
  expect(await page.getByTestId('product-add-stage').locator('option').allTextContents()).toEqual(LADDER)
  await page.getByTestId('product-add-form').screenshot({ path: `${SHOTS}/05-add-product-talk.png` })
})
