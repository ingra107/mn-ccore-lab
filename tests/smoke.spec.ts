import { test, expect } from '@playwright/test'

const ROUTES = [
  { path: '/', title: 'MN-CCORE', section: 'public' },
  { path: '/team', title: 'Team', section: 'public' },
  { path: '/publications', title: 'Publications', section: 'public' },
  { path: '/network', title: 'Network', section: 'public' },
  { path: '/contact', title: 'Contact', section: 'public' },
  { path: '/dashboard', title: 'Dashboard', section: 'portal' },
  { path: '/personal', title: 'Personal', section: 'portal' },
  { path: '/my-items', title: 'My Items', section: 'portal' },
  { path: '/tasks', title: 'Tasks', section: 'portal' },
  { path: '/calendar', title: 'Calendar', section: 'portal' },
  { path: '/deadlines', title: 'Deadlines', section: 'portal' },
  { path: '/projects', title: 'Projects', section: 'portal' },
  { path: '/manuscripts', title: 'Manuscripts', section: 'portal' },
  { path: '/ideas', title: 'Ideas', section: 'portal' },
  { path: '/digest', title: 'Digest', section: 'portal' },
  { path: '/search', title: 'Search', section: 'portal' },
  { path: '/meetings', title: 'Meetings', section: 'portal' },
  { path: '/pulse', title: 'Pulse', section: 'portal' },
]

test.describe('Smoke tests — all routes load', () => {
  for (const route of ROUTES) {
    test(`${route.section}: ${route.path} loads without error`, async ({ page }) => {
      // Navigate
      const response = await page.goto(route.path)

      // HTTP status should be 200 (or 304)
      expect(response?.status()).toBeLessThan(400)

      // Page should have content (not blank)
      await page.waitForLoadState('networkidle')
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
