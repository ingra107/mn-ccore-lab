import { test, expect, request } from '@playwright/test'
import { installWebSocketStub } from '../setup/websocket-stub'

/**
 * Local data-validation spec — runs against the Miniflare harness
 * (Vite on :5173 proxying /api to `wrangler pages dev --local` on :8787,
 * backed by the local D1 seeded via scripts/local-db-seed.ts).
 *
 * Each assertion is a "does the seed actually show up" floor check —
 * the exact row counts mirror scripts/seed/phase0-plan.json (5 projects,
 * 30 tasks, 1 grant, 10 ideas, 3 meetings).  We use >= thresholds so the
 * suite stays green if someone adds seed rows later.
 *
 * If any endpoint returns 404, the most likely cause is that the Worker
 * API shape uses `.data` wrapping or a different route — check
 * tests/inspection.spec.ts for the real shape and widen the count
 * extraction helper below.
 */

function countRows(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length
  if (payload && typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>
    if (Array.isArray(anyPayload.data)) return (anyPayload.data as unknown[]).length
    if (Array.isArray(anyPayload.rows)) return (anyPayload.rows as unknown[]).length
    if (Array.isArray(anyPayload.items)) return (anyPayload.items as unknown[]).length
  }
  return 0
}

test.beforeEach(async ({ page }) => {
  await installWebSocketStub(page)
})

test.describe('local seed data validation', () => {
  test('GET /api/projects returns >=3 rows', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL })
    const res = await api.get('/api/projects')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(countRows(body)).toBeGreaterThanOrEqual(3)
  })

  test('GET /api/tasks returns >=10 rows', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL })
    const res = await api.get('/api/tasks')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(countRows(body)).toBeGreaterThanOrEqual(10)
  })

  test('GET /api/grants returns >=1 row', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL })
    const res = await api.get('/api/grants')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(countRows(body)).toBeGreaterThanOrEqual(1)
  })

  test('GET /api/ideas returns >=5 rows', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL })
    const res = await api.get('/api/ideas')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(countRows(body)).toBeGreaterThanOrEqual(5)
  })

  test('GET /api/meetings returns >=1 row', async ({ baseURL }) => {
    const api = await request.newContext({ baseURL })
    const res = await api.get('/api/meetings')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(countRows(body)).toBeGreaterThanOrEqual(1)
  })
})
