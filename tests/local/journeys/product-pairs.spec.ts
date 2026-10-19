/**
 * Project ~ Product pairs (Nick, 2026-10-12). A product chip on the project
 * page is a FILTER (?product=); tasks carry product_id; every project picker
 * offers "Project ~ Product" pairs for a project with 2+ products.
 *
 *   node scripts/run-journey-spec.mjs tests/local/journeys/product-pairs.spec.ts
 *
 * Screenshots land in review/s72/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s72'
const SLUG = 'adhere-lpv-trial'
const URL_OF = `/portal/projects/${SLUG}`

interface Prod { id: string; kind: string; short_name: string | null; is_home: number }
interface TaskJson { id: string; title: string; project_id: string | null; product_id: string | null }

let home: Prod, ops: Prod, paper: Prod

async function products(page: Page): Promise<Prod[]> {
  const r = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await r.json()) as { products: Prod[] }).products
}
async function tasksOf(page: Page): Promise<TaskJson[]> {
  const r = await page.request.get(`/api/tasks?project=${SLUG}`, { headers: PI })
  return ((await r.json()) as { data: TaskJson[] }).data
}
async function mk(page: Page, title: string, product: Prod | null, due?: string) {
  const r = await page.request.post('/api/tasks', {
    headers: PI,
    data: { title, description: title, assignee: 'nick-ingraham', project_id: SLUG, ...(product ? { product_id: product.id } : {}), ...(due ? { due_date: due } : {}) },
  })
  expect(r.ok(), await r.text()).toBe(true)
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

test('seed an ADHERE-style project with three products and tasks on each', async ({ page }) => {
  const made = await page.request.post('/api/projects', { headers: PI, data: { title: 'ADHERE-LPV Trial', slug: SLUG, category: 'lab' } })
  expect(made.ok(), await made.text()).toBe(true)
  // The rule is short names everywhere: the pair label uses the short name, not the title.
  const named = await page.request.post(`/api/projects/${SLUG}`, { headers: PI, data: { short_name: 'ADHERE-LPV' } })
  expect(named.ok(), await named.text()).toBe(true)
  for (const [kind, stage, name] of [['trial_ops', 'active', 'Trial ops'], ['manuscript', 'idea', 'Protocol paper']]) {
    const k = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
    const stages = ((await k.json()) as { kinds: { kind: string; stages: { stage: string }[] }[] }).kinds.find((x) => x.kind === kind)!.stages
    const use = stages.some((s) => s.stage === stage) ? stage : stages[0].stage
    const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data: { action: 'add', kind, stage: use, name } })
    expect(r.ok(), await r.text()).toBe(true)
  }
  const ps = await products(page)
  expect(ps.length).toBe(3)
  home = ps.find((p) => p.is_home === 1)!
  ops = ps.find((p) => p.short_name === 'Trial ops')!
  paper = ps.find((p) => p.short_name === 'Protocol paper')!
  await mk(page, 'PAIR ops overdue', ops, '2020-01-01')
  await mk(page, 'PAIR ops open', ops, '2099-01-01')
  await mk(page, 'PAIR home draft', home)
  await mk(page, 'PAIR paper edits', paper)
  const ts = await tasksOf(page)
  expect(ts.find((t) => t.title === 'PAIR ops overdue')!.product_id).toBe(ops.id)
  // No product named: the v125 home rule puts it on the home product.
  await mk(page, 'PAIR no product named', null)
  expect((await tasksOf(page)).find((t) => t.title === 'PAIR no product named')!.product_id).toBe(home.id)
})

test('a product chip filters open tasks, the Tasks tab and the stats; the URL keeps it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL_OF, { waitUntil: 'load' })
  const section = page.getByTestId('project-products')
  await expect(section).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('product-chip-all')).toHaveAttribute('aria-pressed', 'true')

  const open = page.getByTestId('project-open-tasks')
  await expect(open).toContainText('PAIR ops overdue')
  await expect(open).toContainText('PAIR paper edits')
  const stats = page.getByTestId('project-stats')
  await expect(stats.getByLabel('5 active')).toBeVisible()
  await expect(stats.getByLabel('1 overdue')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-all-light-1440.png` })

  await page.getByTestId(`product-chip-${ops.id}`).click()
  await expect(page).toHaveURL(new RegExp(`product=${ops.id}`))
  await expect(page.getByTestId(`product-detail-${ops.id}`)).toBeVisible()
  await expect(open).toContainText('PAIR ops overdue')
  await expect(open).toContainText('PAIR ops open')
  await expect(open).not.toContainText('PAIR paper edits')
  await expect(open).not.toContainText('PAIR home draft')
  await expect(stats.getByLabel('2 active')).toBeVisible()
  await expect(stats.getByLabel('1 overdue')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/02-trial-ops-filtered-light-1440.png` })

  // Reload keeps the selection.
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('project-open-tasks')).not.toContainText('PAIR paper edits')

  // The Tasks tab follows the chip, and a row names its pair.
  await page.getByRole('tab', { name: /^Tasks/ }).click()
  const panel = page.locator('#projectdetail-tabpanel-tasks')
  await expect(panel).toContainText('PAIR ops overdue')
  await expect(panel).not.toContainText('PAIR paper edits')
  await expect(panel).toContainText('ADHERE-LPV ~ Trial ops')
  await expect(panel).not.toContainText('ADHERE-LPV Trial ~')

  // All clears it.
  await page.getByTestId('product-chip-all').click()
  await expect(page).not.toHaveURL(/product=/)
  await page.getByRole('tab', { name: /^Overview/ }).click()
  await expect(page.getByTestId('project-open-tasks')).toContainText('PAIR paper edits')
})

test('+ Add task while filtered lands on that product; the picker moves a task to a pair', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${URL_OF}?product=${paper.id}`, { waitUntil: 'load' })
  await expect(page.getByTestId(`product-chip-${paper.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  await page.getByRole('button', { name: '+ Add task' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('ADHERE-LPV ~ Manuscript: Protocol paper')
  await dialog.screenshot({ path: `${SHOTS}/03-add-task-preselected-pair.png` })
  await dialog.getByRole('textbox').first().fill('PAIR made while filtered')
  await dialog.getByRole('button', { name: /^(Create|Add)/ }).last().click()
  await expect.poll(async () => (await tasksOf(page)).find((t) => t.title === 'PAIR made while filtered')?.product_id).toBe(paper.id)

  // Move 'PAIR ops overdue' (always first in the list) from Trial ops to the Protocol paper pair
  // through the picker: a same-project pair move, so both ids are written.
  await page.getByTestId('product-chip-all').click()
  const row = page.getByTestId('project-open-tasks').getByText('PAIR ops overdue').first()
  await row.click()
  await page.screenshot({ path: `${SHOTS}/03b-row-opened.png` })
  await page.locator('[aria-label="Project"]').first().click()
  const option = page.getByRole('option', { name: 'ADHERE-LPV ~ Manuscript: Protocol paper' })
  await expect(option).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/04-pair-picker-light-1440.png` })
  await option.click()
  await expect.poll(async () => {
    const t = (await tasksOf(page)).find((x) => x.title === 'PAIR ops overdue')
    return t ? `${t.project_id}|${t.product_id}` : ''
  }).toBe(`${SLUG}|${paper.id}`)
})

for (const theme of ['light', 'dark'] as const) {
  for (const [w, h] of [[1440, 900], [375, 812]] as const) {
    test(`screens ${theme} ${w}`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`${URL_OF}?product=${ops.id}`, { waitUntil: 'load' })
      await expect(page.getByTestId(`product-chip-${ops.id}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w + 1)
      await page.screenshot({ path: `${SHOTS}/10-filtered-${theme}-${w}.png` })
    })
  }
}
