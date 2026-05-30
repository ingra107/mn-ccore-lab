/**
 * Playwright globalTeardown — removes all test-fixture rows from Hub D1
 * after the prod/smoke/inspection test suite finishes.
 *
 * Counterpart to the deleted globalSetup (test-seed.ts was removed from
 * playwright.config.prod.ts 2026-05-30 because it wrote directly to prod
 * D1 without a working DB_TEST swap — the X-Test-Mode-Key header was
 * absent, so every seeded row landed in the real production database).
 *
 * This teardown runs regardless of test pass/fail so residue is cleaned
 * even when tests abort early.
 *
 * Covered entity types: tasks · projects · meetings · ideas · decisions ·
 * commitments. These are every table that inspection.spec.ts,
 * inspection-workflows.spec.ts, m5-workflow-smoke.spec.ts, and the old
 * test-seed.ts wrote to.
 */
import { request as playwrightRequest, type FullConfig } from '@playwright/test'
import { cleanupAllTestFixtures } from './test-cleanup'

async function globalTeardown(_config: FullConfig): Promise<void> {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev'

  const requestCtx = await playwrightRequest.newContext({ baseURL: BASE })
  try {
    const counts = await cleanupAllTestFixtures(requestCtx)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total > 0) {
      console.log('[global-teardown] Cleaned test fixtures:', JSON.stringify(counts))
    } else {
      console.log('[global-teardown] No test fixtures to clean.')
    }
  } finally {
    await requestCtx.dispose()
  }
}

export default globalTeardown
