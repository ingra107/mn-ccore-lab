/**
 * Shared fixtures for journey specs.
 *
 * Provides a `page` fixture with:
 * - WebSocket stub (hub-realtime DO not available locally)
 * - Console error collection (excludes known WebSocket noise)
 * - Helper utilities for common assertions
 */
import { test as base, expect, type Page } from '@playwright/test'
import { installWebSocketStub } from '../../setup/websocket-stub'

export const test = base.extend<{ journeyPage: Page }>({
  journeyPage: async ({ page }, use) => {
    await installWebSocketStub(page)
    await use(page)
  },
})

export { expect }

/** Navigate and collect console errors (excluding WebSocket noise). */
export async function go(page: Page, path: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (!err.message.includes('WebSocket') && !err.message.includes('hub-realtime')) {
      errors.push(err.message)
    }
  })
  await page.goto(path, { waitUntil: 'load', timeout: 15000 })
  await page.waitForTimeout(2000) // React hydration + API calls
  return errors
}

/** Check if a locator is visible within timeout. */
export async function vis(page: Page, sel: string, timeout = 5000): Promise<boolean> {
  return page.locator(sel).first().isVisible({ timeout }).catch(() => false)
}

/** Wait for toast to appear. */
export async function waitForToast(page: Page, timeout = 5000): Promise<boolean> {
  return page
    .locator('[data-testid="undo-toast"], [data-testid="success-toast"]')
    .first()
    .isVisible({ timeout })
    .catch(() => false)
}

/** Click the undo button on an active toast. */
export async function clickUndo(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="undo-button"]').first()
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click()
  }
}
