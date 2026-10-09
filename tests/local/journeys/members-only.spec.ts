import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'

// 2026-10-08: Cloudflare Access lets any @umn.edu account sign in, and the
// Worker used to give every unknown email an auto-created team_members row,
// so any UMN NetID could read the lab's tasks, projects and meetings. Now a
// signed-in email with no row is a non-member: every member API answers 403
// and the SPA shows a members-only page. A PI adds a member from the Team page
// (POST /api/team), and that email then gets the Hub.
//
// The whole loop on the real local stack (wrangler dev + vite): a brand-new
// NetID signs in -> members-only page, 403s, no row written; the PI adds them
// on a phone-sized screen; they sign in again -> the portal.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = 'ingra107@umn.edu'
const NEWBIE = 'newbie42@umn.edu'
const NEWBIE_NAME = 'Nova Newbie'
const NEWBIE_SLUG = 'nova-newbie'

const d1 = localD1
const rowsFor = (email: string) =>
  JSON.parse(d1(`SELECT slug, auto_created FROM team_members WHERE lower(email) = '${email}'`))[0].results

const cleanup = () => {
  d1(`DELETE FROM team_members WHERE lower(email) = '${NEWBIE}' OR slug = '${NEWBIE_SLUG}'`)
}
test.beforeAll(cleanup)
test.afterAll(cleanup)

async function as(page: Page, email: string) {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': email })
}

test.describe.configure({ mode: 'serial' })

test('a brand-new UMN NetID sees the members-only page and reads nothing', async ({ page }) => {
  await as(page, NEWBIE)
  await page.goto('/portal/dashboard')
  const wall = page.getByTestId('members-only')
  await expect(wall).toBeVisible({ timeout: 20_000 })
  await expect(wall).toContainText('This is a place for MN-CCORE members only. Here is how to join.')
  await expect(wall.getByTestId('join-steps')).toContainText('Finish your CITI training')
  await expect(wall).toContainText('ingra107@umn.edu')
  await expect(wall).toContainText(`Signed in as ${NEWBIE}`)

  const href = await page.getByTestId('join-request').getAttribute('href')
  expect(href).toMatch(/^mailto:ingra107@umn\.edu\?/)
  const q = new URLSearchParams(href!.split('?')[1])
  expect(q.get('subject')).toBe('MN-CCORE Hub access request')
  expect(q.get('body')).toContain(`UMN email: ${NEWBIE}`)

  // The portal behind the wall is not there, and the API agrees.
  await expect(page.getByText('My Tasks')).toHaveCount(0)
  for (const path of ['/api/tasks', '/api/projects/test_delete_sepsis_outcomes_reg', '/api/meetings', '/api/team/slugs']) {
    const r = await page.request.get(path, { headers: { ...HEADERS, 'X-Test-User': NEWBIE } })
    expect(r.status(), path).toBe(403)
    expect(await r.json()).toMatchObject({ code: 'not_a_member' })
  }
  const me = await (await page.request.get('/api/auth/me', { headers: { ...HEADERS, 'X-Test-User': NEWBIE } })).json()
  expect(me).toMatchObject({ authenticated: true, isMember: false })
  expect(me).not.toHaveProperty('directory')

  // Signing in wrote nothing.
  expect(rowsFor(NEWBIE)).toEqual([])
})

test('an unknown path shows a not-found page, not a redirect into the portal', async ({ page }) => {
  await page.goto('/no-such-page-anywhere')
  await expect(page.getByTestId('not-found')).toBeVisible({ timeout: 20_000 })
  expect(new URL(page.url()).pathname).toBe('/no-such-page-anywhere')
  await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
  await expect(page.getByTestId('not-found-hub')).toHaveAttribute('href', '/portal/dashboard')
})

test('the PI adds them from the Team page on a phone, and they get the Hub', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await as(page, PI)
  await page.goto('/team')
  await page.getByTestId('add-member-open').click()
  const form = page.getByTestId('add-member-form')
  await expect(form).toBeVisible()
  // The form fits the phone: nothing in it is wider than the viewport.
  const box = await form.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)

  await form.getByLabel('Name', { exact: true }).fill(NEWBIE_NAME)
  await expect(page.getByTestId('add-member-slug')).toHaveText(NEWBIE_SLUG)
  await form.getByLabel(/UMN email/).fill(NEWBIE.toUpperCase())
  await page.getByTestId('add-member-submit').click()
  await expect(page.getByTestId('add-member-added')).toContainText(`Added ${NEWBIE_NAME}. They can sign in now with ${NEWBIE}.`)
  expect(rowsFor(NEWBIE)).toEqual([{ slug: NEWBIE_SLUG, auto_created: 0 }])

  // Same email again: the server says it is taken, nothing is added.
  await form.getByLabel('Name', { exact: true }).fill('Someone Else')
  await form.getByLabel(/UMN email/).fill(NEWBIE)
  await page.getByTestId('add-member-submit').click()
  await expect(form.getByRole('alert')).toContainText(NEWBIE_SLUG)
  expect(rowsFor(NEWBIE)).toHaveLength(1)

  // The new member now gets the portal, not the wall.
  await page.setViewportSize({ width: 1280, height: 800 })
  await as(page, NEWBIE)
  await page.goto('/portal/my-tasks')
  await expect(page.getByText('My Tasks').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('members-only')).toHaveCount(0)
  const r = await page.request.get('/api/tasks', { headers: { ...HEADERS, 'X-Test-User': NEWBIE } })
  expect(r.status()).toBe(200)
})
