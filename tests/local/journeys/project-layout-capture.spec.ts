/**
 * Project page layout mockups (?layout=a|b), Nick 2026-10-12. Capture only:
 * seeds R03 (two products) next to the seeded single-product project, then
 * screenshots current / A / B in light and dark at 1440 and 375 into
 * review/s69/. Phase 2 replaces this with real assertions.
 *
 * Run: node scripts/run-journey-spec.mjs tests/local/journeys/project-layout-capture.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'
import { installWebSocketStub } from '../../setup/websocket-stub'

const KEY = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = { ...KEY, 'X-Test-User': 'ingra107@umn.edu' }
const SHOTS = 'review/s69'
const SINGLE = 'sepsis_outcomes_reg'
// Same slug as the row in src/data/projects.ts, so dev and prod builds agree.
const R03_TITLE = 'R03: Decision-Making Styles of Medical Trainees'
let R03 = 'decision-making-styles-of-medical'

async function api(page: Page, method: 'GET' | 'POST', path: string, data?: unknown) {
  const res = await page.request.fetch(path, { method, headers: PI, data })
  return res
}

test.describe.configure({ mode: 'serial' })

const only = (k: string) => !process.env.CAP || process.env.CAP.split(',').includes(k)

test('seed R03', async ({ page }) => {
  test.skip(!only('seed'))
  let rows = ((await (await api(page, 'GET', '/api/projects')).json()) as { data: { slug: string; title: string }[] }).data
  let row = rows.find((r) => r.title === R03_TITLE)
  if (!row) {
    const created = await api(page, 'POST', '/api/projects', { title: R03_TITLE, slug: R03, category: 'lab' })
    expect(created.ok(), await created.text()).toBe(true)
    rows = ((await (await api(page, 'GET', '/api/projects')).json()) as { data: { slug: string; title: string }[] }).data
    row = rows.find((r) => r.title === R03_TITLE)
  }
  expect(row).toBeTruthy()
  R03 = row!.slug
  localD1(`UPDATE projects SET deleted_at = datetime('now') WHERE slug = 'r03-decision-making-styles-of-medical-trainees'`)
  const prods = (await (await api(page, 'GET', `/api/projects/${R03}/products`)).json()) as { products: { kind: string }[] }
  if (prods.products.length < 2) {
    for (const [kind, stage, name] of [['grant_application', 'submitted', 'R03'], ['manuscript', 'writing', 'Aim 1 paper']] as const) {
      if (prods.products.some((p) => p.kind === kind)) continue
      const r = await api(page, 'POST', `/api/projects/${R03}/products`, { action: 'add', kind, stage, name })
      expect(r.ok(), await r.text()).toBe(true)
    }
  }
  localD1(`UPDATE projects SET primary_folder = 'C:/Users/ingra107/Box/Research/R03', description = 'Measures how trainees differ in decision-making style and whether style predicts ventilator management choices in simulated cases.', strategic_context = 'Pilot data for the DP2. Submitted Oct 5; score expected in March.', key_link_1 = 'https://docs.google.com/document/d/abc/edit', key_link_1_desc = 'Specific Aims', key_link_2 = 'https://docs.google.com/spreadsheets/d/def/edit', key_link_2_desc = 'Recruitment tracker' WHERE slug = '${R03}'`)
  localD1(`UPDATE projects SET primary_folder = 'C:/Users/ingra107/Box/Research/Sepsis' WHERE slug = '${SINGLE}'`)
  const mk = async (title: string, due: string | null) => {
    const r = await api(page, 'POST', '/api/tasks', { description: title, title, project_id: R03, assignee: 'nick-ingraham', due_date: due, priority: 'medium' })
    expect(r.ok(), await r.text()).toBe(true)
  }
  const d = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const existing = ((await (await api(page, 'GET', `/api/tasks?project=${R03}`)).json()) as { data: unknown[] }).data
  if (existing.length === 0) {
    await mk('Send revised budget to Amy', d(-2))
    await mk('Pilot the GDMS survey with 5 fellows', d(3))
    await mk('Draft Aim 2 power calculation', d(9))
    await mk('IRB amendment for the new site', d(14))
    await mk('Export recruitment numbers for the tracker', null)
    await api(page, 'POST', `/api/projects/${R03}/updates`, { content: 'Lianne added ICC 0.05 numbers to the power section.', update_type: 'progress' })
    await api(page, 'POST', `/api/projects/${R03}/updates`, { content: 'Waiting on the IRB amendment before the next pilot wave.', update_type: 'progress' })
  }
})

async function shoot(page: Page, slug: string, layout: string | null, theme: 'light' | 'dark', w: number, h: number, name: string, full = false) {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript((t) => window.localStorage.setItem('mn-ccore-theme', t), theme)
  await page.goto(`/portal/projects/${slug}${layout ? `?layout=${layout}` : ''}`, { waitUntil: 'load' })
  await expect(page.getByTestId('project-products')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
  await page.setExtraHTTPHeaders(PI)
})

for (const [label, getSlug] of [['r03', () => R03], ['single', () => SINGLE]] as const) {
  for (const layout of [null, 'a', 'b'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      if (!only(`${label}-${layout ?? 'current'}`)) continue
      test(`${label} ${layout ?? 'current'} ${theme} desktop+phone`, async ({ page }) => {
        const slug = getSlug()
        const tag = `${label}-${layout ?? 'current'}-${theme}`
        await shoot(page, slug, layout, theme, 1440, 900, `${tag}-1440`)
        if (theme === 'light') await page.screenshot({ path: `${SHOTS}/${tag}-1440-full.png`, fullPage: true })
        await shoot(page, slug, layout, theme, 375, 812, `${tag}-375`)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(376)
      })
    }
  }
}

test('folder panel states (hover pencil, editor, no launcher)', async ({ page }) => {
  test.skip(!only('folder'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/portal/projects/${R03}?layout=a`, { waitUntil: 'load' })
  const rail = page.getByTestId('project-rail')
  await expect(rail).toBeVisible({ timeout: 20_000 })
  const folder = page.getByTestId('project-folder')
  await expect(folder.getByRole('button', { name: 'Open folder' })).toBeVisible()
  await folder.screenshot({ path: `${SHOTS}/folder-1-rest.png` })
  await folder.getByRole('button', { name: 'Open folder' }).hover()
  await page.waitForTimeout(300)
  await folder.screenshot({ path: `${SHOTS}/folder-2-hover-pencil.png` })
  await folder.getByTestId('project-folder-edit').click()
  await folder.screenshot({ path: `${SHOTS}/folder-3-editor.png` })
  await page.getByTestId('project-folder-input').fill('https://box.com/x')
  await page.getByTestId('project-folder-save').click()
  await folder.screenshot({ path: `${SHOTS}/folder-4-bad-paste.png` })
  await page.getByRole('button', { name: 'Cancel' }).first().click()
  // A computer without the launcher: one link in place of the buttons.
  await page.evaluate(() => window.localStorage.setItem('mnccore.launcherInstalled.v1', 'no'))
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByTestId('project-folder-setup')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('project-folder').screenshot({ path: `${SHOTS}/folder-5-no-launcher.png` })
  await page.evaluate(() => window.localStorage.removeItem('mnccore.launcherInstalled.v1'))
})
