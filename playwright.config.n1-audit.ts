import { defineConfig } from '@playwright/test'

/**
 * N1 mobile visual audit config (2026-06-11 docket). One project per
 * audited viewport: three phones, both edges of the 768-1023 tablet
 * band (useIsMobile() breakpoint is 1024 per UX-9), and a 1440 desktop
 * ride-along for the N1b de-box sweep.
 *
 * Run: CAPTURE_BASE_URL=https://<hash>.mn-ccore-lab.pages.dev \
 *        npx playwright test --config=playwright.config.n1-audit.ts
 */
const phone = (width: number, height: number) => ({
  headless: true,
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce' as const,
})

export default defineConfig({
  testDir: './tests',
  testMatch: '**/capture-n1-mobile-audit.spec.ts',
  timeout: 90_000,
  retries: 1,
  workers: 4,
  reporter: [['list']],
  projects: [
    { name: 'm375', use: phone(375, 812) },
    { name: 'm390', use: phone(390, 844) },
    { name: 'm430', use: phone(430, 932) },
    { name: 't768', use: phone(768, 1024) },
    { name: 't1023', use: { ...phone(1023, 800), deviceScaleFactor: 1 } },
    {
      name: 'd1440',
      use: {
        headless: true,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce' as const,
      },
    },
  ],
})
