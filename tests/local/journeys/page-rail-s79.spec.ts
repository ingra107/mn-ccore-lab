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
