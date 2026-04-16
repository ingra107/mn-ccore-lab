import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', () => {})

  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'load' })
  await page.waitForTimeout(3000)

  const btn = page.locator('button').filter({ hasText: /Report a Bug/ })
  const visible = await btn.isVisible({ timeout: 5000 }).catch(() => false)
  console.log(`Bug report button visible: ${visible}`)

  if (visible) {
    await btn.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'review/visual-audit/34-bug-report-modal.png' })
    console.log('Modal screenshot saved')
  } else {
    // Maybe sidebar is collapsed — try hamburger
    await page.screenshot({ path: 'review/visual-audit/34-sidebar-state.png' })
    console.log('Sidebar screenshot saved (no bug button found)')
  }

  await browser.close()
}

main().catch(console.error)
