import { test, expect } from '@playwright/test'
import { localD1 } from './localD1'

// PB #8945 (2026-10-08): Casey (eddin022@) and Nate (mesfin@) landed on ghost
// accounts with an empty My Tasks on their first login, because the slug for a
// login email came from a hand-kept NetID map in code. The slug now comes from
// the team_members row that carries the email. This journey seeds a member
// whose NetID appears NOWHERE in code, logs in as them, and checks they land
// on their own row and their own tasks, with no ghost row created. Since
// 2026-10-08 the row is also what makes them a member (isMember: true); an
// email on no row gets the members-only page (members-only.spec.ts).
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const EMAIL = 'patne001@umn.edu'
const SLUG = 'pat-newmember'
const TASK_TITLE = 'Draft the cohort table for 8945'

const d1 = localD1

test.beforeAll(() => {
  d1(`INSERT OR IGNORE INTO team_members (id, name, slug, email, auto_created) VALUES ('tm-8945', 'Pat Newmember', '${SLUG}', '${EMAIL}', 0)`)
  d1(`INSERT OR IGNORE INTO tasks (id, title, description, assignee, priority, status, completed, source) VALUES ('task_8945JOURNEY', '${TASK_TITLE}', '${TASK_TITLE}', '${SLUG}', 'medium', 'todo', 0, 'manual')`)
})

test('a member whose NetID is in no code map lands on their own account', async ({ page }) => {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': EMAIL })

  const me = await (await page.request.get('/api/auth/me', { headers: { ...HEADERS, 'X-Test-User': EMAIL } })).json()
  expect(me).toMatchObject({ authenticated: true, isMember: true, email: EMAIL, slug: SLUG })

  await page.goto('/portal/my-tasks')
  await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 20_000 })

  const rows = JSON.parse(d1(`SELECT slug, auto_created FROM team_members WHERE lower(email) = '${EMAIL}'`))[0].results
  expect(rows).toEqual([{ slug: SLUG, auto_created: 0 }])
})
