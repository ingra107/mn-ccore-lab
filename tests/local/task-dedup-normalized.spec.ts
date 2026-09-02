import { test, expect, request } from '@playwright/test'

/**
 * The real-path proof for the #530b dedup-key change (2026-09-02).
 *
 * A green vitest here would be a proxy: every dedup test in api/routes/ drives
 * a hand-written D1 stub, and the thing under test is whether SQLite's own
 * lower(trim(...)) — in the partial UNIQUE index AND in the two applyInsert
 * arms — agrees. This spec runs the actual Worker against the local D1 that
 * scripts/local-db-bootstrap.ts builds from the committed migration files, so
 * the index in play is the one schema-v107 declares, and the query in play is
 * the one that ships.
 *
 * It asserts the CONTRACT, not the arm: a title differing only by case or edge
 * whitespace adopts the existing task. During the cutover the adoption comes
 * from the race-loser catch (the serial arm is still raw and misses, the INSERT
 * trips the index, the normalized catch finds the winner); after the second
 * deploy it comes from the serial arm and the INSERT never runs. Both are a
 * pass, and that is the point — the spec survives the cutover it verifies.
 */

const ASSIGNEE = 'claude-ai'   // Hub-created-only slug; skips the team_members check.
const BASE = 'ZZ530 Local Dedup Probe'

async function createTask(baseURL: string | undefined, title: string) {
  const api = await request.newContext({ baseURL })
  const res = await api.post('/api/tasks', {
    data: { title, description: title, assignee: ASSIGNEE },
  })
  expect(res.status(), await res.text()).toBe(201)
  const body = await res.json() as { data?: { id?: string; title?: string } }
  expect(body.data?.id).toBeTruthy()
  return body.data!
}

test.describe('task dedup key — normalized on the real path', () => {
  test('a case + edge-whitespace variant adopts the existing task', async ({ baseURL }) => {
    const first = await createTask(baseURL, BASE)
    const variant = await createTask(baseURL, `  ${BASE.toLowerCase()}  `)

    // Same row, not a second task. Under the pre-#530b raw key this returned a
    // NEW id and the two lived side by side.
    expect(variant.id).toBe(first.id)
    // The adopted row keeps the WINNER's title — adoption never rewrites it.
    expect(variant.title).toBe(BASE)
  })

  test('an internal-whitespace variant stays a distinct task', async ({ baseURL }) => {
    // The deliberate boundary: trim() strips the ends only, so a doubled inner
    // space is still a different task. PB's
    // tests/db/test_dedup_name_normalization.py pins the same edge, and the two
    // repos have to agree on where the fold stops, not just that it happens.
    const first = await createTask(baseURL, `${BASE} Inner`)
    const inner = await createTask(baseURL, `${BASE} Inner`.replace(' Inner', '  Inner'))
    expect(inner.id).not.toBe(first.id)
  })
})
