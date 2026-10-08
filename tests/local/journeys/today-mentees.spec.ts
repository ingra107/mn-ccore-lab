import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

// 2026-10-08. Today's Pulse card MENTEES row showed "—" for every mentee since
// it was built (4e6b86bc): it filtered the VIEWER's own task list by each
// mentee's slug, and it showed the same hard-coded research-team list to every
// member. The row now comes from GET /api/today/mentees: a director's research
// team, each with their soonest open due date, and nothing for anyone else.
//
// The local seed has no research_team row, so this spec makes one for its own
// run: Nick (the PI) becomes a director and Nate a research_team member (Nate
// has open dated tasks on the seed, so his row cannot pass on a "—"). Both
// member_type values are put back afterwards.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }
const PI = 'ingra107@umn.edu'
const NEXT = /^(\d+d( late)?|today)$/

test.describe.configure({ mode: 'serial' })

let original: Record<string, string | null> = {}

async function setType(request: APIRequestContext, slug: string, member_type: string | null) {
  const r = await request.post(`/api/team/${slug}`, { headers: { ...HEADERS, 'X-Test-User': PI }, data: { member_type } })
  expect(r.ok(), `POST /api/team/${slug} member_type=${member_type}`).toBe(true)
}

test.beforeAll(async ({ request }) => {
  const r = await request.get('/api/team', { headers: { ...HEADERS, 'X-Test-User': PI } })
  const team = (await r.json()).data as Array<{ slug: string; member_type: string | null }>
  original = Object.fromEntries(team.filter((m) => ['nick-ingraham', 'nate-mesfin'].includes(m.slug)).map((m) => [m.slug, m.member_type]))
  expect(Object.keys(original).sort()).toEqual(['nate-mesfin', 'nick-ingraham'])
  await setType(request, 'nick-ingraham', 'director')
  await setType(request, 'nate-mesfin', 'research_team')
})

test.afterAll(async ({ request }) => {
  for (const [slug, t] of Object.entries(original)) await setType(request, slug, t)
})

async function openToday(page: Page, email: string): Promise<{ body: string; mentees: unknown[] | null }> {
  await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': email })
  let mentees: unknown[] | null = null
  page.on('response', async (r) => {
    if (new URL(r.url()).pathname !== '/api/today/mentees') return
    mentees = ((await r.json().catch(() => null)) as { data?: unknown[] } | null)?.data ?? null
  })
  await page.goto('/portal/dashboard')
  await page.waitForLoadState('networkidle')
  return { body: await page.locator('body').innerText(), mentees }
}

// The Pulse card renders "MENTEES" then name / next pairs, one per line.
function menteeRows(body: string): Array<{ name: string; next: string }> {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const i = lines.indexOf('MENTEES')
  if (i < 0) return []
  const rows: Array<{ name: string; next: string }> = []
  for (let k = i + 1; k + 1 < lines.length && rows.length < 4; k += 2) {
    if (!(NEXT.test(lines[k + 1]) || lines[k + 1] === '—')) break
    rows.push({ name: lines[k], next: lines[k + 1] })
  }
  return rows
}

test("a director's Today shows each mentee's next due date, not a dash", async ({ page }) => {
  const { body, mentees } = await openToday(page, PI)
  const rows = menteeRows(body)
  const nate = rows.find((m) => m.name === 'Nate Mesfin')
  expect(nate, `Nate (research_team, open dated tasks) is in the MENTEES row; rendered: ${JSON.stringify(rows)}`).toBeTruthy()
  expect(nate!.next, "Nate's soonest open task date, not —").toMatch(NEXT)
  expect(mentees, 'Today read /api/today/mentees').not.toBeNull()
})

for (const email of ['nate@umn.edu', 'eddin022@umn.edu']) {
  test(`a member who mentors no one (${email}) gets no MENTEES row`, async ({ page }) => {
    const { body, mentees } = await openToday(page, email)
    expect(mentees, 'the route returns nothing for a non-director').toEqual([])
    expect(body.split('\n').map((l) => l.trim())).not.toContain('MENTEES')
  })
}
