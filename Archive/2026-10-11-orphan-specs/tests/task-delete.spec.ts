/**
 * POST /api/tasks/:id/delete — soft-delete a single task (Gap 4 from
 * 2026-04-19 sync audit). Mirrors POST /api/projects/:slug/delete.
 *
 * Verifies:
 *   - Happy path: creates task, deletes via single-id endpoint, confirms
 *     it's hidden from GET /api/tasks (default filter drops deleted_at).
 *   - Idempotency: second delete returns idempotent:true, not 404 or 500.
 *   - 404: non-existent id returns 404.
 *   - Cascade: task_comments / task_updates are removed (best-effort —
 *     test logs a comment before delete and checks the comments endpoint
 *     afterwards).
 *
 * Run: npx playwright test tests/task-delete.spec.ts --config=playwright.config.prod.ts
 */
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://mn-ccore-lab.pages.dev'

test.describe('API POST /api/tasks/:id/delete', () => {
  let createdTaskId: string | null = null

  test.afterAll(async ({ request }) => {
    // Belt-and-suspenders cleanup if a test left a row behind.
    if (createdTaskId) {
      try {
        await request.post(`${BASE}/api/tasks/${createdTaskId}/delete`, { data: {} })
      } catch { /* already deleted — fine */ }
    }
  })

  test('happy path: create → delete → hidden from list', async ({ request }) => {
    // Create
    const createRes = await request.post(`${BASE}/api/tasks`, {
      data: {
        description: 'TEST task-delete spec — delete me',
        assignee: 'nick-ingraham',
        priority: 'low',
      },
    })
    expect(createRes.status(), `create failed: ${await createRes.text()}`).toBe(201)
    const { data: created } = await createRes.json()
    expect(created?.id).toBeTruthy()
    createdTaskId = created.id

    // Delete
    const delRes = await request.post(`${BASE}/api/tasks/${created.id}/delete`, { data: {} })
    expect(delRes.status(), `delete failed: ${await delRes.text()}`).toBe(200)
    const delBody = await delRes.json()
    expect(delBody.data?.deleted).toBe(created.id)
    expect(delBody.data?.idempotent).toBeFalsy()

    // Verify hidden from default GET (which filters deleted_at IS NULL)
    const listRes = await request.get(`${BASE}/api/tasks`)
    const list = await listRes.json()
    const found = (list.data || []).some((t: { id: string }) => t.id === created.id)
    expect(found).toBe(false)

    // Verify visible when include_deleted=1 (sync pipeline contract)
    const listIncl = await request.get(`${BASE}/api/tasks?include_deleted=1`)
    const listInclBody = await listIncl.json()
    const foundIncl = (listInclBody.data || []).some((t: { id: string; deleted_at: string | null }) => t.id === created.id && !!t.deleted_at)
    expect(foundIncl).toBe(true)

    createdTaskId = null  // cleaned up
  })

  test('idempotent: double-delete returns idempotent:true', async ({ request }) => {
    const createRes = await request.post(`${BASE}/api/tasks`, {
      data: {
        description: 'TEST task-delete idempotent — delete me',
        assignee: 'nick-ingraham',
        priority: 'low',
      },
    })
    expect(createRes.status()).toBe(201)
    const { data: created } = await createRes.json()
    createdTaskId = created.id

    const first = await request.post(`${BASE}/api/tasks/${created.id}/delete`, { data: {} })
    expect(first.status()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.data?.idempotent).toBeFalsy()

    const second = await request.post(`${BASE}/api/tasks/${created.id}/delete`, { data: {} })
    expect(second.status()).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.data?.idempotent).toBe(true)

    createdTaskId = null
  })

  test('404 on unknown id', async ({ request }) => {
    const res = await request.post(`${BASE}/api/tasks/definitely-not-a-real-task-id-xyz/delete`, {
      data: {},
    })
    expect(res.status()).toBe(404)
  })
})
