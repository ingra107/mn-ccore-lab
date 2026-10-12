/**
 * The Manuscripts page's kind tabs (Nick 2026-10-12: "to have the option to
 * just see abstracts and grants ... would be a simple view thing").
 *   Manuscripts (default) keeps today's rows; Grant applications, Abstracts,
 *   Awards, Honors list PRODUCTS of that kind (a project's A0 and A1 are two
 *   rows); All groups every product by kind. ?kind= links a tab.
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
  await ensure(page, 'grant_application', 'preparing', 'A0')
  await ensure(page, 'grant_application', 'preparing', 'A1')
  await ensure(page, 'abstract', 'planning', 'ATS poster')
  await ensure(page, 'award', 'active', 'K23')
  await ensure(page, 'honor', 'preparing', 'ASCI YPSA')
})

test('Manuscripts is the default tab and keeps its rows; each kind with products gets a tab', async ({ page }) => {
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  const tabs = page.getByTestId('product-kind-tabs').getByRole('tab')
  await expect(tabs.first()).toBeVisible({ timeout: 20_000 })
  await expect(tabs).toHaveText(['Manuscripts', 'Abstracts', 'Grant applications', 'Awards', 'Honors', 'All'])
  await expect(page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Manuscripts' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('List', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/50-kind-tab-manuscripts.png` })
})

test('Grant applications: one row per product, A0 and A1 both, each with its own ladder; the stage writes the product', async ({ page }) => {
  await page.goto('/portal/manuscripts', { waitUntil: 'load' })
  await page.getByTestId('product-kind-tabs').getByRole('tab', { name: 'Grant applications' }).click()
  await expect(page).toHaveURL(/[?&]kind=grant_application/)
  const list = page.getByTestId('product-kind-list')
  await expect(list).toBeVisible()
  const grants = (await productsOf(page)).filter((p) => p.kind === 'grant_application')
  for (const g of grants) {
    const r = page.getByTestId(`kind-row-${g.id}`)
    await expect(r).toBeVisible()
    await expect(r).toContainText(g.short_name!)
    await expect(r.getByRole('link')).toHaveAttribute('href', new RegExp(`/projects/${SLUG}$`))
  }
  await page.screenshot({ path: `${SHOTS}/51-kind-tab-grants.png` })

  const a1 = grants.find((g) => g.short_name === 'A1')!
  const cell = page.getByTestId(`kind-stage-${a1.id}`)
  await cell.locator('.sr-trig').click()
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await page.getByRole('option', { name: 'Submitted' }).click()
  expect((await write).status()).toBe(200)
  await expect.poll(async () => (await productsOf(page)).find((p) => p.id === a1.id)!.stage).toBe('submitted')
  // A0 kept its own stage.
  expect((await productsOf(page)).find((p) => p.short_name === 'A0')!.stage).toBe('preparing')
})

for (const [kind, label, shot] of [
  ['abstract', 'Abstracts', '52-kind-tab-abstracts'],
  ['award', 'Awards', '53-kind-tab-awards'],
  ['honor', 'Honors', '54-kind-tab-honors'],
] as const) {
  test(`${label}: a linked tab (?kind=${kind}) opens on its rows`, async ({ page }) => {
    await page.goto(`/portal/manuscripts?kind=${kind}`, { waitUntil: 'load' })
    await expect(page.getByTestId('product-kind-tabs').getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
    const ids = (await productsOf(page)).filter((p) => p.kind === kind).map((p) => p.id)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) await expect(page.getByTestId(`kind-row-${id}`)).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/${shot}.png` })
  })
}

test('All: every product, grouped by kind', async ({ page }) => {
  await page.goto('/portal/manuscripts?kind=all', { waitUntil: 'load' })
  const list = page.getByTestId('product-kind-list')
  await expect(list).toBeVisible({ timeout: 20_000 })
  await expect(list.getByRole('heading')).toContainText(['Manuscripts', 'Abstracts', 'Grant applications', 'Awards', 'Honors'])
  for (const p of await productsOf(page)) await expect(page.getByTestId(`kind-row-${p.id}`)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/55-kind-tab-all.png`, fullPage: true })
})
