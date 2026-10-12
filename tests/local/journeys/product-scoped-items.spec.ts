/**
 * Product-scoped items (schema-v131). Nick, 2026-10-12: a product has its own
 * description, files, revisions and activity inside the project. Untagged
 * items are project-wide: they show under every product (marked "project").
 * Tagged items show under their product and under All. "If there's anything
 * that are product specific, they should be at the top."
 *
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/product-scoped-items.spec.ts
 *
 * Screenshots land in review/s72/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'
import { localD1 } from './localD1'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s72'
const SLUG = 'adhere-items'
const URL_OF = `/portal/projects/${SLUG}`

interface Prod { id: string; short_name: string | null; is_home: number }
let home: Prod, ops: Prod, paper: Prod

async function products(page: Page): Promise<Prod[]> {
  const r = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await r.json()) as { products: Prod[] }).products
}
async function postProducts(page: Page, data: Record<string, unknown>) {
  const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data })
  expect(r.ok(), await r.text()).toBe(true)
  return r.json()
}
async function filesOf(page: Page): Promise<{ id: string; filename: string; product_id: string | null }[]> {
  const r = await page.request.get(`/api/files?entity_type=project&entity_id=${SLUG}`, { headers: PI })
  return ((await r.json()) as { data: { id: string; filename: string; product_id: string | null }[] }).data
}
async function textsInOrder(page: Page, names: string[], scope = 'main'): Promise<string[]> {
  const body = await page.locator(scope).innerText()
  return names.map((n) => ({ n, i: body.indexOf(n) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.n)
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

test('seed: a project with three products; a file, a round and a note of each scope', async ({ page }) => {
  const made = await page.request.post('/api/projects', { headers: PI, data: { title: 'ADHERE Items', slug: SLUG, category: 'lab' } })
  expect(made.ok(), await made.text()).toBe(true)
  await postProducts(page, { action: 'add', kind: 'trial_ops', stage: 'enrolling', name: 'Trial ops' }).catch(async () => {
    // the ladder's first stage, whatever it is called
    const k = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
    const stages = ((await k.json()) as { kinds: { kind: string; stages: { stage: string }[] }[] }).kinds.find((x) => x.kind === 'trial_ops')!.stages
    await postProducts(page, { action: 'add', kind: 'trial_ops', stage: stages[0].stage, name: 'Trial ops' })
  })
  await postProducts(page, { action: 'add', kind: 'manuscript', stage: 'idea', name: 'Protocol paper' })
  const ps = await products(page)
  expect(ps.length).toBe(3)
  home = ps.find((p) => p.is_home === 1)!
  ops = ps.find((p) => p.short_name === 'Trial ops')!
  paper = ps.find((p) => p.short_name === 'Protocol paper')!

  // Files: R2 is not local, so the rows go in directly (the upload route is covered by the API suite).
  const file = (id: string, name: string, product: string | null) => localD1(
    `INSERT INTO file_attachments (id, entity_type, entity_id, filename, r2_key, uploaded_by, product_id) VALUES ('${id}', 'project', '${SLUG}', '${name}', 'project/${SLUG}/${id}', 'nick-ingraham', ${product ? `'${product}'` : 'NULL'})`)
  file('s72f-paper', 'paper-figure.pdf', paper.id)
  file('s72f-wide', 'umbrella-budget.pdf', null)
  file('s72f-ops', 'ops-manual.pdf', ops.id)
  expect((await filesOf(page)).length).toBe(3)

  // Revisions through the route, one per scope.
  for (const [journal, product] of [['Wide Journal', null], ['Paper Journal', paper.id], ['Ops Journal', ops.id]] as const) {
    const r = await page.request.post('/api/revisions', { headers: PI, data: { project_slug: SLUG, journal, ...(product ? { product_id: product } : {}) } })
    expect(r.ok(), await r.text()).toBe(true)
  }
  // Notes, one per scope.
  for (const [content, product] of [['wide note umbrella', null], ['paper note protocol', paper.id], ['ops note enrolment', ops.id]] as const) {
    const r = await page.request.post(`/api/projects/${SLUG}/updates`, { headers: PI, data: { content, ...(product ? { product_id: product } : {}) } })
    expect(r.ok(), await r.text()).toBe(true)
  }
})

test('Files: under a product its own file is first, the project-wide one next, the other product drops out; All keeps all with markers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${URL_OF}?tab=files`, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('file-product-s72f-wide')).toHaveValue('')
  await expect(page.getByTestId('file-product-s72f-ops')).toHaveValue(ops.id)
  await expect(page.getByTestId('file-product-s72f-wide')).toHaveAttribute('data-scope', 'project')
  expect(await textsInOrder(page, ['paper-figure.pdf', 'umbrella-budget.pdf', 'ops-manual.pdf'])).toHaveLength(3)
  await page.screenshot({ path: `${SHOTS}/20-files-all-light-1440.png` })

  await page.getByTestId(`product-chip-${ops.id}`).click()
  await expect(page).toHaveURL(new RegExp(`product=${ops.id}`))
  await expect(page.getByText('paper-figure.pdf')).toHaveCount(0)
  expect(await textsInOrder(page, ['ops-manual.pdf', 'umbrella-budget.pdf'])).toEqual(['ops-manual.pdf', 'umbrella-budget.pdf'])
  await page.screenshot({ path: `${SHOTS}/21-files-ops-light-1440.png` })

  // Re-tag the project-wide file to Protocol paper with the row's select; then back.
  await page.getByTestId('product-chip-all').click()
  await page.getByTestId('file-product-s72f-wide').selectOption(paper.id)
  await expect.poll(async () => (await filesOf(page)).find((f) => f.id === 's72f-wide')?.product_id).toBe(paper.id)
  await page.getByTestId('file-product-s72f-wide').selectOption('')
  await expect.poll(async () => (await filesOf(page)).find((f) => f.id === 's72f-wide')?.product_id).toBeNull()
})

test('Revisions: product rounds first, project-wide next, the other product out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${URL_OF}?tab=revisions&product=${ops.id}`, { waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  await expect(page.getByText('Paper Journal')).toHaveCount(0)
  expect(await textsInOrder(page, ['Ops Journal', 'Wide Journal'])).toEqual(['Ops Journal', 'Wide Journal'])
  await page.screenshot({ path: `${SHOTS}/22-revisions-ops-light-1440.png` })
  // All shows the three, each marked.
  await page.getByTestId('product-chip-all').click()
  await expect(page.getByText('Paper Journal')).toBeVisible()
  const marks = await page.locator('[data-testid^="revision-product-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.scope))
  expect(marks.sort()).toEqual(['product', 'product', 'project'])
})

test('Activity: product notes and stage lines first, project-wide next; a note written under a chip is tagged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // A stage move on Trial ops writes a stage line tagged to it.
  const ladder = await (await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })).json() as { kinds: { kind: string; stages: { stage: string }[] }[] }
  const opsStages = ladder.kinds.find((k) => k.kind === 'trial_ops')!.stages
  await postProducts(page, { action: 'stage', product_id: ops.id, stage: opsStages[opsStages.length - 1].stage })

  await page.goto(`${URL_OF}?tab=activity&product=${ops.id}`, { waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  const panel = page.locator('#projectdetail-tabpanel-activity')
  await expect(panel.getByText('ops note enrolment')).toBeVisible({ timeout: 20_000 })
  await expect(panel.getByText('paper note protocol')).toHaveCount(0)
  const order = await textsInOrder(page, ['ops note enrolment', 'Stage (Trial ops)', 'wide note umbrella'], '#projectdetail-tabpanel-activity')
  expect(order[order.length - 1]).toBe('wide note umbrella')
  expect(order).toContain('ops note enrolment')
  expect(order).toContain('Stage (Trial ops)')
  await page.screenshot({ path: `${SHOTS}/23-activity-ops-light-1440.png` })

  // Compose a note with the chip selected: it is tagged to that product.
  const box = page.locator('#projectdetail-tabpanel-activity').getByRole('textbox').first()
  await box.fill('composed under the ops chip')
  await box.press('Control+Enter')
  const feed = async () => ((await (await page.request.get(`/api/projects/${SLUG}/activity`, { headers: PI })).json()) as { data: { body: string; product_id: string | null }[] }).data
  await expect.poll(async () => (await feed()).find((e) => e.body === 'composed under the ops chip')?.product_id).toBe(ops.id)
  expect((await feed()).find((e) => e.body === 'wide note umbrella')!.product_id).toBeNull()
})

test('Overview: the product description sits above the project description, marked project; editing saves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${URL_OF}?product=${paper.id}`, { waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${paper.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  const block = page.getByTestId('product-description')
  await expect(block).toBeVisible()
  await expect(page.getByTestId('project-description-marker')).toBeVisible()
  const boxP = await block.boundingBox()
  const boxM = await page.getByTestId('project-description-marker').boundingBox()
  expect(boxP!.y).toBeLessThan(boxM!.y)
  await page.getByTestId('product-description-text').click()
  await page.getByTestId('product-description-input').fill('The protocol paper reports the design.')
  await page.getByTestId('product-description-input').blur()
  await expect.poll(async () => (await products(page) as unknown as { description?: string; id: string }[]).find((p) => p.id === paper.id)?.description).toBe('The protocol paper reports the design.')
  await page.screenshot({ path: `${SHOTS}/24-overview-description-light-1440.png` })
  // All shows no product description.
  await page.getByTestId('product-chip-all').click()
  await expect(page.getByTestId('product-description')).toHaveCount(0)
  void home
})

test('a stale ?product= posts project-wide; a tombstoned product\'s items read as project-wide under every chip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // F1: the page shows All for an id it does not know, and a note posts project-wide instead of a 400.
  await page.goto(`${URL_OF}?tab=activity&product=prd_not_a_product`, { waitUntil: 'load' })
  await expect(page.getByTestId('product-chip-all')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  const box = page.locator('#projectdetail-tabpanel-activity').getByRole('textbox').first()
  await box.fill('composed under a stale chip')
  await box.press('Control+Enter')
  const feed = async () => ((await (await page.request.get(`/api/projects/${SLUG}/activity`, { headers: PI })).json()) as { data: { body: string; product_id: string | null }[] }).data
  await expect.poll(async () => (await feed()).some((e) => e.body === 'composed under a stale chip')).toBe(true)
  expect((await feed()).find((e) => e.body === 'composed under a stale chip')!.product_id).toBeNull()

  // F3: tombstone Protocol paper. Its file, its round and its stage history stay on the project.
  await postProducts(page, { action: 'stage', product_id: paper.id, stage: 'writing' })
  localD1(`UPDATE products SET deleted_at = datetime('now') WHERE id = '${paper.id}'`)
  await page.goto(`${URL_OF}?tab=files&product=${ops.id}`, { waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  await expect(page.getByText('paper-figure.pdf')).toBeVisible()
  await expect(page.getByTestId('file-product-s72f-paper')).toHaveAttribute('data-scope', 'project')
  const panel = page.locator('#projectdetail-tabpanel-activity')
  await page.goto(`${URL_OF}?tab=activity&product=${ops.id}`, { waitUntil: 'load' })
  await expect(panel.getByText('Stage (Protocol paper)').first()).toBeVisible({ timeout: 20_000 })
})

for (const theme of ['light', 'dark'] as const) {
  for (const [w, h] of [[1440, 900], [375, 812]] as const) {
    test(`screens ${theme} ${w}`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
      await page.setViewportSize({ width: w, height: h })
      for (const tab of ['files', 'revisions', 'activity']) {
        await page.goto(`${URL_OF}?tab=${tab}&product=${ops.id}`, { waitUntil: 'load' })
        await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
        await page.waitForTimeout(600)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w + 1)
        await page.screenshot({ path: `${SHOTS}/30-${tab}-${theme}-${w}.png`, fullPage: true })
      }
    })
  }
}
