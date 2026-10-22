/**
 * api/index.launch-log-gate.test.ts — only the PI can queue a launch.
 *
 * A launch_log row starts a Claude session on the PI's own machine: the home
 * daemon (hub_ai_listener.process_pending_launches) claims every pending
 * 'mobile' row from GET /api/pb/launch-log/pending and spawns it, with no
 * requester check. Until 2026-10-09 POST /api/launch-log accepted any member,
 * so a member's @quickchat from a phone ran on Nick's machine.
 *
 * Drives the REAL worker (full middleware stack, real migrated schema): a
 * member session is refused and writes nothing; the PI session (CF Access JWT)
 * creates; the PB API key and the test-mode identity are refused on create/refire (2026-10-22, a leaked key must not queue
 * a session) but still claims; the pending feed answers only the PI and the key.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const API_KEY = 'launch-gate-test-api-key'
const PI_EMAIL = 'ingra107@umn.edu'
const MEMBER_EMAIL = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', role: 'PI', member_type: 'director', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', role: 'Data Analyst', member_type: 'research_team', email: MEMBER_EMAIL })
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
})

/** An unsigned CF Access-shaped JWT: decodes, never verifies (local-dev env only). */
function fakeJwt(email: string): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'RS256', kid: 'k' })}.${b64({ email })}.c2ln`
}

// who: 'apikey' | 'jwt:<email>' (a CF Access session, the UI identity) | '<email>' (test-mode identity)
async function call(method: string, path: string, who: 'apikey' | string, body?: unknown) {
  const headers: Record<string, string> = {}
  let e = env
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who.startsWith('jwt:')) {
    headers['Cf-Access-Jwt-Assertion'] = fakeJwt(who.slice(4))
    e = { DB: env.DB, PB_API_KEY: API_KEY, HUB_LOCAL_DEV: '1' } as unknown as Env
  } else { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e, CTX,
  )
  return { status: res.status, text: await res.text() }
}

const launches = () => (db.prepare('SELECT COUNT(*) AS n FROM launch_log').get() as { n: number }).n

describe('POST /api/launch-log is PI-only', () => {
  it('a member is refused (403) for both origins and no row is written', async () => {
    for (const origin of ['mobile', 'computer']) {
      const r = await call('POST', '/api/launch-log', MEMBER_EMAIL, { tag: 'quickchat', seed: 'member text', origin })
      expect(r.status).toBe(403)
    }
    expect(launches()).toBe(0)
  })

  it('a member cannot refire a launch into a new row', async () => {
    insertRow(db, 'launch_log', { id: 'lnch_m', tag: 'quickchat', seed: 'x', origin: 'mobile', status: 'completed', requested_by: MEMBER_EMAIL, expires_at: '2999-01-01 00:00:00' })
    const r = await call('POST', '/api/launch-log/lnch_m/refire', MEMBER_EMAIL)
    expect(r.status).toBe(403)
    expect(launches()).toBe(1)
  })

  it('the PI session (CF Access JWT) creates a launch', async () => {
    const r = await call('POST', '/api/launch-log', `jwt:${PI_EMAIL}`, { tag: 'quickchat', seed: 'pi text', origin: 'mobile' })
    expect(r.status).toBe(201)
    expect(launches()).toBe(1)
  })

  it('the PB API key is refused (403) on create and writes nothing', async () => {
    for (const origin of ['computer', 'mobile']) {
      const r = await call('POST', '/api/launch-log', 'apikey', { tag: 'workon', seed: 'k', origin, project_slug: 'p' })
      expect(r.status).toBe(403)
    }
    expect(launches()).toBe(0)
  })

  it('the PB API key cannot refire a launch into a new row', async () => {
    insertRow(db, 'launch_log', { id: 'lnch_k', tag: 'quickchat', seed: 'x', origin: 'mobile', status: 'completed', requested_by: PI_EMAIL, expires_at: '2999-01-01 00:00:00' })
    const r = await call('POST', '/api/launch-log/lnch_k/refire', 'apikey')
    expect(r.status).toBe(403)
    expect(launches()).toBe(1)
  })

  it('the test-mode identity is refused even as the PI email (shared secret, not a person)', async () => {
    for (const origin of ['computer', 'mobile']) {
      const r = await call('POST', '/api/launch-log', PI_EMAIL, { tag: 'quickchat', seed: 't', origin })
      expect(r.status).toBe(403)
    }
    insertRow(db, 'launch_log', { id: 'lnch_t', tag: 'quickchat', seed: 'x', origin: 'mobile', status: 'completed', requested_by: PI_EMAIL, expires_at: '2999-01-01 00:00:00' })
    expect((await call('POST', '/api/launch-log/lnch_t/refire', PI_EMAIL)).status).toBe(403)
    expect(launches()).toBe(1)
  })

  it('the PI session (UI identity) still creates and refires', async () => {
    const c = await call('POST', '/api/launch-log', `jwt:${PI_EMAIL}`, { tag: 'workon', seed: 'ui', origin: 'computer', project_slug: 'p' })
    expect(c.status).toBe(201)
    const id = (JSON.parse(c.text) as { data: { id: string } }).data.id
    const r = await call('POST', `/api/launch-log/${id}/refire`, `jwt:${PI_EMAIL}`)
    expect(r.status).toBe(201)
    expect(launches()).toBe(2)
  })

  it('the PB API key still claims a pending launch', async () => {
    insertRow(db, 'launch_log', { id: 'lnch_c', tag: 'quickchat', seed: 'x', origin: 'mobile', status: 'pending', requested_by: PI_EMAIL, expires_at: '2999-01-01 00:00:00' })
    const r = await call('POST', '/api/launch-log/lnch_c/claim', 'apikey')
    expect(r.status).toBe(200)
  })
})

describe('GET /api/pb/launch-log/pending answers only the PI and the API key', () => {
  beforeEach(() => {
    insertRow(db, 'launch_log', { id: 'lnch_p', tag: 'quickchat', seed: 'x', origin: 'mobile', status: 'pending', requested_by: PI_EMAIL, expires_at: '2999-01-01 00:00:00' })
  })
  it('a member gets 403 and no ids', async () => {
    const r = await call('GET', '/api/pb/launch-log/pending', MEMBER_EMAIL)
    expect(r.status).toBe(403)
    expect(r.text).not.toContain('lnch_p')
  })
  it('the PI session and the API key get the pending row', async () => {
    for (const who of [PI_EMAIL, 'apikey']) {
      const r = await call('GET', '/api/pb/launch-log/pending', who)
      expect(r.status).toBe(200)
      expect(r.text).toContain('lnch_p')
    }
  })
})
