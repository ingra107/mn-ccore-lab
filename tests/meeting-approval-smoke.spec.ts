/**
 * Meeting Approval smoke test — Phase 2 Accept/Decline feature
 *
 * API-level only (no browser session required). Verifies:
 *   1. A task with source='meeting_approval' and approval_status='pending' can be created.
 *   2. Patching approval_status to 'accepted' persists and reads back.
 *   3. Patching approval_status to 'declined' persists and reads back (declined quick-view data).
 *   4. Re-accept (declined → accepted) round-trips correctly.
 *
 * Runs against prod by default via playwright.config.prod.ts base URL.
 *   npx playwright test tests/meeting-approval-smoke.spec.ts --config=playwright.config.prod.ts
 *
 * Cleanup: tasks are deleted after the suite via cleanupTestTasks.
 */
import { test, expect } from '@playwright/test'
import { cleanupTestTasks } from './test-cleanup'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev'

test.describe('Meeting Approval — approval_status field round-trips', () => {
  let taskId: string

  test('Create meeting_approval task with pending status', async ({ request }) => {
    const create = await request.post(`${BASE}/api/tasks`, {
      data: {
        title: 'MTGAPPROVAL_SMOKE_DELETE — meeting approval phase 2 test',
        description: 'Automated smoke — safe to delete',
        assignee: 'nick-ingraham',
        priority: 'low',
        source: 'meeting_approval',
        approval_status: 'pending',
      },
    })
    expect(create.status(), 'Task creation should return 201').toBe(201)
    const body = await create.json()
    taskId = body.data?.id
    expect(taskId, 'Created task must have an id').toBeTruthy()

    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    expect(read.status()).toBe(200)
    const readBody = await read.json()
    const task = readBody.data ?? readBody
    expect(task.source, 'source should be meeting_approval').toBe('meeting_approval')
    expect(task.approval_status, 'approval_status should be pending').toBe('pending')
  })

  test('Accept — patch approval_status to accepted', async ({ request }) => {
    if (!taskId) { test.skip(true, 'Skipped: task creation in prior test did not complete'); return }

    const patch = await request.post(`${BASE}/api/tasks/${taskId}`, {
      data: { approval_status: 'accepted' },
    })
    expect(patch.status(), 'Accept patch should return 200').toBe(200)

    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    const task = (await read.json()).data ?? (await read.json())
    // Re-read since json() is consumed
    const read2 = await request.get(`${BASE}/api/tasks/${taskId}`)
    const task2 = (await read2.json()).data
    expect(task2.approval_status, 'approval_status should be accepted').toBe('accepted')
  })

  test('Decline — patch approval_status to declined', async ({ request }) => {
    if (!taskId) { test.skip(true, 'Skipped: task creation in prior test did not complete'); return }

    const patch = await request.post(`${BASE}/api/tasks/${taskId}`, {
      data: { approval_status: 'declined' },
    })
    expect(patch.status(), 'Decline patch should return 200').toBe(200)

    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    const body = await read.json()
    const task = body.data ?? body
    expect(task.approval_status, 'approval_status should be declined').toBe('declined')
  })

  test('Re-accept — patch declined back to accepted', async ({ request }) => {
    if (!taskId) { test.skip(true, 'Skipped: task creation in prior test did not complete'); return }

    const patch = await request.post(`${BASE}/api/tasks/${taskId}`, {
      data: { approval_status: 'accepted' },
    })
    expect(patch.status(), 'Re-accept patch should return 200').toBe(200)

    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    const body = await read.json()
    const task = body.data ?? body
    expect(task.approval_status, 'approval_status should be accepted after re-accept').toBe('accepted')
  })

  test.afterAll(async ({ request }) => {
    if (taskId) {
      await cleanupTestTasks(request, BASE, [taskId])
    }
  })
})
