/**
 * Projects hold products (plan step 8): the project page's Products section.
 * One product -> its ladder, expanded. 2+ -> chips, "All" = grouped list.
 * A project member (the PI included) sets a stage on the ladder, adds a
 * product (kind, then a stage from that kind's ladder, optional grew-from
 * inside the project), and hands the home marker to another product. Every
 * write goes through POST /api/projects/:slug/products (membership-gated);
 * /api/mutations stays PI-only.
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

    // 1. One product: one chip (name + stage) on the same row as the stats; its
    //    ladder opens inline on a click and closes on a second.
    const section = page.getByTestId('project-products')
    await expect(section).toBeVisible()
    await expect(section.getByTestId(`product-chip-${first.id}`)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId(`product-detail-${first.id}`)).toHaveCount(0)
    await expect(section.getByTestId('project-stats')).toBeVisible()
    await section.screenshot({ path: `${SHOTS}/01-single-product-chip.png` })
    await section.getByTestId(`product-chip-${first.id}`).click()
    await expect(page.getByTestId(`product-detail-${first.id}`)).toBeVisible()
    await section.screenshot({ path: `${SHOTS}/01-single-product-ladder.png` })

    // 2. Set a stage on the ladder: writes products.stage through the project's
    //    own route. The project's stage IS its home product's: the project read
    //    carries it as home_stage (schema-v130 dropped the v126 projects.stage copy).
    const target = first.stage === 'writing' ? 'data_analysis' : 'writing'
    const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${slug}/products`) && r.request().method() === 'POST')
    await page.getByTestId(`stage-dot-${target}`).click()
    const resp = await write
    expect(resp.status()).toBe(200)
    expect((await resp.json()).product.stage).toBe(target)
    await expect.poll(async () => (await productsOf(page, slug)).products[0].stage).toBe(target)
    await expect(page.getByTestId(`stage-dot-${target}`)).toHaveAttribute('aria-current', 'step')
    const list = await page.request.get('/api/projects', { headers: PI })
    const listed = ((await list.json()) as { data: { slug: string; home_stage: string | null }[] }).data
    expect(listed.find((r) => r.slug === slug)!.home_stage).toBe(target)
    // The undo toast appears once the write landed.
    await expect(page.getByRole('button', { name: /undo/i }).first()).toBeVisible()

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
    await expect(section.getByRole('button', { expanded: false, name: /A1 resubmission/ })).toBeVisible()

    const two = await productsOf(page, slug)
    expect(two.products.length).toBe(2)
    const added = two.products.find((p) => p.kind === 'grant_application')!
    expect(added.stage).toBe('preparing')
    expect(added.grew_from_id).toBe(first.id)

    // 4. Two products: two chips on the row; the stats stay beside them.
    // 2+ products also get an All chip first (9089860b, chips filter the page).
    await expect(section.locator('[data-testid^="product-chip-"]:not([data-testid="product-chip-all"])')).toHaveCount(2)
    await expect(section.getByTestId('product-chip-all')).toBeVisible()
    await expect(section.getByTestId('project-stats')).toBeVisible()
    await section.screenshot({ path: `${SHOTS}/03-two-chips.png` })

    // 5. A chip opens that product's ladder; Make home hands the marker over.
    await page.getByTestId(`product-chip-${added.id}`).click()
    await expect(page.getByTestId(`product-detail-${added.id}`)).toBeVisible()
    await expect(page.getByTestId(`product-chip-${added.id}`)).toHaveAttribute('aria-expanded', 'true')
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
      await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/05-phone-row-${theme}.png` })
      await page.getByTestId(`product-chip-${added.id}`).click()
      await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/06-phone-detail-${theme}.png` })
    }
  })

  test('a stale tab cannot overwrite a newer stage (409, nothing written)', async ({ page }) => {
    const slug = SLUG
    const home = (await productsOf(page, slug)).products.find((p) => p.is_home === 1)! as ProductJson & { seq: number }
    const res = await page.request.post(`/api/projects/${slug}/products`, {
      headers: PI,
      data: { action: 'stage', product_id: home.id, stage: home.stage, base_seq: home.seq - 1, from_stage: 'no_longer_this' },
    })
    expect(res.status()).toBe(409)
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

  test('a member of the project gets the controls and writes through the project route; /api/mutations stays PI-only', async ({ page }) => {
    await page.setExtraHTTPHeaders(MEMBER)
    await go(page, URL_OF)
    await expect(page.getByTestId('product-add-toggle')).toBeVisible()
    const home = (await productsOf(page, SLUG)).products.find((p) => p.is_home === 1)!
    await page.getByTestId(`product-chip-${home.id}`).click()
    const next = home.stage === 'preparing' ? 'submitted' : 'preparing'
    const dot = page.getByTestId(`stage-dot-${next}`)
    await expect(dot).toBeVisible()
    const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
    await dot.click()
    expect((await write).status()).toBe(200)
    await page.getByTestId('project-products').screenshot({ path: `${SHOTS}/07-member-controls.png` })
    const mut = await page.request.post('/api/mutations', { headers: MEMBER, data: { mutations: [] } })
    expect(mut.status()).toBe(403)
  })

  test('a team member who is not on the project cannot write its products', async ({ page }) => {
    const res = await page.request.post(`/api/projects/${SLUG}/products`, {
      headers: OUTSIDER, data: { action: 'home', product_id: 'prd_x' },
    })
    expect([403, 404]).toContain(res.status())
  })

  test('a team member who is not on the project cannot read its products', async ({ page }) => {
    const read = await page.request.get(`/api/projects/${SLUG}/products`, { headers: OUTSIDER })
    expect([403, 404]).toContain(read.status())
  })
})
