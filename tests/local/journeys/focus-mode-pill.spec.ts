import { test, expect } from '@playwright/test'

// Wave 3 integration: the focus-mode exit pill must sit at the top-right of
// the viewport. .tk-btn sets position:relative, which beat Tailwind's .fixed
// when both were on the button, so the pill flowed into the page instead.
const HEADERS = { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' }

test('focus-mode exit pill is pinned to the viewport corner', async ({ page }) => {
  await page.setExtraHTTPHeaders(HEADERS)
  await page.goto('/portal/my-tasks')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('toggle-focus')))
  const pill = page.getByTestId('focus-exit-pill')
  await expect(pill).toBeVisible()
  const vp = page.viewportSize()!
  const box = (await pill.boundingBox())!
  expect(box.y).toBeLessThan(24)
  expect(vp.width - (box.x + box.width)).toBeLessThan(24)
  expect(await pill.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  await page.evaluate(() => window.scrollTo(0, 400))
  const after = (await pill.boundingBox())!
  expect(after.y).toBe(box.y)
  await page.screenshot({ path: 'review/w3-integrate/focus-pill.png' })
  await page.getByRole('button', { name: /Focus · F to exit/ }).click()
  await expect(pill).toHaveCount(0)
})
