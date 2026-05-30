/**
 * M5 Workflow-Surface Smoke Test
 *
 * Validates the v55 workflow fields (waiting_on, promised_to, promise_date,
 * next_checkin_date) are persisted end-to-end through the Hub API, and that
 * commitments.to_slug is stored correctly.
 *
 * API-level only — no browser session required. Runs against prod by default
 * via playwright.config.prod.ts base URL.
 *
 *   npx playwright test tests/m5-workflow-smoke.spec.ts --config=playwright.config.prod.ts
 *
 * Does NOT require a running dev server or browser auth. Uses the same
 * API write patterns as inspection.spec.ts (POST /api/tasks, POST /api/tasks/:id).
 */
import { test, expect } from '@playwright/test'
import { cleanupTestTasks, cleanupTestCommitments } from './test-cleanup'

// Honour the same env var as playwright.config.prod.ts.
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev'

test.describe('M5 — Workflow fields persist end-to-end', () => {
  let taskId: string

  test('Create task + patch workflow fields + read back (persistence)', async ({ request }) => {
    // 1. Create a task
    const create = await request.post(`${BASE}/api/tasks`, {
      data: {
        title: 'M5_SMOKE_DELETE — workflow field test',
        description: 'Automated M5 smoke — safe to delete',
        assignee: 'nick-ingraham',
        priority: 'low',
      },
    })
    expect(create.status(), 'Task creation should return 201').toBe(201)
    const createBody = await create.json()
    taskId = createBody.data?.id
    expect(taskId, 'Created task must have an id').toBeTruthy()

    // 2. Patch all four v55 workflow fields in a single update
    const patch = await request.post(`${BASE}/api/tasks/${taskId}`, {
      data: {
        waiting_on: 'IRB approval',
        next_checkin_date: '2026-06-15',
        promised_to: 'Graffy',
        promise_date: '2026-06-30',
      },
    })
    expect(patch.status(), 'Workflow field patch should return 200').toBe(200)

    // 3. Read the task back and verify all four fields persisted
    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    expect(read.status(), 'Task readback should return 200').toBe(200)
    const readBody = await read.json()
    const task = readBody.data ?? readBody

    expect(task.waiting_on, 'waiting_on should persist').toBe('IRB approval')
    expect(task.next_checkin_date, 'next_checkin_date should persist').toBe('2026-06-15')
    expect(task.promised_to, 'promised_to should persist').toBe('Graffy')
    expect(task.promise_date, 'promise_date should persist').toBe('2026-06-30')
  })

  test('Clear workflow fields (null patch round-trips)', async ({ request }) => {
    // Depends on taskId from the previous test — guard if it wasn't set
    if (!taskId) {
      test.skip(true, 'Skipped: task creation in prior test did not complete')
      return
    }

    // Clear all fields
    const clear = await request.post(`${BASE}/api/tasks/${taskId}`, {
      data: {
        waiting_on: null,
        next_checkin_date: null,
        promised_to: null,
        promise_date: null,
      },
    })
    expect(clear.status(), 'Clear patch should return 200').toBe(200)

    // Verify cleared
    const read = await request.get(`${BASE}/api/tasks/${taskId}`)
    const task = (await read.json()).data ?? (await read.json())
    expect(task.waiting_on ?? null, 'waiting_on should be null after clear').toBeNull()
    expect(task.promised_to ?? null, 'promised_to should be null after clear').toBeNull()
  })
})

test.describe('M5 — Commitments to_slug persists', () => {
  test('Create commitment with to_slug + read back', async ({ request }) => {
    const id = `m5-smoke-${Date.now()}`

    // Create commitment with to_slug
    const create = await request.post(`${BASE}/api/commitments`, {
      data: {
        id,
        commitment: 'M5_SMOKE_DELETE — to_slug smoke',
        to_whom: 'Graffy',
        to_slug: 'graffy',
        status: 'open',
        due_date: '2026-06-30',
        source: 'm5-smoke-test',
      },
    })
    expect(create.status(), 'Commitment creation should return 201').toBe(201)

    // Read back by slug
    const read = await request.get(`${BASE}/api/commitments?slug=graffy`)
    expect(read.status(), 'Commitment readback should return 200').toBe(200)
    const body = await read.json()
    const rows: Array<{ id: string; to_slug: string }> = body.data ?? body

    const created = rows.find((r) => r.id === id)
    expect(created, 'Commitment should be findable by to_slug query').toBeTruthy()
    expect(created?.to_slug, 'to_slug should persist as "graffy"').toBe('graffy')
  })
})

// ───────────────────────────────────────────────────────────────────
// CLEANUP — Remove all M5_SMOKE_DELETE test fixtures after the suite.
// ───────────────────────────────────────────────────────────────────
test.afterAll(async ({ request }) => {
  const [tasks, commitments] = await Promise.all([
    cleanupTestTasks(request),
    cleanupTestCommitments(request),
  ])
  if (tasks + commitments > 0) {
    console.log(`[m5-smoke] Cleaned ${tasks} task(s), ${commitments} commitment(s) from Hub D1.`)
  }
})
