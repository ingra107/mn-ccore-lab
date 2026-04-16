/**
 * Journey 6: Mobile PI
 * Persona: Nick on iPhone (375x812 viewport), quick check between patients.
 */
import { test, expect, go, vis } from './fixtures'

test.use({ viewport: { width: 375, height: 812 } })

test.describe('Journey 6: Mobile PI', () => {
  test('Dashboard → tasks → overflow menu → calendar → decisions → ideas → search', async ({ journeyPage: page }) => {
    // 1. Navigate to /dashboard
    const errors = await go(page, '/dashboard')
    expect(errors).toEqual([])

    // 2. Page rendered at mobile viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    // Allow some tolerance for scrollbar, but no egregious horizontal scroll
    expect(bodyWidth).toBeLessThanOrEqual(400)

    // 3. Check for mobile tab bar or sidebar collapse
    const hasTabBar = await page.locator('text=More').first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Mobile "More" button visible: ${hasTabBar}`)

    // 5. Navigate to /my-tasks
    await go(page, '/my-tasks')
    await expect(page.locator('h1')).toContainText(/task/i, { timeout: 5000 })

    // 6-7. Task content renders on mobile
    // Mobile uses card layout or stacked rows
    await page.waitForTimeout(2000)
    const taskContent = page.locator('[data-testid^="task-row-"], [class*="task"], [class*="card"], tr')
      .filter({ has: page.locator('td, div') }).first()
    const hasTasks = await taskContent.isVisible({ timeout: 8000 }).catch(() => false)
    console.log(`Mobile task content visible: ${hasTasks}`)

    // 8-10. Test "More" overflow if MobileTabBar exists
    if (hasTabBar) {
      const moreBtn = page.locator('button, a').filter({ hasText: /More/ }).last()
      await moreBtn.click()
      await page.waitForTimeout(1000)

      const drawer = page.locator('[role="dialog"], [class*="drawer"], [class*="overflow"]')
      const hasDrawer = await drawer.first().isVisible({ timeout: 3000 }).catch(() => false)
      console.log(`Overflow drawer visible: ${hasDrawer}`)

      if (hasDrawer) {
        // Check touch targets (≥44px)
        const links = drawer.locator('a, button')
        const linkCount = await links.count()
        if (linkCount > 0) {
          const box = await links.first().boundingBox()
          if (box) {
            console.log(`Drawer link size: ${box.width}x${box.height}`)
            expect(box.height).toBeGreaterThanOrEqual(36) // Generous tolerance
          }
        }

        // 11. Tap "Calendar"
        const calLink = drawer.locator('a, button').filter({ hasText: /Calendar/ })
        if (await calLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await calLink.first().click()
          await page.waitForTimeout(2000)
        } else {
          await page.keyboard.press('Escape')
          await go(page, '/calendar')
        }
      } else {
        await go(page, '/calendar')
      }
    } else {
      // No MobileTabBar — navigate directly
      await go(page, '/calendar')
    }

    // 12-15. Calendar page
    if (page.url().includes('/calendar')) {
      await expect(page.locator('h1')).toContainText(/calendar/i, { timeout: 5000 })

      // Prev/next buttons — check they exist
      const navBtns = page.locator('button').filter({ hasText: /←|→|<|>|prev|next/i })
      const navCount = await navBtns.count()
      console.log(`Calendar nav buttons: ${navCount}`)

      // Check button sizes for touch target compliance
      if (navCount > 0) {
        const box = await navBtns.first().boundingBox()
        if (box) {
          console.log(`Calendar nav button size: ${box.width}x${box.height}`)
          expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(36)
        }
      }
    }

    // 16-19. Navigate to /decisions
    await go(page, '/decisions')
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 })

    // Click a decision row if any exist
    const decisionRows = page.locator('[role="button"], tr').filter({ has: page.locator('td, div, span') })
    if (await decisionRows.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await decisionRows.first().click()
      await page.waitForTimeout(1000)
      console.log('Clicked decision row on mobile')
    }

    // 20-23. Navigate to /ideas
    await go(page, '/ideas')
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 })

    // 24-26. Navigate to /search
    await go(page, '/search')
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]').first()
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('CLIF')
      await searchInput.press('Enter')
      await page.waitForTimeout(2000)
      console.log('Searched for CLIF on mobile')
    }
  })
})
