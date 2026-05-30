/**
 * Shared test cleanup utility.
 *
 * Deletes all test-created rows from Hub D1 after test runs.
 * Every test suite that creates data MUST call the appropriate cleanup
 * helper(s) in afterAll.
 *
 * Test entity patterns (title/name/question starts with or contains):
 *   INSPECTION *, DAILYTEST-*, EDGE *, SYNC-*, JOURNEY-*, KEYLINK TEST,
 *   AUDIT TEST, TIMEZONE-PROBE-*, DUE-DATE-PROBE-*, SYNCTEST-*,
 *   _TEST_DELETE_*, M5_SMOKE_DELETE*, test_delete_*
 *
 * BASE URL respects PLAYWRIGHT_BASE_URL env var so cleanup targets the
 * same environment as the test run (preview vs prod).
 */
import type { APIRequestContext } from '@playwright/test'

// Honour the same env var as playwright.config.prod.ts so cleanup always
// targets the same host as the test run.
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://mn-ccore-lab.pages.dev'

/** Title/name prefixes that identify test-created rows. */
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
  // globalSetup / test-seed prefixes
  'test_delete_',
  // M5 smoke
  'M5_SMOKE_DELETE',
  // pre-flight persona marker (mk() helper in shared.ts)
  'test_delete_preflight_',
]

function isTestTitle(title: string | undefined): boolean {
  if (!title) return false
  const up = title.toUpperCase()
  return TEST_PREFIXES.some(p => up.startsWith(p.toUpperCase()))
    || title === 'TEST'
    || title.includes('— DELETE')
    || title.includes('— EDGE TEST')
}

/**
 * Delete all test tasks from Hub D1.
 * Call this in afterAll() of any test suite that creates tasks.
 */
export async function cleanupTestTasks(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/tasks?limit=2000`)
  if (!res.ok()) return 0

  const body = await res.json()
  const tasks = body.data || body || []
  if (!Array.isArray(tasks)) return 0

  const testIds = tasks
    .filter((t: { title?: string; id: string }) => isTestTitle(t.title))
    .map((t: { id: string }) => t.id)

  if (testIds.length === 0) return 0

  // Batch delete (50 at a time to stay within D1 limits)
  let deleted = 0
  for (let i = 0; i < testIds.length; i += 50) {
    const batch = testIds.slice(i, i + 50)
    const delRes = await request.post(`${BASE}/api/tasks/batch`, {
      data: { ids: batch, action: 'delete' }
    })
    if (delRes.ok()) deleted += batch.length
  }

  // Also clean up test settings key
  try {
    await request.post(`${BASE}/api/settings`, {
      data: { key: '_inspection_test', value: null }
    })
  } catch { /* settings key may not exist */ }

  return deleted
}

/**
 * Delete all test-prefixed projects from Hub D1.
 * Projects are identified by slug or title starting with a test prefix.
 */
export async function cleanupTestProjects(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/projects?limit=500`)
  if (!res.ok()) return 0

  const body = await res.json()
  const projects = body.data || body || []
  if (!Array.isArray(projects)) return 0

  const testSlugs: string[] = projects
    .filter((p: { slug?: string; title?: string; name?: string }) =>
      isTestTitle(p.title) || isTestTitle(p.name) ||
      (p.slug && TEST_PREFIXES.some(prefix => p.slug!.startsWith(prefix.toLowerCase().replace(/_/g, '-').replace(/ /g, '-'))))
    )
    .map((p: { slug: string }) => p.slug)
    .filter(Boolean)

  if (testSlugs.length === 0) return 0

  let deleted = 0
  for (const slug of testSlugs) {
    try {
      const delRes = await request.delete(`${BASE}/api/projects/${slug}`)
      if (delRes.ok()) deleted++
    } catch { /* ignore per-project errors */ }
  }
  return deleted
}

/**
 * Delete all test-prefixed meetings from Hub D1.
 */
export async function cleanupTestMeetings(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/meetings?limit=500`)
  if (!res.ok()) return 0

  const body = await res.json()
  const meetings = body.data || body || []
  if (!Array.isArray(meetings)) return 0

  const testIds: string[] = meetings
    .filter((m: { title?: string; id: string }) => isTestTitle(m.title))
    .map((m: { id: string }) => m.id)

  if (testIds.length === 0) return 0

  let deleted = 0
  for (const id of testIds) {
    try {
      const delRes = await request.delete(`${BASE}/api/meetings/${id}`)
      if (delRes.ok()) deleted++
    } catch { /* ignore per-meeting errors */ }
  }
  return deleted
}

/**
 * Delete all test-prefixed ideas from Hub D1.
 */
export async function cleanupTestIdeas(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/ideas?limit=500`)
  if (!res.ok()) return 0

  const body = await res.json()
  const ideas = body.data || body || []
  if (!Array.isArray(ideas)) return 0

  const testIds: string[] = ideas
    .filter((i: { title?: string; id: string }) => isTestTitle(i.title))
    .map((i: { id: string }) => i.id)

  if (testIds.length === 0) return 0

  let deleted = 0
  for (const id of testIds) {
    try {
      const delRes = await request.delete(`${BASE}/api/ideas/${id}`)
      if (delRes.ok()) deleted++
    } catch { /* ignore per-idea errors */ }
  }
  return deleted
}

/**
 * Delete all test-prefixed decisions from Hub D1.
 */
export async function cleanupTestDecisions(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/decisions?limit=500`)
  if (!res.ok()) return 0

  const body = await res.json()
  const decisions = body.data || body || []
  if (!Array.isArray(decisions)) return 0

  const testIds: string[] = decisions
    .filter((d: { title?: string; id: string }) => isTestTitle(d.title))
    .map((d: { id: string }) => d.id)

  if (testIds.length === 0) return 0

  let deleted = 0
  for (const id of testIds) {
    try {
      const delRes = await request.delete(`${BASE}/api/decisions/${id}`)
      if (delRes.ok()) deleted++
    } catch { /* ignore per-decision errors */ }
  }
  return deleted
}

/**
 * Delete all test-prefixed commitments from Hub D1.
 * Used by m5-workflow-smoke.spec.ts.
 */
export async function cleanupTestCommitments(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/commitments?limit=500`)
  if (!res.ok()) return 0

  const body = await res.json()
  const commitments = body.data || body || []
  if (!Array.isArray(commitments)) return 0

  const testIds: string[] = commitments
    .filter((c: { commitment?: string; id: string }) => isTestTitle(c.commitment))
    .map((c: { id: string }) => c.id)

  if (testIds.length === 0) return 0

  let deleted = 0
  for (const id of testIds) {
    try {
      const delRes = await request.delete(`${BASE}/api/commitments/${id}`)
      if (delRes.ok()) deleted++
    } catch { /* ignore per-commitment errors */ }
  }
  return deleted
}

/**
 * Run all entity-type cleanups in sequence.
 * Used by globalTeardown — covers every table that test suites write to.
 */
export async function cleanupAllTestFixtures(request: APIRequestContext): Promise<Record<string, number>> {
  const [tasks, projects, meetings, ideas, decisions, commitments] = await Promise.all([
    cleanupTestTasks(request),
    cleanupTestProjects(request),
    cleanupTestMeetings(request),
    cleanupTestIdeas(request),
    cleanupTestDecisions(request),
    cleanupTestCommitments(request),
  ])
  return { tasks, projects, meetings, ideas, decisions, commitments }
}
