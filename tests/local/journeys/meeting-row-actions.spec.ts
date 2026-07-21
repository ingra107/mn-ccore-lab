/**
 * Journey: quick row actions on meeting action items (2026-07-21).
 *
 * The meeting pipeline deliberately over-produces action items, so removing an
 * irrelevant one has to be one click with a real undo — not "expand → open the
 * full editor → delete → confirm".
 *
 * What this proves that the API/unit tests cannot: the controls actually RENDER
 * on the page and are reachable. Every assertion goes through getByRole with an
 * accessible name, so a strip that renders only as :hover-styled anonymous
 * <div>s would fail here — that is the point. Hover-only affordances that are
 * invisible to the accessibility tree are the failure mode being guarded.
 */
import { test, expect, go } from './fixtures'
import { P } from '../../helpers/paths'

const API = 'http://localhost:8787'
const AUTH = {
  'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
  'X-Test-User': 'ingra107@umn.edu',
  'Content-Type': 'application/json',
}

test.describe('Meeting action items — quick row actions', () => {
  test('delete is one click + undoable, and every verb is in the a11y tree', async ({ journeyPage: page, request }) => {
    // Seed a disposable action item on the first meeting.
    const meetingsRes = await request.get(`${API}/api/meetings`, { headers: AUTH })
    const meetings = await meetingsRes.json()
    const meetingId = meetings.data[0].id as string

    const title = `Row-action probe ${Date.now()}`
    const createRes = await request.post(`${API}/api/tasks`, {
      headers: AUTH,
      data: { title, description: title, assignee: 'nick-ingraham', meeting_id: meetingId, priority: 'medium' },
    })
    const taskId = (await createRes.json()).data.id as string

    try {
      const errors = await go(page, P.meeting(meetingId))
      expect(errors).toEqual([])

      const row = page.locator(`[data-task-id="${taskId}"]`)
      await expect(row).toBeVisible({ timeout: 10000 })

      // The project chip is ALWAYS present (not hover-gated) — a mis-routed
      // item has to be spottable at rest, which is the failure that prompted this.
      await expect(row.getByRole('combobox', { name: 'Project' })).toBeAttached()

      // The verbs are in the accessibility tree with real names even before any
      // hover — i.e. keyboard/screen-reader reachable, revealed by CSS only.
      await expect(row.getByRole('button', { name: 'Edit action item' })).toBeAttached()
      await expect(row.getByRole('button', { name: 'Delete action item' })).toBeAttached()

      // ...and EXACTLY ONE accessible "Mark done" per row. The strip's done
      // verb is a pointer-only duplicate of the canonical DoneBox and must stay
      // out of the a11y tree; two identically-named buttons would make a screen
      // reader announce the same action twice. This assertion is what caught the
      // duplicate on the first run of this spec.
      await expect(row.getByRole('button', { name: 'Mark done' })).toHaveCount(1)

      // One click deletes — no confirm dialog stands in the way.
      await row.hover()
      await row.getByRole('button', { name: 'Delete action item' }).click()

      await expect(page.locator('[data-testid="undo-toast"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator(`[data-task-id="${taskId}"]`)).toHaveCount(0, { timeout: 5000 })

      // Undo restores the real row (real tombstone → real restore endpoint).
      await page.locator('[data-testid="undo-button"]').first().click()
      await expect(page.locator(`[data-task-id="${taskId}"]`)).toBeVisible({ timeout: 10000 })

      // And the restore truly un-set the tombstone server-side.
      const after = await (await request.get(`${API}/api/meetings/${meetingId}`, { headers: AUTH })).json()
      const restored = after.data.action_items.find((a: { id: string }) => a.id === taskId)
      expect(restored).toBeTruthy()
      expect(restored.deleted_at).toBeNull()
      expect(restored.status).toBe('todo')
    } finally {
      await request.post(`${API}/api/tasks/batch`, { headers: AUTH, data: { action: 'delete', ids: [taskId] } })
    }
  })

  // The failure that prompted the whole feature: a meeting's action items landed
  // on the WRONG project and there was no fast way to move them. The chip has to
  // (a) read at rest, so a mis-route is spottable, and (b) re-route in one pick.
  test('project chip re-routes an action item without opening any panel', async ({ journeyPage: page, request }) => {
    const meetings = await (await request.get(`${API}/api/meetings`, { headers: AUTH })).json()
    const meetingId = meetings.data[0].id as string
    const projects = await (await request.get(`${API}/api/projects`, { headers: AUTH })).json()
    const target = projects.data[0] as { slug: string; title: string }

    const title = `Reassign probe ${Date.now()}`
    const createRes = await request.post(`${API}/api/tasks`, {
      headers: AUTH,
      data: { title, description: title, assignee: 'nick-ingraham', meeting_id: meetingId, priority: 'medium' },
    })
    const taskId = (await createRes.json()).data.id as string

    try {
      await go(page, P.meeting(meetingId))
      const row = page.locator(`[data-task-id="${taskId}"]`)
      await expect(row).toBeVisible({ timeout: 10000 })

      // Unrouted items read "No project" at rest — the plain project LINK
      // renders nothing when project_id is null, i.e. the rows most likely to be
      // mis-routed were previously the least visible.
      const chip = row.getByRole('combobox', { name: 'Project' })
      await expect(chip).toHaveText(/No project/, { timeout: 5000 })

      await chip.click()
      await page.getByRole('option', { name: target.title, exact: true }).first().click()

      // Chip updates in place — no panel, no expand.
      await expect(chip).toHaveText(new RegExp(target.title.slice(0, 12)), { timeout: 10000 })

      const after = await (await request.get(`${API}/api/meetings/${meetingId}`, { headers: AUTH })).json()
      const moved = after.data.action_items.find((a: { id: string }) => a.id === taskId)
      expect(moved.project_id).toBe(target.slug)
    } finally {
      await request.post(`${API}/api/tasks/batch`, { headers: AUTH, data: { action: 'delete', ids: [taskId] } })
    }
  })
})
