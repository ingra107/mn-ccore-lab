// Settings shows the digest switch only to someone the digest would reach, so
// /api/auth/me must answer that with the same rule the send uses: a director or a
// coordinator, on the DIGEST_RECIPIENTS list. Through the real worker.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import { handleSendDailyDigests } from './digest-email'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const NIDA = 'mohamud@umn.edu'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
const envWith = (recipients?: string) => ({ DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1', DIGEST_RECIPIENTS: recipients }) as unknown as Env

async function me(who: string, env: Env) {
  const res = await worker.fetch(new Request('https://hub.test/api/auth/me', { headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': who } }), env, CTX)
  return await res.json() as { getsDigestEmail?: boolean; isMember?: boolean }
}

beforeEach(() => {
  db = prodSchemaDb()
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-nida', name: 'Nida', slug: 'nida-mohamud', member_type: 'coordinator', email: NIDA })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"id":"e"}', { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('/api/auth/me getsDigestEmail', () => {
  it('a research-team member never gets it, whatever the list says', async () => {
    expect((await me(CASEY, envWith('all'))).getsDigestEmail).toBe(false)
  })

  it('directors and coordinators get it when the list is all', async () => {
    expect((await me(NICK, envWith('all'))).getsDigestEmail).toBe(true)
    expect((await me(NIDA, envWith('all'))).getsDigestEmail).toBe(true)
  })

  it('with the list unset, a coordinator off the default list does not get it', async () => {
    expect((await me(NICK, envWith())).getsDigestEmail).toBe(true)
    expect((await me(NIDA, envWith())).getsDigestEmail).toBe(false)
  })

  it('agrees with who the send actually mails', async () => {
    const env = { ...envWith(NICK), RESEND_API_KEY: 'k' } as unknown as Env
    const mailed: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
      mailed.push(...[(JSON.parse(String(init?.body)) as { to: string | string[] }).to].flat())
      return new Response('{"id":"e"}', { status: 200 })
    }))
    const res = await handleSendDailyDigests(env, { kind: 'cron' })
    expect(res.status).toBe(200)
    expect(mailed).toEqual([NICK])
    for (const who of [NICK, NIDA, CASEY]) {
      expect((await me(who, env)).getsDigestEmail, who).toBe(mailed.includes(who))
    }
  })
})
