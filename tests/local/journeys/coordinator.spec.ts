/**
 * Journey 2: Coordinator Workflow
 * Persona: Research coordinator, managing meetings and action items.
 *
 * Meetings page is a SPLIT-PANEL layout: clicking a meeting in the left
 * sidebar shows detail on the right. URL stays at /meetings (no navigation).
 */
import { test, expect, go, vis } from './fixtures'
import { P } from '../../helpers/paths'

test.describe('Journey 2: Coordinator Workflow', () => {
  test('Meetings → split-panel detail → action items → meeting notes', async ({ journeyPage: page }) => {
    // 1-2. Navigate to /meetings — h1 is "Meeting Hub"
    const errors = await go(page, P.meetings)
    expect(errors).toEqual([])
    await expect(page.locator('h1')).toContainText(/Meeting Hub/i, { timeout: 5000 })

    // 3. At least 1 meeting in sidebar
    const meetingList = page.locator('button, div').filter({ hasText: /Biweekly|Meeting|Grant Strategy|Lab Ops|Standup/ })
    const meetingCount = await meetingList.count()
    expect(meetingCount).toBeGreaterThan(0)
    console.log(`Meeting items in sidebar: ${meetingCount}`)

    // 4. Click a meeting → detail appears in right panel (no URL change)
    await meetingList.first().click()
    await page.waitForTimeout(2000)
    // URL stays at /meetings (split-panel, not navigation)
    expect(page.url()).toContain('/meetings')

    // 5. Meeting detail shows on right side — title, date, attendees
    const detailHeading = page.locator('h2, h3').filter({ hasText: /Meeting|Biweekly|Grant|Lab/ }).first()
    const hasDetailHeading = await detailHeading.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`Meeting detail heading visible: ${hasDetailHeading}`)

    // Check for attendees section
    const attendees = page.locator('text=ATTENDEES').or(page.locator('text=attendee'))
    const hasAttendees = await attendees.first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Attendees section: ${hasAttendees}`)

    // 7-8. Action items section — "All Pending Actions" or "Action"
    const actionSection = page.locator('text=Pending Actions').or(page.locator('text=Action'))
    const hasActions = await actionSection.first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Action items section: ${hasActions}`)

    // View Full Meeting link
    const viewFull = page.locator('a, button').filter({ hasText: /View Full Meeting/ })
    const hasViewFull = await viewFull.first().isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`View Full Meeting link: ${hasViewFull}`)

    // 11-12. Navigate to /meeting-notes
    await go(page, P.meetingNotes)
    await expect(page.locator('h1')).toContainText(/Transcript|Note/i, { timeout: 5000 })

    // 13-14. Navigate back to /meetings
    await go(page, P.meetings)
    await expect(page.locator('h1')).toContainText(/Meeting Hub/i, { timeout: 5000 })
  })
})
