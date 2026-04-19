import { defineConfig } from '@playwright/test'

// Phase 36 desktop user-journey smoke. Kept separate from the baseline
// inspection suite because it's a golden-path walk-through, not a
// surface enumeration. Run alongside the mobile smoke for a two-minute
// post-deploy sanity check.
//
// Run: `npx playwright test --config=playwright.config.phase36.ts`
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/phase36-user-journey.spec.ts'],
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'https://mn-ccore-lab.pages.dev',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  reporter: [['list']],
})
