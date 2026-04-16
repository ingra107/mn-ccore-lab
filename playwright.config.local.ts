import { defineConfig } from '@playwright/test'

/**
 * Local-first Playwright config for the Miniflare test harness.
 *
 * baseURL defaults to `http://localhost:8787` — the `wrangler pages dev
 * --local` Worker bound to the local D1 (seeded via
 * scripts/local-db-seed.ts).  No X-Test-Mode header — that was the broken
 * prod pattern this rework replaces.
 *
 * Why the Worker directly instead of Vite :5173?  The current
 * vite.config.ts has no `/api` proxy, so Vite just returns index.html for
 * every /api/* request.  Pointing Playwright at :8787 lets these API-level
 * specs assert against real handler responses without asking someone to
 * edit vite.config.ts (out of scope for the Miniflare infra task).  When
 * browser-level specs land (React routes, SSR, etc.) they should set
 * `HUB_TEST_URL=http://localhost:5173` and add a Vite proxy in the same PR.
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
    baseURL: process.env.HUB_TEST_URL ?? 'http://localhost:8787',
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
