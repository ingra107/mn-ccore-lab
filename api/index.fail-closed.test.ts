/**
 * api/index.fail-closed.test.ts -- /api enforces sign-in when no flag is set.
 *
 * Until 2026-10-10 every auth decision tested REQUIRE_AUTH === '1', so a
 * runtime without the variable served the lab to anonymous callers as a
 * member (the cron Worker's workers.dev URL, 2026-10-08). Now a missing flag
 * enforces sign-in and only HUB_LOCAL_DEV=1 opens it (api/lib/auth-mode.ts).
 * PB plan: Scratch/plans/2026-10-10-api-worker-reconciled.md, piece 1.
 *
 * Every env here carries NO REQUIRE_AUTH unless a case says so: that is the
 * Worker's config today and the state the plan's cut must survive. Each caller
 * class that authenticates on its own (PB API key by Bearer or X-API-Key,
 * the test-mode user, a CF Access JWT) is driven through the real worker to
 * show it still works under fail-closed.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'
import { authEnforced } from './lib/auth-mode'

const API_KEY = 'fail-closed-api-key'
const TEST_KEY = 'fail-closed-test-key'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

let db: InstanceType<typeof Database>

function env(extra: Record<string, string> = {}): Env {
  return { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, ...extra } as unknown as Env
}

/** An unsigned CF Access-shaped JWT: decodes, never verifies. */
function fakeJwt(email: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'RS256', kid: 'k' })}.${b64({ email })}.c2ln`
}

async function call(e: Env, method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e, CTX,
  )
  return { status: res.status, headers: res.headers, text: await res.text() }
}

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
})

describe('authEnforced', () => {
  it('a missing or empty env enforces; only HUB_LOCAL_DEV=1 opens; REQUIRE_AUTH=1 wins over it', () => {
    expect(authEnforced(undefined)).toBe(true)
    expect(authEnforced({})).toBe(true)
    expect(authEnforced({ REQUIRE_AUTH: '0' })).toBe(true)
    expect(authEnforced({ HUB_LOCAL_DEV: 'true' })).toBe(true)
    expect(authEnforced({ HUB_LOCAL_DEV: '1' })).toBe(false)
    expect(authEnforced({ HUB_LOCAL_DEV: '1', REQUIRE_AUTH: '1' })).toBe(true)
  })
})

describe('no flag set (the Worker today): anonymous is refused', () => {
  it('a member GET is 401', async () => {
    expect((await call(env(), 'GET', '/api/tasks')).status).toBe(401)
  })
  it('a write is 401', async () => {
    expect((await call(env(), 'POST', '/api/tasks', {}, { title: 'ghost' })).status).toBe(401)
    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title = 'ghost'").get()).toEqual({ n: 0 })
  })
  it('a bug report is 401', async () => {
    expect((await call(env(), 'POST', '/api/bug-report', {}, { title: 't', description: 'd' })).status).toBe(401)
  })
  it('REQUIRE_AUTH="0" does not open it (the old local value means nothing now)', async () => {
    expect((await call(env({ REQUIRE_AUTH: '0' }), 'GET', '/api/tasks')).status).toBe(401)
  })
  it('a public GET still answers', async () => {
    expect((await call(env(), 'GET', '/api/version')).status).toBe(200)
  })
  it('an unsigned JWT is not an identity when CF_ACCESS_TEAM_DOMAIN is missing', async () => {
    expect((await call(env(), 'GET', '/api/tasks', { 'Cf-Access-Jwt-Assertion': fakeJwt(CASEY) })).status).toBe(401)
  })
})

describe('no flag set: each caller class that brings its own credential still works', () => {
  it('PB API key, Bearer', async () => {
    expect((await call(env(), 'GET', '/api/tasks', { Authorization: `Bearer ${API_KEY}` })).status).toBe(200)
  })
  it('PB API key, X-API-Key (the Apps Script form)', async () => {
    expect((await call(env(), 'GET', '/api/tasks', { 'X-API-Key': API_KEY })).status).toBe(200)
  })
  it('PB API key write', async () => {
    const r = await call(env(), 'POST', '/api/tasks', { Authorization: `Bearer ${API_KEY}` }, { description: 'pb wrote this', assignee: 'nick-ingraham' })
    expect(r.status, r.text).toBeLessThan(300)
  })
  it('test-mode user that is a member', async () => {
    expect((await call(env(), 'GET', '/api/tasks', { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY })).status).toBe(200)
  })
  it('a wrong API key is still 401, not anonymous', async () => {
    expect((await call(env(), 'GET', '/api/tasks', { Authorization: 'Bearer nope' })).status).toBe(401)
  })
})

describe('HUB_LOCAL_DEV=1 (wrangler.local.toml) keeps local dev open', () => {
  it('anonymous reads and writes pass', async () => {
    const e = env({ HUB_LOCAL_DEV: '1' })
    expect((await call(e, 'GET', '/api/tasks')).status).toBe(200)
    const r = await call(e, 'POST', '/api/tasks', {}, { description: 'local anon', assignee: 'nick-ingraham' })
    expect(r.status, r.text).toBeLessThan(300)
  })
  it('an unsigned JWT decodes as before', async () => {
    const r = await call(env({ HUB_LOCAL_DEV: '1' }), 'GET', '/api/auth/me', { 'Cf-Access-Jwt-Assertion': fakeJwt(CASEY) })
    expect(r.status).toBe(200)
    expect(r.text).toContain(CASEY)
  })
  it('REQUIRE_AUTH=1 beside it still refuses anonymous', async () => {
    expect((await call(env({ HUB_LOCAL_DEV: '1', REQUIRE_AUTH: '1' }), 'GET', '/api/tasks')).status).toBe(401)
  })
})

describe('X-Hub-Runtime', () => {
  it('is stamped only when HUB_RUNTIME=worker, on success and on refusal', async () => {
    const w = env({ HUB_RUNTIME: 'worker' })
    expect((await call(w, 'GET', '/api/version')).headers.get('X-Hub-Runtime')).toBe('worker')
    expect((await call(w, 'GET', '/api/tasks')).headers.get('X-Hub-Runtime')).toBe('worker')
    expect((await call(env(), 'GET', '/api/version')).headers.get('X-Hub-Runtime')).toBeNull()
    expect((await call(env({ HUB_RUNTIME: 'pages' }), 'GET', '/api/version')).headers.get('X-Hub-Runtime')).toBeNull()
  })
})
