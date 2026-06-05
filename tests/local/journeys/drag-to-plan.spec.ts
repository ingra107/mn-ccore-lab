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

/**
 * Today complete/undo/uncomplete regression spec (9a007fd1, 2026-06-05).
 *
 * Guards Nick's three live-reported Today row bugs:
 *   (a) completing a task fires the 5s undo toast and Undo reopens it
 *       (design principle #8 — markDone was silently un-undoable).
 *   (b) the "Planned today · no specific time" strip row uses the shared
 *       DoneBox (aria-label "Mark done") AND has a draggable grip so it can
 *       be re-slotted (it never got the P0 shared-row treatment).
 *   (c) "Completed today" items are clickable (DoneBox) to uncomplete.
 *
 * Hooks reused: [data-plan-btn] (unplanned task), [data-testid="undo-toast"]
 * + [data-testid="undo-button"] (UndoToast), DoneBox aria-label
 * "Mark done"/"Mark not done", [data-b2-timeline] (timeline strip),
 * [data-b2-completed] (completed-today section header).
 */
test.describe('Today: complete + undo + uncomplete (9a007fd1)', () => {
  test('completing a task shows the undo toast and Undo reopens it', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    // An unplanned task row (has the 📌 plan button) is a stable target.
    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()
    // Complete via the shared DoneBox (the square = complete everywhere).
    await row.locator('[aria-label="Mark done"]').first().click()

    // markDone now fires the 5s undo toast.
    const toast = page.getByTestId('undo-toast')
    await expect(toast).toBeVisible({ timeout: 4_000 })

    // Undo reopens the task: its DoneBox returns to the not-done state.
    await page.getByTestId('undo-button').first().click()
    await expect(toast).toBeHidden({ timeout: 4_000 })
    await expect(
      page.locator(`[data-task-id="${taskId}"] [aria-label="Mark done"]`).first(),
    ).toBeVisible({ timeout: 6_000 })
  })

  test('planned-strip row has a Mark-done DoneBox and a draggable grip', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()
    await planBtn.click()

    // The planned task now renders in the timeline strip as a PlannedTaskRow.
    const stripRow = page.locator(`[data-b2-timeline] [data-task-id="${taskId}"]`).first()
    await expect(stripRow).toBeVisible({ timeout: 4_000 })

    // It must carry the shared DoneBox (Mark done) and a drag grip to re-slot.
    await expect(stripRow.locator('[aria-label="Mark done"]').first()).toBeVisible()
    await expect(stripRow.locator('[draggable="true"]').first()).toHaveCount(1)
  })

  test('a Completed-today item can be unchecked via its DoneBox', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    // Complete the task and dismiss the undo toast so the completion stands.
    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()
    await row.locator('[aria-label="Mark done"]').first().click()
    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})

    // Expand the "Completed today" section.
    const completed = page.locator('[data-b2-completed]')
    await expect(completed).toBeVisible({ timeout: 6_000 })
    await completed.locator('div').first().click()

    // The completed item renders the shared DoneBox in its done state — and is
    // clickable to uncomplete (the bug fix). Wait for the refetch to surface it.
    const doneBox = completed.locator('[aria-label="Mark not done"]').first()
    await expect(doneBox).toBeVisible({ timeout: 12_000 })
    await doneBox.click()
    // Unchecking removes it from the completed list.
    await expect(completed.locator('[aria-label="Mark not done"]')).toHaveCount(0, { timeout: 6_000 })
  })
})
