/**
 * Static paths must never be shadowed by a param route (api/index.route-order.test.ts).
 *
 * GET /api/projects/links was defined ~1,300 lines AFTER GET /api/projects/:id.
 * Hono runs handlers in registration order, so `:id` matched first with
 * id='links' and prod answered {"error":"Project not found"} to the Projects
 * table's bulk-links fetch (src/hooks/useApiData.ts). bindRegistryToHono now
 * binds the more specific path first, whatever order defineRoute() ran in.
 *
 * Driven through the real default-exported worker, the entry point Cloudflare
 * invokes, with a valid API key so no auth shim is involved.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import worker from './index'
import { ROUTE_REGISTRY, bindOrder } from './lib/route-dsl'
import type { Env } from './types'

const KEY = 'test-pb-api-key'

function makeDbStub() {
  const stmt = {
    async first() { return null },
    async all() { return { results: [], success: true, meta: {} } },
    async run() { return { success: true, meta: { changes: 0 } } },
  }
  return {
    prepare(_sql: string) {
      return { ...stmt, bind(..._args: unknown[]) { return stmt } }
    },
  }
}

function env(): Env {
  return { DB: makeDbStub(), PB_API_KEY: KEY } as unknown as Env
}

describe('GET /api/projects/links is not shadowed by /api/projects/:id', () => {
  it('reaches the bulk-links handler', async () => {
    const res = await worker.fetch(
      new Request('https://hub.test/api/projects/links', {
        headers: { Authorization: `Bearer ${KEY}` },
      }),
      env(),
      {} as ExecutionContext,
    )
    const body = await res.json() as Record<string, unknown>
    expect(body).not.toHaveProperty('error')
    expect(res.status).toBe(200)
    expect(body).toEqual({ projects: {} })
  })
})

// Registry-wide: every literal GET path must reach its own definition. Binds
// the REAL registry (populated by importing ./index above) into a bare Hono
// app in bindOrder, each handler answering with its own path, then requests
// every literal path. A param or wildcard route bound ahead of a literal it
// also matches fails here, wherever the two defineRoute() calls sit.
function bindProbe(order: typeof ROUTE_REGISTRY) {
  const app = new Hono()
  for (const r of order) {
    if (r.method === 'GET') app.get(r.path, (c) => c.text(r.path))
  }
  return async (path: string) => (await Promise.resolve(app.request(path))).text()
}

describe('route registry binding order', () => {
  const literalGets = ROUTE_REGISTRY.filter(
    (r) => r.method === 'GET' && !r.path.includes(':') && !r.path.includes('*'),
  )

  it('has literal GET paths to check', () => {
    expect(literalGets.length).toBeGreaterThan(20)
    expect(literalGets.map((r) => r.path)).toContain('/api/projects/links')
  })

  it('binds every literal GET path ahead of any param route that matches it', async () => {
    const firstMatch = bindProbe(bindOrder(ROUTE_REGISTRY))
    const shadowed: string[] = []
    for (const r of literalGets) {
      const got = await firstMatch(r.path)
      if (got !== r.path) shadowed.push(`${r.path} -> ${got}`)
    }
    expect(shadowed).toEqual([])
  })

  it('keeps file order for routes of equal shape (stable)', () => {
    const order = bindOrder(ROUTE_REGISTRY)
    const posts = order.filter((r) => r.method === 'POST' && r.path === '/api/projects/:slug')
    expect(posts.length).toBeLessThanOrEqual(1)
    const a = order.findIndex((r) => r.path === '/api/projects/:slug/links')
    const b = order.findIndex((r) => r.path === '/api/projects/links')
    expect(b).toBeLessThan(a)
  })
})
