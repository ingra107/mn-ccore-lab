import { test, expect } from '@playwright/test'
import { P } from './helpers/paths'

const ROUTES = [
  { path: P.home, title: 'MN-CCORE', section: 'public' },
  { path: P.publicTeam, title: 'Team', section: 'public' },
  { path: P.publications, title: 'Publications', section: 'public' },
  { path: P.network, title: 'Network', section: 'public' },
  { path: P.contact, title: 'Contact', section: 'public' },
  { path: P.dashboard, title: 'Dashboard', section: 'portal' },
  { path: P.personal, title: 'Personal', section: 'portal' },
  { path: P.myItems, title: 'My Items', section: 'portal' },
  { path: P.myTasks, title: 'Tasks', section: 'portal' },
  { path: P.calendar, title: 'Calendar', section: 'portal' },
  { path: P.deadlines, title: 'Deadlines', section: 'portal' },
  { path: P.projects, title: 'Projects', section: 'portal' },
  { path: P.manuscripts, title: 'Manuscripts', section: 'portal' },
  { path: P.ideas, title: 'Ideas', section: 'portal' },
  { path: P.digest, title: 'Digest', section: 'portal' },
  { path: P.search, title: 'Search', section: 'portal' },
  { path: P.meetings, title: 'Meetings', section: 'portal' },
  { path: P.pulse, title: 'Pulse', section: 'portal' },
]

test.describe('Smoke tests — all routes load', () => {
  for (const route of ROUTES) {
    test(`${route.section}: ${route.path} loads without error`, async ({ page }) => {
      // Navigate
      const response = await page.goto(route.path)

      // HTTP status should be 200 (or 304)
      expect(response?.status()).toBeLessThan(400)

      // Page should have content (not blank). /network lazy-loads ~1.3MB
      // three.js + reagraph WebGL — never settles to networkidle. Use a
      // softer wait + dwell for that one route (matches the capture spec).
      if (route.path === '/network') {
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(4000)
      } else {
        await page.waitForLoadState('networkidle')
      }
      const body = await page.locator('body').textContent()
      expect(body?.length).toBeGreaterThan(0)

      // Title should contain expected text (case-insensitive)
      const title = await page.title()
      expect(title.toLowerCase()).toContain('mn-ccore')

      // No uncaught JS errors
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      // Brief wait for any async errors
      await page.waitForTimeout(1000)
      expect(errors).toHaveLength(0)
    })
  }
})

test.describe('API health checks', () => {
  const API_ENDPOINTS = [
    '/api/team',
    '/api/projects',
    '/api/publications',
    '/api/grants',
    '/api/tasks',
    '/api/meetings',
    '/api/ideas',
    '/api/stats',
    '/api/search?q=test',
  ]

  for (const endpoint of API_ENDPOINTS) {
    test(`API: ${endpoint} returns 200`, async ({ request }) => {
      const response = await request.get(endpoint)
      expect(response.status()).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('data')
    })
  }
})
