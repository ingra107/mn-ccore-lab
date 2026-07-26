/**
 * api/index.auth-gate.test.ts — backlog #909.
 *
 * Regression coverage for the write-auth gate (api/index.ts step 5,
 * `WRITE_AUTH_METHODS`). Before this fix the gate tested
 * `method !== 'POST' && method !== 'PUT'`, so DELETE (and any future write
 * method) skipped it entirely and reached the handler with REQUIRE_AUTH=1
 * unenforced at the middleware layer — the only live DELETE route
 * (DELETE /api/artifacts/:id/tags/:tag) survived solely because its handler
 * remembered to check `isAnonymous(user)` itself.
 *
 * Drives requests through the REAL worker (`worker.fetch`, the exact
 * Cloudflare entry point Hono/Cloudflare invokes) with the full middleware
 * stack running — not a stubbed gate. Same composition style as
 * api/index.route-wiring.test.ts (#546).
 */

import { describe, it, expect } from 'vitest'
import worker from './index'
import type { Env } from './types'

const CTX = {} as ExecutionContext
const API_KEY = 'test-pb-api-key-909'

// Minimal D1 stub. Every request this file drives either 401s at the
// middleware (never reaches a handler that touches DB) or hits the
// artifact-tags DELETE handler, which only needs `run()` (the DELETE) and
// `all()` (the tag read-back) to succeed — no row shape matters for a
// 401-vs-not-401 assertion. Mirrors the stub pattern in
// api/index.route-wiring.test.ts.
function makeDbStub() {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() { return null },
            async all() { return { results: [], success: true, meta: {} } },
            async run() { return { success: true, meta: { changes: 1 } } },
          }
        },
      }
    },
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeDbStub(),
    PB_API_KEY: API_KEY,
    ...overrides,
  } as unknown as Env
}

describe('#909 write-auth gate covers every non-GET method, not just POST/PUT', () => {
  it('DELETE the one live DELETE route, unauthenticated, REQUIRE_AUTH=1 -> 401 at the middleware', async () => {
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/artifacts/art_1/tags/some-tag', { method: 'DELETE' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(401)
  })

  it('DELETE the one live DELETE route, valid API key, REQUIRE_AUTH=1 -> passes the gate (not 401), handler runs', async () => {
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/artifacts/art_1/tags/some-tag', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(200)
    const body = await res.json() as { data?: { artifact_id?: string; removed?: string } }
    expect(body.data?.artifact_id).toBe('art_1')
    expect(body.data?.removed).toBe('some-tag')
  })

  it('DELETE to a path with NO registered route (no handler, so no in-handler guard can save it), unauthenticated, REQUIRE_AUTH=1 -> 401, not 404', async () => {
    // The discriminating case. The one live DELETE route (tags) 401s an
    // anonymous caller either way, because its handler ALSO checks
    // isAnonymous() — testing only that route can't tell "the middleware
    // gated this" apart from "the handler gated this" (confirmed empirically:
    // reverting WRITE_AUTH_METHODS to the pre-fix `method !== 'POST' &&
    // method !== 'PUT'` check and rerunning this suite left every
    // tags-route assertion green). A path with NO registered DELETE handler
    // has no handler-level guard to fall back on: pre-fix, an unauthed
    // DELETE here skipped the write-auth gate entirely and fell through to
    // Hono's 404 (unauthenticated request "succeeded" all the way to
    // routing, and would have reached a REAL handler had one existed at
    // this path). Post-fix, the gate 401s it before Hono ever routes.
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/some-future-delete-route', { method: 'DELETE' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(401)
  })

  it('PUT to a path with NO registered PUT route, unauthenticated, REQUIRE_AUTH=1 -> still 401, not 404 (no regression: POST/PUT were already gated)', async () => {
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/some-future-put-route', { method: 'PUT' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(401)
  })

  it('POST to an unregistered path, unauthenticated, REQUIRE_AUTH=1 -> 401 (pre-existing behavior, unchanged by this fix)', async () => {
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/some-future-post-route', { method: 'POST' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(401)
  })

  it('GET is unaffected by the write-auth gate (its own step-4 gate covers it, and public GETs stay public)', async () => {
    const env = makeEnv({ REQUIRE_AUTH: '1' })
    const req = new Request('https://hub.test/api/version', { method: 'GET' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).not.toBe(401)
  })

  it('REQUIRE_AUTH unset (pre-launch default): the middleware itself lets DELETE through, but the artifacts handler still 401s an anonymous caller', async () => {
    // Without an Authorization header the resolved user is the anonymous
    // shim. WRITE_AUTH_METHODS now runs for DELETE regardless of
    // REQUIRE_AUTH, but requireAuth=false means the middleware itself does
    // not reject — it falls through to the handler's own isAnonymous()
    // check (artifacts.ts), which still fails closed. This proves the
    // second, in-handler layer is unaffected by the middleware fix, and
    // that unset REQUIRE_AUTH still preserves its documented pre-launch
    // semantics for this route.
    const env = makeEnv() // REQUIRE_AUTH left unset
    const req = new Request('https://hub.test/api/artifacts/art_1/tags/some-tag', { method: 'DELETE' })
    const res = await worker.fetch(req, env, CTX)
    expect(res.status).toBe(401)
  })
})
