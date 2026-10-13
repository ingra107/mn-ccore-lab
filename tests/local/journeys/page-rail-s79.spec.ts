/**
 * s79 (Nick, 2026-10-12): the main + rail pages share <PageWithRail>.
 *   Meeting A (rail right), Member B (rail left, 320px), Manuscripts A (List view
 *   rail), Grants B (no rail; stat row + toggle). Project is the template.
 *
 * Also the stack-point evidence: the band stacks at 860px (index.css "PageWithRail"),
 * measured at 1000/1100/1200/1280 viewport.
 *
 * Run: node scripts/run-journey-spec.mjs --gate tests/local/journeys/page-rail-s79.spec.ts
 * Screenshots: review/s79/ (gitignored): <page>-<width>-<theme>.png
 */
import { test, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

const PI = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s79'
const WIDTHS = [1440, 1100, 375] as const
const THEMES = ['light', 'dark'] as const

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

async function visit(page: Page, path: string, theme: string, w: number, ready: string) {
  await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
  await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 })
  await page.goto(path, { waitUntil: 'load' })
  await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 20_000 })
}

async function bandAndColumns(page: Page) {
  return page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)?.getBoundingClientRect()
    const band = r('.pwr-band'), main = r('.pwr-main'), rail = r('.pwr-rail')
    return {
      band: Math.round(band?.width ?? 0), main: Math.round(main?.width ?? 0),
      railX: rail ? Math.round(rail.x) : null, railW: rail ? Math.round(rail.width) : null,
      mainX: main ? Math.round(main.x) : null, railY: rail ? Math.round(rail.y) : null, mainY: main ? Math.round(main.y) : null,
      sw: document.documentElement.scrollWidth,
    }
  })
}

let meetingId = ''

test('stack point: 860px of band. Project stacks at 1100 and 1200, two columns at 1000 and 1280', async ({ page }) => {
  const seen: Record<number, unknown> = {}
  for (const [w, stacked] of [[1000, false], [1100, true], [1200, true], [1280, false]] as const) {
    await visit(page, '/portal/projects/sepsis_outcomes_reg', 'light', w, 'project-grid')
    const m = await bandAndColumns(page)
    seen[w] = m
    expect(m.railX! > m.mainX! + m.main - 1, `${w}px two columns`).toBe(!stacked)
    expect(m.sw, `${w}px no sideways scroll`).toBeLessThanOrEqual(w + 1)
    await page.screenshot({ path: `${SHOTS}/stack-project-${w}.png` })
  }
  console.log('STACK', JSON.stringify(seen))
})

test('meeting: action items and notes lead the main column, metadata in the rail', async ({ page }) => {
  const res = await page.request.get('/api/meetings', { headers: PI })
  meetingId = (await res.json()).data[0].id as string
  await visit(page, `/portal/meetings/${meetingId}`, 'light', 1440, 'meeting-grid')
  const rail = page.getByTestId('meeting-rail')
  const m = await bandAndColumns(page)
  expect(m.railX!).toBeGreaterThan(m.mainX! + m.main - 1)
  expect(m.railW!).toBeLessThanOrEqual(322)
  // Date, attendees, projects and files are in the rail; the work is in main.
  await expect(rail.getByTestId('meeting-when')).toBeVisible()
  await expect(rail.getByText('Attendees', { exact: true })).toBeVisible()
  await expect(rail.getByText('Files', { exact: true })).toBeVisible()
  await expect(page.getByTestId('meeting-controls').getByRole('link', { name: /Prep view/ })).toBeVisible()
  await expect(page.getByTestId('meeting-controls').getByRole('button', { name: /Copy summary/ })).toBeVisible()
  // Action items first, then notes, then agenda, decisions.
  const y = async (name: string) => (await page.getByRole('heading', { name, exact: true }).first().boundingBox())!.y
  const [a, n, g, d] = [await y('Action items'), await y('Meeting notes'), await y('Agenda'), await y('Decisions')]
  expect(a).toBeLessThan(n)
  expect(n).toBeLessThan(g)
  expect(g).toBeLessThan(d)
  // The work starts near the top: the action items head sits within 260px of the title.
  const h1 = (await page.locator('h1').first().boundingBox())!
  expect(a - h1.y).toBeLessThan(260)
})

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    test(`shots: meeting ${w} ${theme}`, async ({ page }) => {
      await visit(page, `/portal/meetings/${meetingId}`, theme, w, 'meeting-grid')
      const m = await bandAndColumns(page)
      expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
      if (w === 375) expect(m.railY!).toBeGreaterThan(m.mainY!)
      await page.screenshot({ path: `${SHOTS}/meeting-${w}-${theme}.png`, fullPage: w === 375 })
    })
  }
}

test('member: profile rail on the left at 320px, "On this page" kept', async ({ page }) => {
  await visit(page, '/portal/team/nick-ingraham', 'light', 1440, 'member-grid')
  const m = await bandAndColumns(page)
  expect(m.railW!).toBeLessThanOrEqual(322)
  expect(m.railX!).toBeLessThan(m.mainX!)
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible()
  // Stacked, the profile still leads and the nav is gone.
  await visit(page, '/portal/team/nick-ingraham', 'light', 1100, 'member-grid')
  const s = await bandAndColumns(page)
  expect(s.railY!).toBeLessThan(s.mainY!)
  await expect(page.getByRole('navigation', { name: 'On this page' })).toBeHidden()
})

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    test(`shots: member ${w} ${theme}`, async ({ page }) => {
      await visit(page, '/portal/team/nick-ingraham', theme, w, 'member-grid')
      const m = await bandAndColumns(page)
      expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
      await page.screenshot({ path: `${SHOTS}/member-${w}-${theme}.png` })
    })
  }
}

test('manuscripts: List view rail holds attention, submissions and the stage tally; Pipeline is full width', async ({ page }) => {
  await visit(page, '/portal/manuscripts', 'light', 1440, 'data-page-grid')
  const rail = page.getByTestId('data-page-rail')
  const m = await bandAndColumns(page)
  expect(m.railX!).toBeGreaterThan(m.mainX! + m.main - 1)
  expect(m.railW!).toBeLessThanOrEqual(322)
  await expect(rail.getByText(/needs your attention/i)).toBeVisible()
  await expect(rail.getByTestId('manuscripts-stage-tally')).toBeVisible()
  await expect(page.locator('#manuscripts-table')).toBeVisible()
  await page.getByRole('tab', { name: 'Pipeline' }).click()
  await expect(page.getByTestId('data-page-rail')).toHaveCount(0)
  await expect(page.getByText(/needs your attention/i).first()).toBeVisible()
})

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    test(`shots: manuscripts ${w} ${theme}`, async ({ page }) => {
      await visit(page, '/portal/manuscripts', theme, w, 'data-page-grid')
      const m = await bandAndColumns(page)
      expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
      await page.screenshot({ path: `${SHOTS}/manuscripts-${w}-${theme}.png` })
    })
  }
}

test('grants: no rail; the stat row and the segmented toggle replace the hand-drawn tabs', async ({ page }) => {
  await visit(page, '/portal/grants', 'light', 1440, 'grant-stats')
  await expect(page.locator('.pwr-rail')).toHaveCount(0)
  await expect(page.getByTestId('grant-stats')).toContainText('Active')
  const toggle = page.getByRole('tablist', { name: 'Grants sections' })
  await expect(toggle).toHaveClass(/tk-seg/)
  // 44px targets on the toggle at phone width.
  await visit(page, '/portal/grants', 'light', 375, 'grant-stats')
  for (const name of ['My Grants', 'Post-Award', 'NIH RePORTER']) {
    const b = (await page.getByRole('tab', { name }).boundingBox())!
    expect(b.height, `${name} tap height`).toBeGreaterThanOrEqual(44)
  }
})

for (const theme of THEMES) {
  for (const w of WIDTHS) {
    test(`shots: grants ${w} ${theme}`, async ({ page }) => {
      await visit(page, '/portal/grants', theme, w, 'grant-stats')
      const m = await bandAndColumns(page)
      expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
      await page.screenshot({ path: `${SHOTS}/grants-${w}-${theme}.png` })
    })
  }
}

test('meeting on a phone: date and attendees lead in the head; at 1440 they stay in the rail', async ({ page }) => {
  await visit(page, `/portal/meetings/${meetingId}`, 'light', 1100, 'meeting-grid')
  const compact = page.getByTestId('meeting-meta-compact')
  await expect(compact).toBeVisible()
  const c = (await compact.boundingBox())!
  const a = (await page.getByRole('heading', { name: 'Action items', exact: true }).first().boundingBox())!
  expect(c.y).toBeLessThan(a.y)
  await expect(page.getByRole('heading', { name: 'When', exact: true })).toBeVisible()
  await visit(page, `/portal/meetings/${meetingId}`, 'light', 1440, 'meeting-grid')
  await expect(page.getByTestId('meeting-meta-compact')).toBeHidden()
})

test('manuscripts stacked: the rail (Needs your attention) comes before the rows', async ({ page }) => {
  await visit(page, '/portal/manuscripts', 'light', 1100, 'data-page-grid')
  const rail = (await page.getByTestId('data-page-rail').boundingBox())!
  const rows = (await page.locator('#manuscripts-table').boundingBox())!
  expect(rail.y).toBeLessThan(rows.y)
})

const PUBLIC_ROUTES = ['/team/nick-ingraham', '/team/nate-mesfin'] as const

test('public profile pages: rail 320px on the left, capped band, sticky rail clears the fixed nav', async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await visit(page, route, 'light', 1440, 'member-grid')
    const m = await bandAndColumns(page)
    expect(m.railW!, `${route} rail width`).toBeLessThanOrEqual(322)
    expect(m.railX!, `${route} rail left`).toBeLessThan(m.mainX!)
    expect(m.band, `${route} band capped at --page-width`).toBeLessThanOrEqual(1280)
    await page.mouse.wheel(0, 700)
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
    const navBottom = await page.evaluate(() => document.querySelector('nav[aria-label="Main navigation"]')!.getBoundingClientRect().bottom)
    const railTop = (await page.getByTestId('member-rail').boundingBox())!.y
    // A rail taller than the page is not stuck; only a stuck one is measured.
    if (railTop > 0) expect(railTop, `${route} rail top vs nav bottom ${navBottom}`).toBeGreaterThanOrEqual(navBottom)
  }
})

for (const route of PUBLIC_ROUTES) {
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      test(`shots: public ${route} ${w} ${theme}`, async ({ page }) => {
        await visit(page, route, theme, w, 'member-grid')
        const m = await bandAndColumns(page)
        expect(m.sw, 'no sideways scroll').toBeLessThanOrEqual(w + 1)
        await page.screenshot({ path: `${SHOTS}/public-${route.replace(/\//g, '_').slice(1)}-${w}-${theme}.png` })
      })
    }
  }
}
