import { test, expect, type Page } from '@playwright/test'
import { localD1 } from './localD1'

// Member-persona page-load sweep (sweep4 B5). Opens every static /portal page
// as two non-PI members and fails on an error boundary, any /api/pb/* request,
// or any 4xx/5xx from /api. Catches the 1015421c class (empty-list crash) and
// the d2b59803 class (a 403 rendered as text). It cannot see POST authorization
// (6419c9b0) or edge Access (18f602f5). Not wired into any deploy gate: run
// `npm run test:journeys:sweep` and read the time first.
//
// Both emails are on no NetID map in code; the team_members row is the only
// thing that makes them members (262b9444 class).
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod' }

// Static /portal routes that render a page. Excluded: Navigate redirects
// (tasks, personal, artifacts, digest, ideas, meeting-notes, pi/analytics,
// mentee-milestones, deadline-cascade) and routes with params (projects/:slug,
// artifacts/:id, meetings/:id, meetings/:id/prep, team/:slug, team/:slug/trajectory).
const ROUTES = [
  'dashboard', 'overview', 'my-items', 'my-tasks', 'calendar', 'deadlines',
  'projects', 'library', 'manuscripts', 'ask', 'decisions', 'narratives',
  'search', 'grants', 'meetings', 'activity', 'analytics', 'insights',
  'sessions', 'launches', 'settings', 'profile', 'team',
].map((r) => `/portal/${r}`)

// Known, deliberate non-2xx answers, keyed by the route that may see them.
//  - /api/realtime/ticket 503 (any route, the app shell asks for it): the
//    hub-realtime Durable Object is not bound in the local worker. The journey
//    fixtures' WebSocket stub does not cover the ticket fetch, so allow this one
//    exact status, method and path.
//  - /api/insights/dashboard 403, only on /portal/insights: the route is PI-only
//    and InsightsPage turns the 403 into its 'PI-only' state on purpose.
const EXPECTED_ANYWHERE = new Set(['503 GET /api/realtime/ticket'])
const EXPECTED_BY_ROUTE: Record<string, Set<string>> = {
  '/portal/insights': new Set(['403 GET /api/insights/dashboard']),
}

const PERSONAS = [
  { name: 'member with data', email: 'sweepdata@umn.edu', slug: 'sweep-data', tasks: true },
  { name: 'member with empty lists', email: 'sweepempty@umn.edu', slug: 'sweep-empty', tasks: false },
]

test.describe.configure({ mode: 'parallel' })

test.beforeAll(() => {
  test.setTimeout(120_000) // each wrangler call is ~5-10 s cold
  for (const p of PERSONAS) {
    localD1(`INSERT OR IGNORE INTO team_members (id, name, slug, email, auto_created) VALUES ('tm-sweep-${p.slug}', 'Sweep ${p.slug}', '${p.slug}', '${p.email}', 0)`)
    if (p.tasks) {
      localD1(`INSERT OR IGNORE INTO tasks (id, title, description, assignee, priority, status, completed, source) VALUES ('task_SWEEPDATA1', 'Sweep persona task', 'Sweep persona task', '${p.slug}', 'medium', 'todo', 0, 'manual')`)
    }
  }
})

// One set of listeners per page. Each problem is filed under the route that
// was current when the event fired, so a late response from route N is not
// reported under route N+1.
function watch(page: Page) {
  const state = { route: '(before first visit)' }
  const failures: string[] = []
  const add = (msg: string) => failures.push(`${state.route}: ${msg}`)
  page.on('pageerror', (e) => {
    if (!/WebSocket|hub-realtime/.test(e.message)) add(`pageerror: ${e.message}`)
  })
  page.on('response', (r) => {
    const url = new URL(r.url())
    if (!url.pathname.startsWith('/api')) return
    if (url.pathname.startsWith('/api/pb/')) add(`pb request: ${url.pathname}`)
    else if (r.status() >= 400) {
      const hit = `${r.status()} ${r.request().method()} ${url.pathname}`
      if (!EXPECTED_ANYWHERE.has(hit) && !EXPECTED_BY_ROUTE[state.route]?.has(hit)) add(hit)
    }
  })
  return { state, failures, add }
}

async function visit(page: Page, path: string, w: ReturnType<typeof watch>) {
  w.state.route = path
  await page.goto(path, { waitUntil: 'load', timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  if (await page.getByText('Something went wrong').count()) w.add('error boundary rendered')
}

for (const persona of PERSONAS) {
  test.describe(persona.name, () => {
    test(`portal sweep as ${persona.name}`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setExtraHTTPHeaders({ ...HEADERS, 'X-Test-User': persona.email })
      const w = watch(page)
      for (const route of ROUTES) await visit(page, route, w)
      expect(w.failures, w.failures.join('\n')).toEqual([])
    })
  })
}
