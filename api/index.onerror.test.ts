/**
 * api/index.onerror.test.ts — SEC-10.1: a prod 500 never shows its raw message.
 *
 * TEST_MODE_KEY is set on production (headless test access), and onError used
 * to treat the key's mere presence as "dev", so every prod 500 returned the
 * raw error text (SQL, schema detail) to any caller. Only ENVIRONMENT=
 * development or a request that proved the key may see the message now.
 *
 * Drives the REAL worker with a database whose every call throws.
 */

import { describe, it, expect } from 'vitest'
import worker from './index'
import type { Env } from './types'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'onerror-test-key'
const SECRET = 'D1_ERROR: no such column: secret_schema_detail'

const throwingDb = new Proxy({}, { get: () => () => { throw new Error(SECRET) } }) as unknown as D1Database

function env(extra: Partial<Env> = {}): Env {
  return { DB: throwingDb, TEST_MODE_KEY: TEST_KEY, ...extra } as unknown as Env
}

async function get(e: Env, headers: Record<string, string> = {}) {
  const res = await worker.fetch(new Request('https://x/api/publications', { headers }), e, CTX)
  return { status: res.status, body: await res.text() }
}

describe('onError hides raw messages unless the caller proved the test key', () => {
  it('a prod 500 with TEST_MODE_KEY set but no key header is sanitized', async () => {
    const r = await get(env())
    expect(r.status).toBe(500)
    expect(r.body).not.toContain('secret_schema_detail')
    expect(JSON.parse(r.body)).toMatchObject({ error: 'Internal error' })
  })

  it('a wrong key header is sanitized too', async () => {
    const r = await get(env(), { 'X-Test-Mode-Key': 'wrong' })
    expect(r.status).toBe(500)
    expect(r.body).not.toContain('secret_schema_detail')
  })

  it('a request carrying the matching key sees the message', async () => {
    const r = await get(env(), { 'X-Test-Mode-Key': TEST_KEY })
    expect(r.status).toBe(500)
    expect(r.body).toContain('secret_schema_detail')
  })

  it('ENVIRONMENT=development sees the message', async () => {
    const r = await get(env({ ENVIRONMENT: 'development' } as Partial<Env>))
    expect(r.status).toBe(500)
    expect(r.body).toContain('secret_schema_detail')
  })
})
