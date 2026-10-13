/**
 * A product's event date and Nick's role (schema-v135; Nick 2026-10-12: "Go
 * now; add proper date + role fields next").
 *   The Abstracts and Talks tabs list newest event first, show the date at
 *   the precision the source gave ("May 2019") and Nick's part ("First author,
 *   presenter"), and filter by role (presenter, first, senior, middle; ?role=
 *   links a filter). A delivered talk's card shows its date, never "Due". The
 *   project page's product detail edits both fields through the member route.
 *
 *   node scripts/run-journey-spec.mjs --gate tests/local/journeys/product-event-role.spec.ts
 * Screenshots land in review/s79/.
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s79'
const PROJECT_TITLE = 'Ventilator Practice Variation'

interface ProductJson {
  id: string; kind: string; stage: string; short_name: string | null; seq: number
  due_date: string | null; event_date: string | null; nick_author_position: string | null; nick_event_role: string | null
}

// name -> [kind, stage, event_date, position, role, due_date]
const ITEMS: Record<string, [string, string, string | null, string | null, string | null, string | null]> = {
  'EVR ATS 2019 poster': ['abstract', 'presented', '2019-05', 'first', 'presenter', null],
  'EVR SCCM 2024 abstract': ['abstract', 'presented', '2024-01-21', 'senior', null, null],
  'EVR CHEST 2021 abstract': ['abstract', 'presented', '2021', 'middle', null, null],
  'EVR ATS 2022 co-first': ['abstract', 'presented', '2022-05', 'co_first', null, null],
  'EVR Grand rounds': ['talk', 'delivered', null, null, 'presenter', '2024-02-11'],
}

let SLUG = ''
async function resolve(page: Page): Promise<void> {
  if (SLUG) return
  const res = await page.request.get('/api/projects', { headers: PI })
  const rows = ((await res.json()) as { data: { slug: string; title: string }[] }).data
  const row = rows.find((r) => r.title === PROJECT_TITLE)
  expect(row, 'seeded project').toBeTruthy()
  SLUG = row!.slug
}
async function productsOf(page: Page): Promise<ProductJson[]> {
  const res = await page.request.get(`/api/projects/${SLUG}/products`, { headers: PI })
  return ((await res.json()) as { products: ProductJson[] }).products
}
async function ensure(page: Page): Promise<void> {
  for (const [name, [kind, stage, date, pos, role, due]] of Object.entries(ITEMS)) {
    let p = (await productsOf(page)).find((x) => x.short_name === name)
    if (!p) {
      const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data: { action: 'add', kind, stage, name } })
      expect(r.status(), `add ${name}`).toBe(200)
      p = (await productsOf(page)).find((x) => x.short_name === name)!
    }
    const want = { event_date: date, nick_author_position: pos, nick_event_role: role, due_date: due }
    const fields = Object.fromEntries(Object.entries(want).filter(([k, v]) => p![k as keyof ProductJson] !== v))
    if (Object.keys(fields).length === 0) continue
    const r = await page.request.post(`/api/projects/${SLUG}/products`, { headers: PI, data: { action: 'terms', product_id: p.id, fields } })
    expect(r.status(), `terms ${name}`).toBe(200)
  }
}
const idOf = async (page: Page, name: string) => (await productsOf(page)).find((p) => p.short_name === name)!.id

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
  await resolve(page)
  await ensure(page)
})

test('Abstracts: newest event first, the date at its own precision, Nick\'s role in words', async ({ page }) => {
  await page.goto('/portal/manuscripts?kind=abstract', { waitUntil: 'load' })
  await expect(page.getByTestId('product-kind-list')).toBeVisible({ timeout: 20_000 })
  const mine = ['EVR SCCM 2024 abstract', 'EVR ATS 2022 co-first', 'EVR CHEST 2021 abstract', 'EVR ATS 2019 poster']
  const ids = await Promise.all(mine.map((n) => idOf(page, n)))
  const order = await page.locator('[data-testid^="kind-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.slice('kind-row-'.length)))
  expect(order.filter((id) => ids.includes(id)), 'newest first').toEqual(ids)
  await expect(page.getByTestId(`kind-date-${ids[3]}`)).toHaveText('May 2019')
  await expect(page.getByTestId(`kind-date-${ids[2]}`)).toHaveText('2021')
  await expect(page.getByTestId(`kind-date-${ids[0]}`)).toHaveText('Jan 21, 2024')
  await expect(page.getByTestId(`kind-role-${ids[3]}`)).toHaveText('First author, presenter')
  await expect(page.getByTestId(`kind-role-${ids[0]}`)).toHaveText('Senior author')
  await page.screenshot({ path: `${SHOTS}/01-abstracts-newest-first.png`, fullPage: true })
})

test('the role filter narrows the tab, and ?role= links it', async ({ page }) => {
  await page.goto('/portal/manuscripts?kind=abstract', { waitUntil: 'load' })
  const filter = page.getByTestId('product-role-filter')
  await expect(filter).toBeVisible({ timeout: 20_000 })
  const poster = await idOf(page, 'EVR ATS 2019 poster')
  const cofirst = await idOf(page, 'EVR ATS 2022 co-first')
  const senior = await idOf(page, 'EVR SCCM 2024 abstract')
  const middle = await idOf(page, 'EVR CHEST 2021 abstract')

  await filter.getByRole('button', { name: /^Presenter/ }).click()
  await expect(page).toHaveURL(/[?&]role=presenter/)
  await expect(page.getByTestId(`kind-row-${poster}`)).toBeVisible()
  for (const id of [cofirst, senior, middle]) await expect(page.getByTestId(`kind-row-${id}`)).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/02-filter-presenter.png`, fullPage: true })

  await filter.getByRole('button', { name: /^First/ }).click()
  await expect(page).toHaveURL(/[?&]role=first/)
  for (const id of [poster, cofirst]) await expect(page.getByTestId(`kind-row-${id}`)).toBeVisible()
  for (const id of [senior, middle]) await expect(page.getByTestId(`kind-row-${id}`)).toHaveCount(0)

  await page.goto('/portal/manuscripts?kind=abstract&role=middle', { waitUntil: 'load' })
  await expect(page.getByTestId(`kind-row-${middle}`)).toBeVisible({ timeout: 20_000 })
  for (const id of [poster, cofirst, senior]) await expect(page.getByTestId(`kind-row-${id}`)).toHaveCount(0)
  await expect(page.getByTestId('product-role-filter').getByRole('button', { name: /^Middle/ })).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('product-role-filter').getByRole('button', { name: 'Any role' }).click()
  await expect(page).not.toHaveURL(/[?&]role=/)
  for (const id of [poster, cofirst, senior, middle]) await expect(page.getByTestId(`kind-row-${id}`)).toBeVisible()
})

test('a delivered talk shows its date, never "Due"', async ({ page }) => {
  await page.goto('/portal/manuscripts?kind=talk', { waitUntil: 'load' })
  const talk = await idOf(page, 'EVR Grand rounds')
  await expect(page.getByTestId(`kind-date-${talk}`)).toHaveText('Feb 11, 2024', { timeout: 20_000 })
  await expect(page.getByTestId(`kind-row-${talk}`)).not.toContainText('Due')
  await expect(page.getByTestId(`kind-role-${talk}`)).toHaveText('Presenter')
})

test('the project page edits the date and the role; the card reads them back', async ({ page }) => {
  const talk = await idOf(page, 'EVR Grand rounds')
  // ?product= selects the chip (2+ products), which opens its detail.
  await page.goto(`/portal/projects/${SLUG}?product=${talk}`, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
  const detail = page.getByTestId(`product-detail-${talk}`)
  await expect(detail).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId(`product-facts-${talk}`)).toContainText('Feb 11, 2024')
  await expect(page.getByTestId(`product-facts-${talk}`)).not.toContainText('Due')

  await page.getByTestId(`product-event-edit-${talk}`).click()
  const form = page.getByTestId(`product-event-form-${talk}`)
  await form.getByTestId('product-event-date').fill('2024-13')
  await expect(form.getByTestId('product-event-save')).toBeDisabled()
  await form.getByTestId('product-event-date').fill('2024-02')
  await form.getByTestId('product-event-position').selectOption('senior')
  await form.getByTestId('product-event-role').selectOption('moderator')
  await page.screenshot({ path: `${SHOTS}/03-project-edit-form.png` })
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/projects/${SLUG}/products`) && r.request().method() === 'POST')
  await form.getByTestId('product-event-save').click()
  expect((await write).status()).toBe(200)
  await expect.poll(async () => {
    const p = (await productsOf(page)).find((x) => x.id === talk)!
    return [p.event_date, p.nick_author_position, p.nick_event_role]
  }).toEqual(['2024-02', 'senior', 'moderator'])
  await expect(page.getByTestId(`product-facts-${talk}`)).toContainText('Feb 2024')
  await expect(page.getByTestId(`product-facts-${talk}`)).toContainText('Nick: Senior author, moderator')
  await page.screenshot({ path: `${SHOTS}/04-project-card-after-edit.png` })

  // Put it back so a re-run starts where this one did.
  const p = (await productsOf(page)).find((x) => x.id === talk)!
  const r = await page.request.post(`/api/projects/${SLUG}/products`, {
    headers: PI,
    data: { action: 'terms', product_id: talk, fields: { event_date: null, nick_author_position: null, nick_event_role: 'presenter' }, base_seq: p.seq,
      from: { event_date: '2024-02', nick_author_position: 'senior', nick_event_role: 'moderator' } },
  })
  expect(r.status()).toBe(200)
})

test('phone width, light and dark: the tab with its date and role columns fits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const theme of ['light', 'dark']) {
    await page.goto('/portal/manuscripts', { waitUntil: 'load' })
    await page.evaluate((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
    await page.goto('/portal/manuscripts?kind=abstract', { waitUntil: 'load' })
    await expect(page.getByTestId('product-kind-list')).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
    const poster = await idOf(page, 'EVR ATS 2019 poster')
    const box = await page.getByTestId(`kind-role-${poster}`).boundingBox()
    expect(box!.x + box!.width, 'role inside the screen').toBeLessThanOrEqual(375)
    await page.screenshot({ path: `${SHOTS}/05-abstracts-phone-${theme}.png`, fullPage: true })
  }
})
