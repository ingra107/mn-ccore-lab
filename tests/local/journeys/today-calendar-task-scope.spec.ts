import { test, expect, type Page } from '@playwright/test'
import plan from '../../../scripts/seed/phase0-plan.json' with { type: 'json' }

// 2026-10-08, Pulmonary HSR Group Meeting (Casey's and Nate's first Hub use).
// Nick: "File a bug that the lab calendar and Today page show tasks not
// assigned to the user". The lab calendar returned every member's open dated
// task, so a member's calendar was mostly Nick's to-do list. Today's task list
// is assignee-scoped, but it fell back to an UNSCOPED /api/tasks read whenever
// the viewer's slug was still empty. Both are checked as a non-Nick member,
// on the real stack: the requests the page makes, and the titles it renders.
//
// Nate (nate@umn.edu on the local seed) has tasks of his own, so his runs
// cannot pass vacuously. Casey (eddin022@umn.edu) has no row on the local
// seed and none of his own tasks: he must see none of anyone else's.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const strip = (s: string) => s.replace(/^test_delete_/, '')
const titlesOf = (slug: string) => plan.tasks.filter((t) => t.assignee === slug).map((t) => strip(t.description))
const NICK_TITLES = titlesOf('nick-ingraham')
const NATE_TITLES = titlesOf('nate-mesfin')

const VIEWERS = [
  { email: 'nate@umn.edu', slug: 'nate-mesfin', own: NATE_TITLES },
  { email: 'eddin022@umn.edu', slug: 'eddin022', own: [] as string[] },
]

type Seen = { taskUrls: string[]; calendarTaskAssignees: string[] }

async function open(page: Page, email: string, path: string): Promise<{ seen: Seen; body: string }> {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': email })
  const seen: Seen = { taskUrls: [], calendarTaskAssignees: [] }
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname === '/api/tasks') seen.taskUrls.push(u.pathname + u.search)
  })
  page.on('response', async (r) => {
    if (new URL(r.url()).pathname !== '/api/calendar/events') return
    const j = await r.json().catch(() => null) as { data?: { type: string; meta?: { assignee?: string } }[] } | null
    for (const e of j?.data ?? []) if (e.type === 'task') seen.calendarTaskAssignees.push(e.meta?.assignee ?? '')
  })
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  return { seen, body: await page.locator('body').innerText() }
}

for (const v of VIEWERS) {
  test(`Today shows only ${v.slug}'s own tasks and never reads the unscoped task list`, async ({ page }) => {
    const { seen, body } = await open(page, v.email, '/portal/dashboard')
    expect(seen.taskUrls.length, 'Today read its tasks').toBeGreaterThan(0)
    expect(seen.taskUrls.filter((u) => !u.includes(`assignee=${encodeURIComponent(v.slug)}`)), 'every /api/tasks read is scoped to the viewer').toEqual([])
    expect(NICK_TITLES.filter((t) => body.includes(t)), "none of Nick's tasks render").toEqual([])
    if (v.own.length) expect(v.own.some((t) => body.includes(t)), `${v.slug}'s own tasks render`).toBe(true)
  })

  test(`Lab calendar shows only ${v.slug}'s own task deadlines`, async ({ page }) => {
    const { seen, body } = await open(page, v.email, '/portal/calendar')
    expect(seen.calendarTaskAssignees.filter((a) => a !== v.slug), 'every calendar task row is the viewer\'s').toEqual([])
    if (v.own.length) expect(seen.calendarTaskAssignees.length, 'the viewer\'s own deadlines still come back').toBeGreaterThan(0)
    expect(NICK_TITLES.filter((t) => body.includes(t)), "none of Nick's tasks render").toEqual([])
  })
}
