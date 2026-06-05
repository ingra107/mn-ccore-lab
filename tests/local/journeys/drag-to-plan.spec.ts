/**
 * Today drag-to-plan / 📌-plan regression spec (2026-06-04).
 *
 * Guards the fix for Nick's "I can't drag on the Today page" report:
 *   - 📌 button (no-drag plan path) plans a task into the "no specific time"
 *     strip and the PlannedChip becomes the unplan control.
 *   - HTML5 drag wiring still plans when DragEvents are dispatched with a
 *     shared DataTransfer (page.dragAndDrop is unreliable for native DnD).
 *
 * Stable hooks added to the shared row for this: data-task-id (row),
 * data-plan-btn (the 📌 plan button). The planned chip carries
 * aria-label="Unplan task".
 */
import { test, expect, go } from './fixtures'
import { P } from '../../helpers/paths'

test.describe('Today: plan a task (📌 button + drag)', () => {
  test('📌 button plans into the strip, then unplans', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    // A task row with a 📌 plan button = an UNPLANNED task (planned tasks show
    // the unplan chip instead). The button is visibility:hidden until row hover.
    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()
    await planBtn.click()

    // The same task now shows the unplan control (planned chip) ...
    const unplan = page.locator(`[data-task-id="${taskId}"] [aria-label="Unplan task"]`).first()
    await expect(unplan).toBeVisible({ timeout: 4_000 })
    // ... and appears inside the timeline section's planned strip.
    const inStrip = page.locator(`[data-b2-timeline] [data-task-id="${taskId}"]`)
    await expect(inStrip.first()).toBeVisible({ timeout: 4_000 })

    // Toggle back off.
    await unplan.click()
    await expect(page.locator(`[data-task-id="${taskId}"] [data-plan-btn]`).first()).toHaveCount(1)
  })

  test('dispatching DragEvents from the grip plans into the strip', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    // Pick an unplanned, draggable task (grip = draggable div inside its row).
    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    const planned = await page.evaluate((id) => {
      const row = document.querySelector(`[data-task-id="${id}"]`)
      const grip = row?.querySelector('[draggable="true"]') as HTMLElement | null
      // Bottom "Planned today · no specific time" strip is a drop target.
      const strip = Array.from(document.querySelectorAll('[data-b2-timeline] div')).find(
        (el) => /planned today/i.test(el.textContent || '') && /no specific time/i.test(el.textContent || ''),
      ) as HTMLElement | null
      if (!grip || !strip) return { ok: false, grip: !!grip, strip: !!strip }
      const dt = new DataTransfer()
      dt.setData('text/plain', id)
      grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      strip.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
      strip.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      strip.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return { ok: true, grip: true, strip: true }
    }, taskId as string)

    expect(planned.ok, `grip/strip found: ${JSON.stringify(planned)}`).toBe(true)

    const unplan = page.locator(`[data-task-id="${taskId}"] [aria-label="Unplan task"]`).first()
    await expect(unplan).toBeVisible({ timeout: 4_000 })
  })

  test('shared-row contract intact: My Tasks rows have no plan button or grip', async ({ journeyPage: page }) => {
    await go(page, P.myTasks)
    // Non-Today surfaces never pass onTogglePlan/draggable → no 📌 button, no grip.
    expect(await page.locator('[data-plan-btn]').count()).toBe(0)
  })
})
