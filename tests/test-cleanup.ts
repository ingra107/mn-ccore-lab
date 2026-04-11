/**
 * Shared test cleanup utility.
 *
 * Deletes all test-created tasks from Hub D1 after test runs.
 * Every test suite that creates tasks MUST call cleanupTestTasks() in afterAll.
 *
 * Test task patterns (all contain "delete", "TEST", "SYNC-", "PROBE", etc.):
 *   INSPECTION *, DAILYTEST-*, EDGE *, SYNC-*, JOURNEY-*, KEYLINK TEST,
 *   AUDIT TEST, TIMEZONE-PROBE-*, DUE-DATE-PROBE-*, SYNCTEST-*
 */
import type { APIRequestContext } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

const TEST_PREFIXES = [
  '_TEST_DELETE_',
  'INSPECTION',
  'DAILYTEST',
  'EDGE',
  'SYNC-',
  'SYNCTEST',
  'JOURNEY',
  'KEYLINK TEST',
  'AUDIT TEST',
  'AUDIT-TEST',
  'TIMEZONE-PROBE',
  'DUE-DATE-PROBE',
  'WORKFLOW-TEST',
  'QA ',
  'TEST-',
]

/**
 * Delete all test tasks from Hub D1.
 * Call this in afterAll() of any test suite that creates tasks.
 */
export async function cleanupTestTasks(request: APIRequestContext): Promise<number> {
  // Fetch all tasks
  const res = await request.get(`${BASE}/api/tasks?limit=2000`)
  if (!res.ok()) return 0

  const body = await res.json()
  const tasks = body.data || body || []
  if (!Array.isArray(tasks)) return 0

  // Filter to test tasks
  const testIds = tasks
    .filter((t: { title?: string; id: string }) => {
      const title = (t.title || '').toUpperCase()
      return TEST_PREFIXES.some(p => title.startsWith(p.toUpperCase())) ||
        title === 'TEST' ||
        title.includes('— DELETE') ||
        title.includes('— EDGE TEST')
    })
    .map((t: { id: string }) => t.id)

  if (testIds.length === 0) return 0

  // Batch delete (50 at a time to stay within D1 limits)
  let deleted = 0
  for (let i = 0; i < testIds.length; i += 50) {
    const batch = testIds.slice(i, i + 50)
    const delRes = await request.post(`${BASE}/api/tasks/batch`, {
      data: { ids: batch, action: 'delete' }
    })
    if (delRes.ok()) {
      deleted += batch.length
    }
  }

  // Clean test data from all non-task tables (project_updates, ideas, lab_questions, etc.)
  try {
    await request.post(`${BASE}/api/test-cleanup`, { data: {} })
  } catch { /* endpoint may not be deployed yet */ }

  // Also clean up test settings
  try {
    await request.post(`${BASE}/api/settings`, {
      data: { key: '_inspection_test', value: null }
    })
  } catch { /* settings key may not exist */ }

  return deleted
}
