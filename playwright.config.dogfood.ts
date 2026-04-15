import { defineConfig } from '@playwright/test'

// Dogfood config: hits prod DB (no X-Test-Mode header, no globalSetup),
// targets only the dogfood spec. Used once during Phase 0 to verify R11/R12
// interaction gaps persist on the live seeded data. Request count is bounded
// to ~200 (14 pages × handful of API calls each), well under the 100K/day cap.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/dogfood-phase0.spec.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'https://mn-ccore-lab.pages.dev',
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
