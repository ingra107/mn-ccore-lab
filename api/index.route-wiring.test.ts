/**
 * App-level route-wiring tests (api/index.route-wiring.test.ts) — backlog #546.
 *
 * #546: the ?raw=1-vs-/raw seam bug shipped through 1068+ green tests because
 * every existing test called handleGetFile(key, env, csp, raw) directly with
 * `raw` already resolved — nothing exercised api/index.ts's own parsing of
 * the query flag and the /raw path suffix. Fixed live by 89df1a5a (router
 * honors both forms); this file locks the fix at the ROUTER layer by driving
 * requests through the real default-exported worker (`worker.fetch(req, env,
 * ctx)` — the exact entry point Cloudflare invokes, and the same shape
 * api/scheduled.test.ts already uses for the `scheduled()` half of this
 * module). Verified against HEAD~1 (pre-89df1a5a): the `?raw=1` case failed
 * with 503 "R2 not configured" (fell into the presign branch) while `/raw`
 * already passed — reproducing the exact asymmetry the fix closed.
 *
 * Also covers the second seam #546 named: the URL upload/done EMITS
 * (`/api/files/<key>/raw`, uploads.ts) actually resolves to bytes when
 * fetched back through this same router — not just asserted as a string.
 */

import { describe, it, expect } from 'vitest'
import worker from './index'
import type { Env } from './types'

// Minimal D1 stub — every route this file touches either doesn't need a real
// row (canAccessEntity short-circuits on entity_type !== 'project') or only
// needs `run()` to succeed (the upload/done INSERT). Mirrors the inline-stub
// pattern already used in api/scheduled.test.ts.
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

// Minimal R2 stub. `.get` backs the raw-bytes branch of handleGetFile;
// `.head` backs the upload/done existence check.
function makeFilesStub(body = 'hello-bytes') {
  return {
    async get(_key: string) {
      return {
        body: new Response(body).body,
        httpMetadata: { contentType: 'image/png' },
        writeHttpMetadata(headers: Headers) {
          headers.set('content-type', 'image/png')
        },
      }
    },
    async head(key: string) {
      return { key }
    },
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeDbStub(),
    FILES: makeFilesStub(),
    // Fake but well-formed R2 signing creds so the non-raw branch of
    // handleGetFile (presigned-URL path) exercises AwsClient.sign() — pure
    // HMAC, no network — instead of short-circuiting on the "R2 not
    // configured" 503, which would mask whether the JSON-envelope shape is
    // actually correct.
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    CF_ACCOUNT_ID: 'test-account-id',
    ...overrides,
  } as unknown as Env
}

const CTX = {} as ExecutionContext

describe('#546 GET /api/files/:rest{.+} — raw flag seam (both conventions)', () => {
  it('?raw=1 (the form upload/done emits) resolves to real bytes, not the JSON envelope', async () => {
    const req = new Request('https://hub.test/api/files/task/abc123/photo.png?raw=1')
    const res = await worker.fetch(req, makeEnv(), CTX)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(await res.text()).toBe('hello-bytes')
  })

  it('/raw path suffix resolves to real bytes', async () => {
    const req = new Request('https://hub.test/api/files/task/abc123/photo.png/raw')
    const res = await worker.fetch(req, makeEnv(), CTX)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(await res.text()).toBe('hello-bytes')
  })

  it('no raw flag returns the JSON presign envelope, never raw bytes', async () => {
    const req = new Request('https://hub.test/api/files/task/abc123/photo.png')
    const res = await worker.fetch(req, makeEnv(), CTX)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json() as { data?: { downloadUrl?: string } }
    expect(typeof body.data?.downloadUrl).toBe('string')
  })
})

describe('#546 POST /api/upload/done emitted URL resolves to bytes through the real router', () => {
  it('the url handleUploadDone returns GETs real bytes, not a 404/envelope', async () => {
    const env = makeEnv()
    const doneReq = new Request('https://hub.test/api/upload/done', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'meeting/xyz789/notes.png',
        filename: 'notes.png',
        contentType: 'image/png',
        sizeBytes: 1234,
        entityType: 'meeting',
        entityId: 'xyz789',
      }),
    })
    const doneRes = await worker.fetch(doneReq, env, CTX)
    expect(doneRes.status).toBe(200)
    const doneBody = await doneRes.json() as { data?: { url?: string } }
    const emittedUrl = doneBody.data?.url
    expect(emittedUrl).toBe('/api/files/meeting/xyz789/notes.png/raw')

    // Follow the emitted URL through the SAME router, not a direct handler
    // call — this is the exact composition #546 says nothing exercised.
    const followReq = new Request(`https://hub.test${emittedUrl}`)
    const followRes = await worker.fetch(followReq, env, CTX)
    expect(followRes.status).toBe(200)
    expect(followRes.headers.get('content-type')).toBe('image/png')
    expect(await followRes.text()).toBe('hello-bytes')
  })
})
