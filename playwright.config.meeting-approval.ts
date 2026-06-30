import { defineConfig } from '@playwright/test'

/**
 * Meeting-approval smoke config (Phase 2 — approval_status round-trips).
 *
 * API-only spec — no browser session needed; all tests use the `request`
 * fixture and hit prod directly.  Kept separate from playwright.config.prod.ts
 * because the prod testMatch is locked to smoke.spec.ts + inspection.spec.ts
 * and must NOT be expanded without explicit approval (Workers quota reason).
 *
 * Cleanup: the spec's afterAll calls cleanupTestTasks() which deletes rows
 * whose title starts with MTGAPPROVAL_SMOKE (registered in test-cleanup.ts
 * TEST_PREFIXES).  globalTeardown provides belt-and-suspenders coverage if
 * the runner is interrupted before afterAll fires.
 *
 * Run: npx playwright test --config=playwright.config.meeting-approval.ts
 *   or: npm run test:meeting-approval
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/meeting-approval-smoke.spec.ts'],
  globalTeardown: './tests/global-teardown.ts',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
