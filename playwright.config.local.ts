import { defineConfig } from '@playwright/test'

/**
 * Local-first Playwright config for the Miniflare test harness.
 *
 * Pointed at Vite dev server on localhost:5173 which proxies /api to the
 * `wrangler pages dev --local` Worker bound to the local D1 (seeded via
 * scripts/local-db-seed.ts).  No X-Test-Mode header — that was the broken
 * prod pattern this rework replaces.
 *
 * testMatch is scoped to tests/local/** so prod inspection specs never run
 * here by accident (those live under playwright.config.prod.ts).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/tests/local/**.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.HUB_TEST_URL ?? 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
