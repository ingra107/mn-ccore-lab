/**
 * Quick capture takes a project ~ product pair (Nick, 2026-10-12): "Draft intro
 * #adhere~results" files the task on that project AND that product. A bare
 * "#project" still leaves product_id to the home rule. After "#project~" the
 * box lists that project's products.
 *
 *   node scripts/run-journey-spec.mjs tests/local/journeys/quick-add-pair.spec.ts
 *
 * The project is made fresh with a unique slug, so the token cannot land on a
 * neighbour (a dev D1 persists between runs; the gate's does not).
 * Screenshots land in review/s77/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s77'
const STAMP = Date.now().toString(36)
const SLUG = `qapair-${STAMP}`

interface Prod { id: string; kind: string; short_name: string | null; is_home: number }
interface TaskJson { id: string; title: string; project_id: string | null; product_id: string | null }

let home: Prod, results: Prod

async function products(page: Page): Promise<Prod[]> {
  const r = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await r.json()) as { products: Prod[] }).products
}
async function tasksOf(page: Page): Promise<TaskJson[]> {
  const r = await page.request.get(`/api/tasks?project=${SLUG}`, { headers: PI })
  return ((await r.json()) as { data: TaskJson[] }).data
}

async function openCapture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/portal/dashboard', { waitUntil: 'load' })
  // The floating button is the desktop opener (the q key needs the shell hydrated first).
  await page.getByTestId('fab-quick-add').click({ timeout: 20_000 })
  const box = page.locator('textarea.quick-add-textarea')
  await expect(box).toBeVisible({ timeout: 20_000 })
  return box
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

test('seed a project with a home product and a Results paper', async ({ page }) => {
  const made = await page.request.post('/api/projects', { headers: PI, data: { title: `Quick Pair ${STAMP}`, slug: SLUG, category: 'lab' } })
  expect(made.ok(), await made.text()).toBe(true)
  const k = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  const stages = ((await k.json()) as { kinds: { kind: string; stages: { stage: string }[] }[] }).kinds.find((x) => x.kind === 'manuscript')!.stages
  const add = await page.request.post(`/api/projects/${SLUG}/products`, {
    headers: PI, data: { action: 'add', kind: 'manuscript', stage: stages[0].stage, name: 'Results paper' },
  })
  expect(add.ok(), await add.text()).toBe(true)
  const ps = await products(page)
  expect(ps.length).toBe(2)
  home = ps.find((p) => p.is_home === 1)!
  results = ps.find((p) => p.short_name === 'Results paper')!
  expect(home.id).not.toBe(results.id)
})

test('"#project~" lists the project\'s products; a pick fills the token; Enter files on the pair', async ({ page }) => {
  const box = await openCapture(page)
  await box.pressSequentially(`Draft intro #${SLUG}~res`)

  const list = page.getByTestId('quick-add-products')
  await expect(list).toBeVisible()
  // Narrowed by what is typed: only Results paper starts with "res".
  await expect(page.getByTestId('quick-add-product')).toHaveCount(1)
  await expect(list).toContainText('Results paper')
  await page.screenshot({ path: `${SHOTS}/01-quick-add-products-narrowed.png` })

  // The bare "~" lists every product, home first.
  await box.fill(`Draft intro #${SLUG}~`)
  await expect(page.getByTestId('quick-add-product')).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/02-quick-add-products-all.png` })

  // Pick by click; the token completes and the list closes behind it.
  await box.fill(`Draft intro #${SLUG}~res`)
  await page.getByTestId('quick-add-product').first().click()
  await expect(box).toHaveValue(`Draft intro #${SLUG}~results-paper `)
  await expect(list).toHaveCount(0)

  await box.press('Enter')
  await expect.poll(async () => (await tasksOf(page)).find((t) => t.title === 'Draft intro')?.product_id, { timeout: 20_000 }).toBe(results.id)
  const task = (await tasksOf(page)).find((t) => t.title === 'Draft intro')!
  expect(task.project_id).toBe(SLUG)
})

test('typing the pair out in full files on the pair, no pick needed', async ({ page }) => {
  const box = await openCapture(page)
  await box.pressSequentially(`Write abstract #${SLUG}~results`)
  // The list is open mid-token; a space closes it, then Enter submits.
  await box.pressSequentially(' ')
  // The parse needs the live project list; the preview chip shows it has it.
  await expect(page.getByText(`Quick Pair ${STAMP} ~ Results paper`).last()).toBeVisible()
  await box.press('Enter')
  await expect.poll(async () => (await tasksOf(page)).find((t) => t.title === 'Write abstract')?.product_id, { timeout: 20_000 }).toBe(results.id)
})

test('a bare #project is unchanged: the home rule picks the product', async ({ page }) => {
  const box = await openCapture(page)
  await box.pressSequentially(`Bare capture #${SLUG}`)
  await expect(page.getByTestId('quick-add-products')).toHaveCount(0)
  await expect(page.getByText(`Quick Pair ${STAMP}`, { exact: true }).last()).toBeVisible()
  await box.press('Enter')
  await expect.poll(async () => (await tasksOf(page)).find((t) => t.title === 'Bare capture')?.product_id, { timeout: 20_000 }).toBe(home.id)
})
