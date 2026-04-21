/**
 * Journey 1: PI Morning Workflow
 * Persona: Nick (PI), checking in at 7am, quick overview then priority work.
 */
import { test, expect, go, vis, waitForToast } from './fixtures'
import { P } from '../../helpers/paths'

test.describe('Journey 1: PI Morning Workflow', () => {
  test('Dashboard → triage → tasks → projects → grants', async ({ journeyPage: page }) => {
    // 1. Navigate to /dashboard
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    // 2. Greeting visible (time-appropriate)
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 5000 })
    const h1Text = await heading.textContent()
    expect(h1Text).toMatch(/Good (morning|afternoon|evening)|Welcome/)

    // 3-5. Dashboard cards visible
    const hasTaskCard = await vis(page, 'text=Tasks')
    expect(hasTaskCard).toBe(true)

    // 6. Navigate to /my-tasks
    await go(page, P.myTasks)

    // 10-11. My Tasks page — task list shows tasks
    await expect(page.locator('h1')).toContainText(/task/i, { timeout: 5000 })
    const taskRows = page.locator('[data-testid^="task-row-"]')
    await expect(taskRows.first()).toBeVisible({ timeout: 8000 })
    const rowCount = await taskRows.count()
    expect(rowCount).toBeGreaterThan(0)
    console.log(`Task rows visible: ${rowCount}`)

    // 12-13. Click a task row → TaskDetailPanel opens
    const titleCell = taskRows.first().locator('[data-testid^="task-title-"]').first()
    if (await titleCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await titleCell.click()
    } else {
      await taskRows.first().click()
    }
    await page.waitForTimeout(1000)

    const detailPanel = page.locator('[data-testid="task-detail-panel"]')
    await expect(detailPanel).toBeVisible({ timeout: 5000 })

    // 14. Close TaskDetailPanel
    await page.locator('[data-testid="close-detail-panel"]').click()
    await expect(detailPanel).not.toBeVisible({ timeout: 3000 })

    // 15-17. Navigate to /projects — h1 is "Research Pipeline"
    await go(page, P.projects)
    await expect(page.locator('h1')).toContainText(/Research Pipeline/i, { timeout: 5000 })

    // Click any project row → navigates to /projects/:slug
    const anyProjectRow = page.locator('tr').filter({ has: page.locator('td') }).first()
    if (await anyProjectRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await anyProjectRow.click()
      await page.waitForTimeout(2000)
      expect(page.url()).toMatch(/\/projects\//)
    }

    // 18-22. Navigate to /grants — h1 is "Grants & Funding"
    await go(page, P.grants)
    await expect(page.locator('h1')).toContainText(/grant/i, { timeout: 5000 })

    // Click any grant row → detail expands (R11-8)
    const grantRow = page.locator('[role="button"]').first()
    if (await grantRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await grantRow.click()
      await page.waitForTimeout(1000)
      console.log('Clicked grant row, detail should expand')
    }
  })
})
