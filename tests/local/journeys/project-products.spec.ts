/**
 * Projects hold products (plan step 8): the project page's Products section.
 * One product -> its ladder, expanded. 2+ -> chips, "All" = grouped list.
 * The PI sets a stage on the ladder, adds a product (kind, then a stage from
 * that kind's ladder, optional grew-from inside the project), and hands the
 * home marker to another product. Every write goes through /api/mutations.
 *
 * Runs against the local D1: `npm run test:local:setup`, then
 * `node scripts/run-journey-spec.mjs tests/local/journeys/project-products.spec.ts`.
 * Screenshots land in review/s61/.
 */
import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const MEMBER = { ...KEY, 'X-Test-User': 'nate@umn.edu' }
const OUTSIDER = { ...KEY, 'X-Test-User': 'eddin022@umn.edu' }
// The seeded project, found by title (its slug is minted from the title).
let SLUG = ''
let URL_OF = ''
async function resolveSlug(page: Page): Promise<void> {
  if (SLUG) return
  const res = await page.request.get('/api/projects', { headers: PI })
  const rows = ((await res.json()) as { data: { slug: string; title: string }[] }).data
  const row = rows.find((r) => r.title === 'Sepsis Outcomes Registry')
  expect(row, 'seeded project').toBeTruthy()
  SLUG = row!.slug
  URL_OF = `/portal/projects/${SLUG}`
}

async function go(page: Page, path: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => { if (!/WebSocket|hub-realtime/.test(e.message)) errors.push(e.message) })
  await page.goto(path, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
  return errors
}

const SHOTS = 'review/s61'

interface ProductJson {
  id: string; kind: string; stage: string; short_name: string | null; is_home: number; grew_from_id: string | null
}

async function productsOf(page: Page, slug: string): Promise<{ products: ProductJson[]; kinds: { kind: string; stages: unknown[] }[] }> {
  const res = await page.request.get(`/api/projects/${slug}/products`, { headers: PI })
  expect(res.ok()).toBe(true)
  return res.json()
}


test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
  await resolveSlug(page)
})

test.describe('Project products', () => {
  test('ladder, stage write, add, chips, grouped list, home handoff', async ({ page }) => {
    const slug = SLUG
    const errors = await go(page, URL_OF)
    expect(errors).toEqual([])

    // The Worker sends every kind with its ladder (no copy of the kind data in the client).
    const start = await productsOf(page, slug)
    expect(start.products.length).toBe(1)
    expect(start.kinds.length).toBeGreaterThanOrEqual(7)
    expect(start.kinds.every((k) => k.stages.length > 0)).toBe(true)
    const first = start.products[0]

    // 1. One product: the ladder is expanded, no tabs.
    const section = page.getByTestId('project-products')
    await expect(section).toBeVisible()
    await expect(section.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByTestId(`product-detail-${first.id}`)).toBeVisible()
    await section.scrollIntoViewIfNeeded()
    await section.screenshot({ path: `${SHOTS}/01-single-product-ladder.png` })

    // 2. Set a stage on the ladder: writes products.stage through /api/mutations.
    const target = first.stage === 'writing' ? 'data_analysis' : 'writing'
    const mutation = page.waitForResponse((r) => r.url().endsWith('/api/mutations') && r.request().method() === 'POST')
    await page.getByTestId(`stage-dot-${target}`).click()
    const resp = await mutation
    const results = (await resp.json()).results as { status: string }[]
    expect(results[0].status).toBe('accepted')
    await expect.poll(async () => (await productsOf(page, slug)).products[0].stage).toBe(target)
    await expect(page.getByTestId(`stage-dot-${target}`)).toHaveAttribute('aria-current', 'step')

    // 3. Add a product: kind first, then a stage from THAT kind's ladder, grew-from inside the project.
    await page.getByTestId('product-add-toggle').click()
    await expect(page.getByTestId('product-add-form')).toBeVisible()
    await page.getByTestId('product-add-kind').selectOption('grant_application')
    const stageOptions = await page.getByTestId('product-add-stage').locator('option').allTextContents()
    expect(stageOptions).toEqual(['Preparing', 'Submitted', 'Scored', 'Funded', 'Not funded'])
    await page.getByTestId('product-add-name').fill('A1 resubmission')
    await page.getByTestId('product-add-parent').selectOption(first.id)
    await page.getByTestId('product-add-form').screenshot({ path: `${SHOTS}/02-add-product-form.png` })
    await page.getByTestId('product-add-submit').click()
    await expect(page.getByTestId('product-tab-all')).toBeVisible()

    const two = await productsOf(page, slug)
    expect(two.products.length).toBe(2)
    const added = two.products.find((p) => p.kind === 'grant_application')!
    expect(added.stage).toBe('preparing')
    expect(added.grew_from_id).toBe(first.id)

    // 4. Two products: chips; "All" is the grouped list with one section per kind.
    await expect(section.getByRole('tab')).toHaveCount(3)
    await expect(page.getByTestId('product-all-list')).toBeVisible()
    await expect(page.getByTestId(`product-row-${added.id}`)).toContainText('A1 resubmission')
    await expect(page.getByTestId(`product-row-${added.id}`)).toContainText('from')
    await section.screenshot({ path: `${SHOTS}/03-chips-all-grouped.png` })

    // 5. A chip opens that product's ladder; Make home hands the marker over.
    await page.getByTestId(`product-tab-${added.id}`).click()
    await expect(page.getByTestId(`product-detail-${added.id}`)).toBeVisible()
    await section.screenshot({ path: `${SHOTS}/04-chip-selected-detail.png` })
    await page.getByTestId(`product-make-home-${added.id}`).click()
    await expect.poll(async () => {
      const ps = (await productsOf(page, slug)).products
      return ps.map((p) => `${p.id === added.id ? 'new' : 'old'}:${p.is_home}`).sort().join(',')
    }).toBe('new:1,old:0')

    // 6. Phone width: nothing scrolls sideways; light and dark.
    await page.setViewportSize({ width: 375, height: 812 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
      await go(page, URL_OF)
      await page.getByTestId('project-products').scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
      await page.getByTestId('product-tab-all').click()
      await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/05-phone-all-${theme}.png` })
      await page.getByTestId(`product-tab-${added.id}`).click()
      await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/06-phone-detail-${theme}.png` })
    }
  })

  test('a refused write names the reason and the stage rolls back', async ({ page }) => {
    const slug = SLUG
    await go(page, URL_OF)
    const before = (await productsOf(page, slug)).products
    const home = before.find((p) => p.is_home === 1) ?? before[0]
    // The server refuses an off-ladder stage (composite FK); force one the ladder would never offer.
    const res = await page.request.post('/api/mutations', {
      headers: PI,
      data: {
        mutations: [{
          mutation_id: 'mut_01K00000000000000000000000', origin_machine: 'hub_ui:test', table: 'products', op: 'update',
          record_id: home.id, base_seq: null, base_row_hash: null, patch: { stage: 'no_such_stage' },
          client_ts: new Date().toISOString(), issued_at: new Date().toISOString(),
        }],
      },
    })
    const status = ((await res.json()).results as { status: string }[])[0].status
    expect(status).not.toBe('accepted')
    const after = (await productsOf(page, slug)).products.find((p) => p.id === home.id)!
    expect(after.stage).toBe(home.stage)
  })
})

test.describe('Who sees and who writes', () => {
  const member = (sql: string) => localD1(sql)
  test.beforeAll(() => {
    member(`INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) SELECT id, 'nate-mesfin', 'test' FROM projects WHERE slug = '${SLUG}'`)
  })
  test.afterAll(() => {
    member(`DELETE FROM project_members WHERE member_slug = 'nate-mesfin' AND project_id IN (SELECT id FROM projects WHERE slug = '${SLUG}')`)
  })

  test('a member sees the products with no controls; the write endpoint stays PI-only', async ({ page }) => {
    await page.setExtraHTTPHeaders(MEMBER)
    await go(page, URL_OF)
    await expect(page.getByTestId('product-add-toggle')).toHaveCount(0)
    await expect(page.locator('[data-testid^="stage-dot-"]')).toHaveCount(0)
    await expect(page.getByTestId('project-products')).toContainText('Products')
    await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/07-member-read-only.png` })
    const read = await page.request.get(`/api/projects/${SLUG}/products`, { headers: MEMBER })
    expect(read.status()).toBe(200)
    const write = await page.request.post('/api/mutations', { headers: MEMBER, data: { mutations: [] } })
    expect(write.status()).toBe(403)
  })

  test('a team member who is not on the project cannot read its products', async ({ page }) => {
    const read = await page.request.get(`/api/projects/${SLUG}/products`, { headers: OUTSIDER })
    expect([403, 404]).toContain(read.status())
  })
})
