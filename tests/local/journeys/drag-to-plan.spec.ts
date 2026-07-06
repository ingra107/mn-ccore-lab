/**
 * Today drag-to-plan / 📌-plan regression spec (2026-06-04).
 *
 * Guards the fix for Nick's "I can't drag on the Today page" report:
 *   - 📌 button (no-drag plan path) plans a task into the "no specific time"
 *     strip and the PlannedChip becomes the unplan control.
 *   - Dragging the row's grip also plans into the strip. Updated 2026-07-06:
 *     the native-HTML5-DragEvent mechanism this originally guarded was fully
 *     replaced by dnd-kit (bcd72c6a, GH#150, 2026-06-24) — dnd-kit's
 *     useDraggable never sets a native draggable="true" attribute and does
 *     not listen for dragstart/dragover/drop, so the old dispatch approach
 *     can never activate it. The drag is now simulated via page.mouse
 *     (move/down/move/up), matching dnd-kit's PointerSensor contract.
 *
 * The "Planned today, no specific time" strip lives in PlannedTodaySection
 * (data-b2-planned-today), a sibling of Timeline (data-b2-timeline) since
 * 2f080f0f (2026-06-16) extracted it out of the Timeline component.
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
    // ... and appears inside the Planned-today strip section (sibling of
    // Timeline since 2f080f0f, 2026-06-16 — see file header).
    const inStrip = page.locator(`[data-b2-planned-today] [data-task-id="${taskId}"]`)
    await expect(inStrip.first()).toBeVisible({ timeout: 4_000 })

    // Toggle back off.
    await unplan.click()
    await expect(page.locator(`[data-task-id="${taskId}"] [data-plan-btn]`).first()).toHaveCount(1)
  })

  test('dragging the grip plans a task into the strip (dnd-kit pointer drag)', async ({ journeyPage: page }) => {
    const errors = await go(page, P.dashboard)
    expect(errors).toEqual([])

    const planBtn = page.locator('[data-plan-btn]').first()
    await expect(planBtn).toHaveCount(1, { timeout: 10_000 })
    const taskId = await planBtn.getAttribute('data-plan-btn')
    expect(taskId).toBeTruthy()

    const row = page.locator(`[data-task-id="${taskId}"]`).first()
    await row.hover()
    // The grip (⋮⋮) is visibility:hidden until row hover — give it a beat.
    await page.waitForTimeout(150)

    // Measure both the grip and the drop target in ONE evaluate call, in the
    // same scroll state — measuring them separately (e.g. two .boundingBox()
    // calls with an intervening scrollIntoView) drifts the coordinates when
    // one target is off-screen relative to the other, producing a flaky drop.
    const rects = await page.evaluate((id) => {
      const rowEl = document.querySelector(`[data-task-id="${id}"]`)
      const grip = rowEl?.querySelector('[title="Drag to timeline to schedule this task"]')
      const stripEl = document.querySelector('[data-b2-planned-today]')
      if (!grip || !stripEl) return null
      const g = grip.getBoundingClientRect()
      const s = stripEl.getBoundingClientRect()
      return {
        grip: { x: g.x, y: g.y, width: g.width, height: g.height },
        strip: { x: s.x, y: s.y, width: s.width, height: s.height },
      }
    }, taskId as string)
    expect(rects, 'grip + Planned-today drop target both present').toBeTruthy()

    const srcX = rects!.grip.x + rects!.grip.width / 2
    const srcY = rects!.grip.y + rects!.grip.height / 2
    const dstX = rects!.strip.x + rects!.strip.width / 2
    const dstY = rects!.strip.y + rects!.strip.height / 2

    // dnd-kit's PointerSensor (TodayDndContext) needs real pointer movement
    // past its 4px activation constraint — page.dragAndDrop() and raw
    // DragEvent dispatch don't activate it (see file header).
    await page.mouse.move(srcX, srcY)
    await page.mouse.down()
    await page.mouse.move(srcX + 8, srcY - 8, { steps: 5 })
    await page.mouse.move(dstX, dstY, { steps: 15 })
    await page.waitForTimeout(250)
    await page.mouse.up()

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

    // The planned task now renders in the Planned-today strip as a PlannedTaskRow
    // (sibling of Timeline since 2f080f0f, 2026-06-16 — see file header).
    const stripRow = page.locator(`[data-b2-planned-today] [data-task-id="${taskId}"]`).first()
    await expect(stripRow).toBeVisible({ timeout: 4_000 })

    // It must carry the shared DoneBox (Mark done) and a drag grip to re-slot.
    // dnd-kit's useDraggable never sets a native draggable="true" attribute
    // (see file header) — PlannedTaskRow's grip is identified by its stable
    // .task-grip class instead.
    await expect(stripRow.locator('[aria-label="Mark done"]').first()).toBeVisible()
    await expect(stripRow.locator('.task-grip').first()).toHaveCount(1)
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
