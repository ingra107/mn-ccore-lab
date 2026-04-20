import { defineConfig, devices } from '@playwright/test'

/**
 * Interactions capture for Claude Design. Records a WebM video for
 * every test + allows the spec to take PNG keyframes at hero moments.
 *
 * Videos go to test-results/<test-dir>/video.webm (Playwright default);
 * the spec's afterEach hook copies each one next to its keyframes in
 * review/interactions-<timestamp>/.
 *
 * reducedMotion is INTENTIONALLY NOT set — we want the real easing +
 * transitions in the recordings.
 *
 * Run: `npx playwright test --config=playwright.config.interactions-capture.ts`
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/capture-interactions.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 2, // keep low so video recording doesn't OOM on a laptop
  reporter: [['list']],
  use: {
    headless: true,
    video: {
      mode: 'on',
      size: { width: 1440, height: 900 }, // matches desktop project
    },
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
})
