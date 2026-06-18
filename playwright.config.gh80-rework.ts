import { defineConfig } from '@playwright/test'

/**
 * GH#80 Phase 4 verification config.
 * Runs review/gh80-rework/verify-layout.spec.ts against prod.
 */
export default defineConfig({
  testDir: './review/gh80-rework',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
    screenshot: 'on',
    trace: 'on',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
