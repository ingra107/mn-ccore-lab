import { test, expect } from './fixtures'
import { mkdirSync } from 'node:fs'

// Today capture box: "send to home" is a toggle chip in the chip row and the
// Capture button appears at the right of the same row. Typing must not change
// the box height (no second row, no taller button), at desktop and phone width.
// Set CAPTURE_SHOTS=<theme> to also write review/s64/ screenshots for that theme.
const VIEWPORTS = [{ name: '1440', width: 1440, height: 900 }, { name: '375', width: 375, height: 812 }]
const SHOTS = process.env.CAPTURE_SHOTS

test.setTimeout(90_000)

for (const vp of VIEWPORTS) {
  test(`Today capture row keeps its height and the home chip toggles (${vp.name})`, async ({ journeyPage: page }) => {
    // "send to home" renders for the PI only; the local test user is not one.
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: { authenticated: true, email: 'nick@umn.edu', name: 'Nick', slug: 'nick', isMember: true, isPi: true } })
    })
    if (SHOTS) await page.addInitScript((t) => { localStorage.setItem('mn-ccore-theme', t) }, SHOTS)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/portal/dashboard', { waitUntil: 'load' })

    const box = page.locator('.tk-compose').first()
    const ta = box.locator('textarea')
    await ta.waitFor({ timeout: 10_000 })
    const chip = box.getByTestId('send-home')
    await expect(chip).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await expect(box.getByTestId('capture-btn')).toHaveCount(0)

    const idle = (await box.boundingBox())!.height
    if (SHOTS) { mkdirSync('review/s64', { recursive: true }); await box.screenshot({ path: `review/s64/C-${SHOTS}-${vp.name}-idle.png` }) }

    await ta.click()
    await ta.fill('Call the pharmacy about the heparin protocol')
    await expect(box.getByRole('button', { name: 'Capture' })).toBeVisible()
    const typed = (await box.boundingBox())!.height
    expect(typed).toBe(idle)
    if (SHOTS) await box.screenshot({ path: `review/s64/C-${SHOTS}-${vp.name}-focused.png` })

    // The chip sits in the toolbar row, on the same line as Capture.
    const [c, k] = [await chip.boundingBox(), await box.getByRole('button', { name: 'Capture' }).boundingBox()]
    expect(Math.abs((c!.y + c!.height / 2) - (k!.y + k!.height / 2))).toBeLessThan(2)

    await expect(chip).toHaveAttribute('role', 'switch')
    await expect(chip).toHaveAttribute('aria-checked', 'false')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-checked', 'true')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-checked', 'false')
    expect((await box.boundingBox())!.height).toBe(idle)
  })
}
