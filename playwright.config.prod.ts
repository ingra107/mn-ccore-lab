import { defineConfig } from '@playwright/test'

/**
 * Prod-only Playwright config — narrow post-deploy smoke against
 * https://mn-ccore-lab.pages.dev.
 *
 * Historically this file was `playwright.config.ts` and set an
 * `X-Test-Mode: true` header that swapped the Worker's DB binding to a stale
 * DB_TEST database — the pattern that caused silent false positives in the
 * inspection suite.  Miniflare now owns local testing
 * (playwright.config.local.ts); this config is kept only for the narrow
 * post-deploy smoke path where we need a real Durable Object (hub-realtime
 * WebSocket) and can't stub.
 *
 * Scoped testMatch to tests/smoke.spec.ts — full inspection sweeps belong on
 * the local config, not here.  Do NOT expand testMatch without explicit
 * approval: prod Playwright runs eat into the Workers quota.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/tests/smoke.spec.ts',
  globalSetup: './tests/test-seed.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'https://mn-ccore-lab.pages.dev',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'review/audit-results.json' }],
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
