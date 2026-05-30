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
 * Scoped testMatch to smoke + inspection — full journey/workflow sweeps
 * belong on the local config, not here.  Do NOT expand testMatch further
 * without explicit approval: prod Playwright runs eat into the Workers quota.
 *
 * inspection.spec.ts is included because the Everything Sprint v2 plan
 * (Phase 4 Task 22 Step 6) gates deploy on the historical ≥212-passed
 * baseline. Moving inspection to local-only would break that gate. It's
 * re-run ONCE per deploy, not on every dev cycle.
 *
 * NOTE: globalSetup (test-seed.ts) was removed 2026-05-30.
 * test-seed.ts posted directly to https://mn-ccore-lab.pages.dev with only
 * X-Test-Mode: true but without X-Test-Mode-Key, so the DB_TEST swap in
 * api/index.ts never fired — every seeded row landed in the real prod DB.
 * The inspection suite's own afterAll(cleanupTestTasks) only covered tasks,
 * leaving projects/meetings/ideas/decisions permanently in prod.
 * Fix: no pre-seeding on prod. globalTeardown cleans up whatever the tests
 * themselves create (tasks, projects, meetings, ideas, decisions, commitments).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/tests/smoke.spec.ts', '**/tests/inspection.spec.ts'],
  globalTeardown: './tests/global-teardown.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    // Prod baseline; override via PLAYWRIGHT_BASE_URL when running against a
    // preview-hash deploy before promoting to production.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev',
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
