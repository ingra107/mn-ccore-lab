import { defineConfig } from '@playwright/test'

/**
 * Journey-specific Playwright config.
 *
 * Points at Vite dev server (:5173) which proxies /api to the Miniflare
 * Worker on :8787. Used by `npm run test:journeys`. HUB_WEB_PORT overrides
 * :5173 (scripts/run-journey-spec.mjs --gate picks a free port so the deploy
 * gate never drives another checkout's vite).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/tests/local/journeys/**.spec.ts',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${process.env.HUB_WEB_PORT ?? 5173}`,
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
