import { test, expect } from '@playwright/test'

// GitHub #144 (2026-10-08): My Tasks crashed with React #301 "Too many
// re-renders" for every member whose list was EMPTY. useListKeyboard clamped
// its cursor with a render-phase setState whose guard (`0 >= 0`) never turned
// false on an empty list. Nick never saw it (his list is never empty); Casey and
// Nate hit it on their first login. Casey (eddin022@umn.edu) is a member with
// zero tasks on the local seed, so this journey always exercises the empty
// path, plus the list view with an empty quick-view filter for a member who
// does have tasks. (It used a brand-new email until 2026-10-08; a signed-in
// email with no team_members row now gets the members-only page, not My Tasks.)
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }

async function openMyTasks(page: import('@playwright/test').Page, email: string, query = '') {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': email })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && /re-renders|#301/.test(m.text())) errors.push(m.text()) })
  await page.goto(`/portal/my-tasks${query}`)
  await expect(page.getByText('My Tasks').first()).toBeVisible({ timeout: 20_000 })
  // Give the task query time to resolve so the empty list actually renders.
  await page.waitForLoadState('networkidle')
  return errors
}

test('My Tasks renders for a member with no tasks at all', async ({ page }) => {
  const errors = await openMyTasks(page, 'eddin022@umn.edu')
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('My Tasks renders when a quick view filters the list to empty', async ({ page }) => {
  const errors = await openMyTasks(page, 'ingra107@umn.edu', '?filter=declined&q=zz-no-such-task-zz')
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
  expect(errors).toEqual([])
})
