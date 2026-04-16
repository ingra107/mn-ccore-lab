/**
 * Journey 5: Research Reader
 * Persona: Researcher consuming the daily digest and managing publications.
 *
 * Publications is a PUBLIC page (Layout, not PortalLayout). h1 = "Publications".
 * Ideas is a portal page. h1 = dynamically set.
 */
import { test, expect, go, vis } from './fixtures'

test.describe('Journey 5: Research Reader', () => {
  test('Digest → publications → ideas → vote → create idea', async ({ journeyPage: page }) => {
    // 1-3. Navigate to /digest — h1 = "Research Digest"
    const errors = await go(page, '/digest')
    expect(errors).toEqual([])
    await expect(page.locator('h1')).toContainText(/digest/i, { timeout: 5000 })

    // Check for any digest content
    const digestContent = page.locator('article, [class*="card"], [class*="paper"], h3, h2').first()
    const hasContent = await digestContent.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`Digest has content: ${hasContent}`)

    // Copy Reading List button (if available)
    const copyBtn = page.locator('button').filter({ hasText: /Copy/ })
    const hasCopy = await copyBtn.first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Copy button: ${hasCopy}`)

    // 5-7. Navigate to /publications (PUBLIC page)
    await go(page, '/publications')
    await expect(page.locator('h1')).toContainText(/Publication/i, { timeout: 5000 })

    // Publications should show (either seeded or real data)
    // Look for any publication content — journal names, author names, titles
    const pubContent = page.locator('h3, h2, [class*="pub"], [class*="card"]').first()
    const hasPubs = await pubContent.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`Publications content visible: ${hasPubs}`)

    // 8-9. Copy bibliography button
    const bibBtn = page.locator('button').filter({ hasText: /Copy bibliography/ })
    if (await bibBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await bibBtn.first().click()
      await page.waitForTimeout(500)
      console.log('Clicked copy bibliography')
    }

    // 10-13. Navigate to /ideas
    await go(page, '/ideas')
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 })

    // Ideas should show (seeded or real)
    const ideaContent = page.locator('[role="button"], tr, article, [class*="card"]').first()
    const hasIdeas = await ideaContent.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`Ideas content visible: ${hasIdeas}`)

    if (hasIdeas) {
      // Click an idea → detail panel expands (R11-6)
      await ideaContent.click()
      await page.waitForTimeout(1000)
      console.log('Clicked idea row')
    }

    // 16-18. Press N key → CreateIdeaModal opens
    // First close any expanded panel
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await page.keyboard.press('n')
    await page.waitForTimeout(1000)

    // Look for idea creation modal
    const ideaModal = page.locator('[role="dialog"]').first()
    const hasModal = await ideaModal.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Create Idea modal from N-key: ${hasModal}`)

    if (hasModal) {
      // Fill title
      const titleInput = ideaModal.locator('input[type="text"], textarea').first()
      if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await titleInput.fill('JOURNEY5 test idea from N-key')
        // Submit
        const submitBtn = ideaModal.locator('button[type="submit"], button').filter({ hasText: /Submit|Create|Save|Add/ })
        if (await submitBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.first().click()
          await page.waitForTimeout(1000)
        }
      }
    }

    // Clean up
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })
})
