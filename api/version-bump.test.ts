// version-bump.test.ts -- a write bumps _meta.version (every open tab refetches);
// a route that declares noVersionBump does not. A read receipt must not make
// every member's tab refetch every query.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from './index'
import type { Env } from './types'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from './helpers'
import { ROUTE_REGISTRY } from './lib/route-dsl'

const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env
let bg: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { bg.push(p) }, passThroughOnException: () => {} }) as unknown as ExecutionContext
const settle = async () => { while (bg.length) await Promise.allSettled(bg.splice(0)) }
const version = () => (db.prepare("SELECT value FROM _meta WHERE key = 'version'").get() as { value: string } | undefined)?.value

async function post(path: string, body: unknown, as: 'casey' | 'service' = 'casey') {
  const who = as === 'service' ? { Authorization: 'Bearer k' } : { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY }
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, {
      method: 'POST',
      headers: { ...who, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env, ctx(),
  )
  await res.text()
  await settle()
  return res.status
}

beforeEach(() => {
  bg = []
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('version', '1')").run()
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: 'k', REQUIRE_AUTH: '1' } as unknown as Env
})

describe('version bump', () => {
  it('POST /api/seen does not bump /api/version', async () => {
    expect(await post('/api/seen', { entity_type: 'day', entity_id: '2026-10-13' })).toBe(200)
    expect(version()).toBe('1')
  })

  it('marking notifications read does not bump it (a per-user read receipt)', async () => {
    insertRow(db, 'notifications', { id: 'n-1', recipient_slug: 'casey-eddington', type: 'mention', source_type: 'task', source_id: 't-1', title: 'hi', read: 0 })
    expect(await post('/api/notifications/n-1/read', {})).toBe(200)
    expect(await post('/api/notifications/read-all', {})).toBe(200)
    expect((db.prepare("SELECT read FROM notifications WHERE id = 'n-1'").get() as { read: number }).read).toBe(1)
    expect(version()).toBe('1')
  })

  it('a data write still bumps it (the control)', async () => {
    expect(await post('/api/commitments', { id: 'c-1', commitment: 'send the draft', to_whom: 'Nick' })).toBeLessThan(300)
    expect(version()).not.toBe('1')
  })

  it('the Hermes claim poll, claim and release do not bump it; the answer does (schema-v140)', async () => {
    insertRow(db, 'ai_requests', { id: 'ai-vb', source_type: 'direct', source_id: 's', prompt: 'q', status: 'pending' })
    expect(await post('/api/ai-requests/queue', {}, 'service')).toBe(200)
    expect(await post('/api/ai-requests/ai-vb/claim', { machine: 'work' }, 'service')).toBe(200)
    const token = (db.prepare("SELECT claim_token FROM ai_requests WHERE id = 'ai-vb'").get() as { claim_token: string }).claim_token
    expect(await post('/api/ai-requests/ai-vb/release', { claim_token: token }, 'service')).toBe(200)
    expect(version()).toBe('1')
    // The release backed the next claim off; let the clock pass it.
    db.prepare("UPDATE ai_requests SET claim_expires_at = 0 WHERE id = 'ai-vb'").run()
    // Through the real router and auth: a member cannot claim, the service can answer.
    expect(await post('/api/ai-requests/ai-vb/claim', {}, 'casey')).toBe(403)
    expect(await post('/api/ai-requests/ai-vb/claim', {}, 'service')).toBe(200)
    const token2 = (db.prepare("SELECT claim_token FROM ai_requests WHERE id = 'ai-vb'").get() as { claim_token: string }).claim_token
    expect(await post('/api/ai-requests/ai-vb/response', { response: 'hi', claim_token: token }, 'service')).toBe(409)
    expect(await post('/api/ai-requests/ai-vb/response', { response: 'hi', claim_token: token2 }, 'service')).toBe(200)
    expect(version()).not.toBe('1')
  })

  it('only the read-receipt, error-report, Hermes claim and release-intake routes opt out', () => {
    const optOut = ROUTE_REGISTRY.filter((r) => r.noVersionBump).map((r) => `${r.method} ${r.path}`).sort()
    expect(optOut).toEqual([
      'POST /api/ai-requests/:id/alert-sent',
      'POST /api/ai-requests/:id/claim',
      'POST /api/ai-requests/:id/release',
      'POST /api/ai-requests/queue',
      // #156: announcements change only the pulse, which refreshes itself.
      'POST /api/announcements',
      'POST /api/announcements/:id/delete',
      'POST /api/client-errors',
      'POST /api/notifications/:id/read',
      'POST /api/notifications/read-all',
      // #156: the deploy's release intake writes a draft only Nick can read.
      'POST /api/releases',
      'POST /api/releases/:id',
      'POST /api/seen',
      'POST /api/thread-seen',
    ])
  })
})
