import { defineConfig, devices } from '@playwright/test'

/**
 * Screenshot capture config for Claude Design. Runs the capture spec
 * twice — once as desktop 1440×900, once as Pixel 5 mobile — and writes
 * PNGs to `review/claude-design-<timestamp>/`. CAPTURE_DEVICE env var
 * tells the spec which prefix to use.
 *
 * Run: `npx playwright test --config=playwright.config.design-capture.ts`
 */
export default defineConfig({
  testDir: './tests',
  testMatch: [
    '**/capture-for-design.spec.ts',
    '**/capture-focus-asks.spec.ts',
    '**/capture-scroll-chunks.spec.ts',
    '**/capture-theme-light.spec.ts',
    '**/capture-rich-states.spec.ts',
  ],
  timeout: 60_000,
  retries: 0,
  workers: 4,
  reporter: [['list']],
  projects: [
    {
      name: 'desktop',
      use: {
        headless: true,
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
      metadata: { CAPTURE_DEVICE: 'desktop' },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        headless: true,
      },
      metadata: { CAPTURE_DEVICE: 'mobile' },
    },
  ],
})
