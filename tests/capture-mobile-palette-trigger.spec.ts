/**
 * Verify the command-palette trigger is reachable on a phone.
 *
 * The trigger was `hidden sm:flex`, which made the palette unreachable below the
 * sm breakpoint: no Cmd+K on a touch device, no visible affordance, and every
 * palette-only action (Bug Squasher, Backlog Wave, the quick filters) went with
 * it. This asserts the rendered result at phone width, because the CSS class is
 * the thing that was wrong -- reading the source proves nothing about the output.
 *
 * Runs against an ungated preview deploy (CAPTURE_BASE_URL) with the fake-auth
 * cookie, same harness as the other capture specs.
 *
 *   CAPTURE_BASE_URL=https://<hash>.mn-ccore-lab.pages.dev \
 *     npx playwright test tests/capture-mobile-palette-trigger.spec.ts
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { injectFakeAuth } from './helpers/capture-auth'

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'
const OUT_DIR = process.env.CAPTURE_OUT_DIR ?? path.join('review', 'mobile-palette-trigger')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const TRIGGER = 'button[aria-label="Open command palette"]'

for (const width of [375, 390, 430]) {
  test(`palette trigger is visible and opens the palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await injectFakeAuth(page.context(), BASE)
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })

    const trigger = page.locator(TRIGGER)
    await expect(trigger).toBeVisible()

    // The label and the keyboard hint are desktop-only affordances; at phone
    // width the control is the icon alone. Assert that too, so a future change
    // that merely un-hides the full 220px box fails here instead of silently
    // crowding the header.
    await expect(page.getByText('Search...', { exact: true })).toBeHidden()

    await page.screenshot({ path: path.join(OUT_DIR, `header-${width}.png`) })

    // The affordance has to actually open the thing, not just render.
    await trigger.click()
    await expect(page.getByPlaceholder(/search/i)).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, `palette-open-${width}.png`) })
  })
}

test('palette trigger keeps its label and hint on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await injectFakeAuth(page.context(), BASE)
  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle' })

  await expect(page.locator(TRIGGER)).toBeVisible()
  await expect(page.getByText('Search...', { exact: true })).toBeVisible()
})
