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

async function post(path: string, body: unknown) {
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY, 'Content-Type': 'application/json' },
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

  it('a data write still bumps it (the control)', async () => {
    expect(await post('/api/notifications/read-all', {})).toBeLessThan(300)
    expect(version()).not.toBe('1')
  })

  it('only the read-receipt and error-report routes opt out', () => {
    const optOut = ROUTE_REGISTRY.filter((r) => r.noVersionBump).map((r) => `${r.method} ${r.path}`).sort()
    expect(optOut).toEqual(['POST /api/client-errors', 'POST /api/seen', 'POST /api/thread-seen'])
  })
})
