import { defineConfig, devices } from '@playwright/test'

// Mobile smoke test config. Runs `tests/mobile-swipe-smoke.spec.ts` against
// prod with a Pixel 5 emulation profile. Kept separate from the prod config
// because mobile emulation changes user-agent + viewport which would break
// the baseline inspection suite's desktop assertions.
//
// Run: `npx playwright test --config=playwright.config.mobile.ts`
//
// This covers the "does it render on mobile without JS errors" smoke only.
// Actual swipe gesture needs a real device — Playwright's synthetic touch
// events don't reproduce real touchmove velocity.
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/mobile-swipe-smoke.spec.ts'],
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'https://mn-ccore-lab.pages.dev',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  reporter: [['list']],
})
