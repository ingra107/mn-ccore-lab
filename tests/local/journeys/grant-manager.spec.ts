/**
 * Journey 3: Grant Manager
 * Persona: Nick managing grant portfolio — status updates, deadlines, milestones.
 *
 * Grants page h1 = "Grants & Funding". Deadlines h1 = "Deadlines & Milestones".
 */
import { test, expect, go, vis, waitForToast } from './fixtures'

test.describe('Journey 3: Grant Manager', () => {
  test('Grants → detail → deadlines → inline edits', async ({ journeyPage: page }) => {
    // 1-3. Navigate to /grants
    const errors = await go(page, '/grants')
    expect(errors).toEqual([])
    await expect(page.locator('h1')).toContainText(/Grant/i, { timeout: 5000 })

    // Any grant row visible
    const grantRows = page.locator('[role="button"]')
    const grantCount = await grantRows.count()
    console.log(`Grant rows: ${grantCount}`)

    if (grantCount > 0) {
      // 4-5. Click grant row → detail panel expands (R11-8)
      await grantRows.first().click()
      await page.waitForTimeout(1500)
      console.log('Clicked first grant row')

      // 6. Press Escape → collapse
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    // 7-8. Check view toggles (List/Timeline)
    const timelineBtn = page.locator('button').filter({ hasText: /Timeline/ })
    if (await timelineBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await timelineBtn.first().click()
      await page.waitForTimeout(1000)
      const chart = page.locator('svg').first()
      const hasChart = await chart.isVisible({ timeout: 3000 }).catch(() => false)
      console.log(`Timeline chart visible: ${hasChart}`)

      // Switch back to list
      const listBtn = page.locator('button').filter({ hasText: /List/ })
      if (await listBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await listBtn.first().click()
        await page.waitForTimeout(500)
      }
    }

    // 9. Navigate to /deadlines
    await go(page, '/deadlines')
    await expect(page.locator('h1')).toContainText(/Deadline/i, { timeout: 5000 })

    // 10. Check for any deadline/task rows
    const deadlineContent = page.locator('[data-testid^="task-row-"], tr').filter({ has: page.locator('td') })
    const deadlineCount = await deadlineContent.count()
    console.log(`Deadline rows: ${deadlineCount}`)

    // Even if empty, page should render without error
    if (deadlineCount > 0) {
      // 11-12. Click a due-date cell → InlineDatePicker
      const dueDateCell = page.locator('[data-testid^="task-due-"]').first()
      if (await dueDateCell.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dueDateCell.click()
        await page.waitForTimeout(500)
        console.log('Clicked due-date cell')
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      }

      // 14-15. Click status dropdown → change status
      const statusCell = page.locator('[data-testid^="task-status-"]').first()
      if (await statusCell.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusCell.click({ force: true })
        await page.waitForTimeout(500)

        const options = page.locator('[role="option"], li, button').filter({ hasText: /In Progress|Done|Todo/ })
        if (await options.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await options.first().click()
          await page.waitForTimeout(500)
          const hadToast = await waitForToast(page)
          console.log(`Status change toast: ${hadToast}`)
        } else {
          await page.keyboard.press('Escape')
        }
      }
    }
  })
})
