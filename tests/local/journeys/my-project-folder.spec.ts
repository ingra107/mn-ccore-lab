import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'

// My folder (schema-v127) + the member launcher switch, on the real local stack
// (wrangler dev + vite, local D1). Nick, 2026-10-12: "if other folks have local
// folders they want to put in they should be able to do that maybe?", then
// "Also install the launcher", then "they might have a mac too".
//
// Nate (a member, not a PI) keeps his own folder on a project he is on: a bad
// paste is refused with a reason, a Windows "Copy as path" paste is saved,
// Copy path works, and Open folder / Work on in Claude appear only after he
// turns on "I have the launcher installed" in Settings, where both downloads
// are real zips. Nick, a member of the same project, never sees Nate's path.
// Screenshots: review/s62/ (gitignored).
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = 'ingra107@umn.edu'
const NATE = 'nate@umn.edu'
const PROJECT = 'sepsis_outcomes_reg'
const NATE_PATH = 'C:\\Users\\nate\\Box\\Sepsis Outcomes'
const SHOTS = 'review/s62'

const d1 = localD1
const folderRows = () =>
  JSON.parse(d1(`SELECT f.member_slug, f.folder_path FROM project_member_folders f JOIN projects p ON p.id = f.project_id WHERE p.slug = '${PROJECT}' ORDER BY 1`))[0].results
const cleanup = () => {
  d1(`DELETE FROM project_member_folders WHERE project_id IN (SELECT id FROM projects WHERE slug = '${PROJECT}')`)
}
test.beforeAll(cleanup)
test.afterAll(cleanup)
test.describe.configure({ mode: 'serial' })

async function as(page: Page, email: string) {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': email })
}

async function openProject(page: Page) {
  await page.goto(`/portal/projects/${PROJECT}`)
  const panel = page.getByTestId('my-project-folder')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  return panel
}

test('a member adds their own folder; a bad paste is refused with a reason', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await as(page, NATE)
  const panel = await openProject(page)
  await expect(panel).toContainText('My folder')
  await expect(panel).toContainText('Only you see this')
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/01-member-no-folder.png`, fullPage: false })

  await panel.getByTestId('my-folder-add').click()
  const input = panel.getByTestId('my-folder-input')
  await input.fill('https://umn.app.box.com/folder/123')
  await panel.getByTestId('my-folder-save').click()
  await expect(panel.getByTestId('my-folder-help')).toContainText('That is a link, not a folder on your computer')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await page.screenshot({ path: `${SHOTS}/02-member-bad-paste-refused.png` })
  expect(folderRows()).toEqual([])

  // Windows Explorer's "Copy as path" wraps the path in quotes; they are stripped.
  await input.fill(`"${NATE_PATH}"`)
  await input.press('Enter')
  await expect(panel.getByTestId('my-folder-path')).toHaveText(NATE_PATH)
  expect(folderRows()).toEqual([{ member_slug: 'nate-mesfin', folder_path: NATE_PATH }])

  // Without the launcher: Copy path only, and a pointer to install it.
  await expect(panel.getByRole('button', { name: /Open folder/ })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /Work on this in Claude/ })).toHaveCount(0)
  await expect(panel.getByTestId('my-folder-launcher-hint')).toContainText('install the launcher')
  await panel.getByTestId('my-folder-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(NATE_PATH)
  await page.screenshot({ path: `${SHOTS}/03-member-folder-saved-copy-only.png` })
})

test('Settings: both launcher downloads are real zips; the switch shows the launch buttons', async ({ page }) => {
  await as(page, NATE)
  await page.goto('/portal/settings#integrations')
  const section = page.getByTestId('launcher-settings')
  await expect(section).toBeVisible({ timeout: 20_000 })
  const sw = section.getByTestId('launcher-switch')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await section.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/04-settings-launcher-off.png` })

  for (const id of ['launcher-download-windows', 'launcher-download-mac']) {
    const href = await section.getByTestId(id).getAttribute('href')
    expect(href).toMatch(/^\/portal\/downloads\/mnccore-launcher-(windows|mac)\.zip$/)
    const r = await page.request.get(href!)
    expect(r.status(), href!).toBe(200)
    const body = await r.body()
    expect(body.subarray(0, 4).toString('hex'), href!).toBe('504b0304') // "PK\3\4"
    expect(body.toString('latin1')).toContain('MNCCORE Launcher/README.txt')
  }

  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: `${SHOTS}/05-settings-launcher-on.png` })

  const panel = await openProject(page)
  await expect(panel.getByRole('button', { name: /Open folder/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Work on this in Claude/ })).toBeVisible()
  await expect(panel.getByTestId('my-folder-copy')).toBeVisible()
  await expect(panel.getByTestId('my-folder-launcher-hint')).toHaveCount(0)
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/06-member-folder-with-launcher.png` })
})

test("the PI on the same project never sees the member's folder", async ({ page }) => {
  await as(page, PI)
  const panel = await openProject(page)
  await expect(panel).not.toContainText('nate')
  await expect(panel.getByTestId('my-folder-add')).toBeVisible()
  const api = await page.request.get(`/api/projects/${PROJECT}/my-folder`, { headers: { ...HEADERS, 'X-Test-User': PI } })
  expect(await api.json()).toMatchObject({ data: null, can_set: true })
  await page.screenshot({ path: `${SHOTS}/07-pi-sees-only-own.png` })
})

test('the member edits and then removes their folder', async ({ page }) => {
  await as(page, NATE)
  const panel = await openProject(page)
  await panel.getByRole('button', { name: 'Edit my folder' }).click()
  const input = panel.getByTestId('my-folder-input')
  await expect(input).toHaveValue(NATE_PATH)
  await input.fill('/Users/nate/Library/CloudStorage/Box-Box/Sepsis')
  await panel.getByTestId('my-folder-save').click()
  await expect(panel.getByTestId('my-folder-path')).toHaveText('/Users/nate/Library/CloudStorage/Box-Box/Sepsis')
  expect(folderRows()).toEqual([{ member_slug: 'nate-mesfin', folder_path: '/Users/nate/Library/CloudStorage/Box-Box/Sepsis' }])

  await panel.getByRole('button', { name: 'Remove my folder' }).click()
  await expect(panel.getByTestId('my-folder-add')).toBeVisible()
  expect(folderRows()).toEqual([])
  await page.screenshot({ path: `${SHOTS}/08-member-folder-removed.png` })
})
