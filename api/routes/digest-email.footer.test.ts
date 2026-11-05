// The digest email's footer carries "Manage notifications", and the link is
// true: it lands on the Settings tab holding the digest's on/off switch. A member
// who turned the digest off gets none; everyone else still does (Nick, 2026-11-05).
//
// Both templates, through their real handlers against the migrated schema:
//   - the per-member digest, via GET /api/digest-preview;
//   - the coordinator daily brief, via handleSendDailyDigests, capturing
//     the body it posts to Resend.
// The switch is set from a member's seat, through the real worker's user-prefs route.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { handleDigestPreview, handleSendDailyDigests } from './digest-email'
import { viewerDb, personViewer } from '../lib/viewer-db'
import { _resetPiEmailsCacheForTests, type Env } from '../helpers'
import { DIGEST_EMAIL_PREF } from '../../shared/userPrefKeys'

const MANAGE = '/portal/settings#notifications'
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const CASEY = 'eddin022@umn.edu'

let db: InstanceType<typeof Database>
let env: Env
let sent: Array<{ to: string | string[]; html: string }>

beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify(['ingra107@umn.edu']))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { slug: 'nick-ingraham', name: 'Nick Ingraham', email: 'ingra107@umn.edu', member_type: 'director' })
  insertRow(db, 'team_members', { slug: 'casey-eddington', name: 'Casey Eddington', email: CASEY, member_type: 'coordinator' })
  env = {
    DB: d1Adapter(db), RESEND_API_KEY: 'test-key', DIGEST_RECIPIENTS: 'all',
    TEST_MODE_KEY: TEST_KEY, REQUIRE_AUTH: '1',
  } as unknown as Env
  sent = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as { to: string | string[]; html: string })
    return new Response('{}', { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); _resetPiEmailsCacheForTests() })

const recipients = () => sent.map((m) => String(m.to)).join(' ')

/** Casey sets the switch herself: her own session, her own handle. */
async function caseySets(value: unknown): Promise<number> {
  const res = await worker.fetch(new Request(`https://hub.test/api/user-prefs/${encodeURIComponent(DIGEST_EMAIL_PREF)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY },
    body: JSON.stringify({ value }),
  }), env, CTX)
  return res.status
}

describe('digest email footer', () => {
  it('the per-member digest (preview) links to the switch', async () => {
    const res = await handleDigestPreview(new URL('https://x/api/digest-preview?member=nick-ingraham'), env)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toMatch(new RegExp(`href="[^"]*${MANAGE}"[^>]*>\\s*Manage notifications`))
  })

  it('the coordinator daily brief links to the switch', async () => {
    const res = await handleSendDailyDigests(env, { kind: 'cron' })
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(2)
    expect(sent[0].html).toMatch(new RegExp(`href="[^"]*${MANAGE}"[^>]*>\\s*Manage notifications`))
  })
})

describe('the daily digest on/off switch, from a member\'s seat', () => {
  it('stays on by default', async () => {
    await handleSendDailyDigests(env, { kind: 'cron' })
    expect(recipients()).toContain(CASEY)
  })

  it('a member who turns it off gets none, and nobody else is affected', async () => {
    expect(await caseySets(false)).toBe(200)
    const res = await handleSendDailyDigests(env, { kind: 'cron' })
    expect(recipients()).not.toContain(CASEY)
    expect(recipients()).toContain('ingra107@umn.edu')
    const body = await res.json() as { data: { sent: number; skipped: number; opted_out: number } }
    expect(body.data).toMatchObject({ sent: 1, skipped: 0, opted_out: 1 })
  })

  it('turning it back on sends it again', async () => {
    await caseySets(false)
    await caseySets(true)
    await handleSendDailyDigests(env, { kind: 'cron' })
    expect(recipients()).toContain(CASEY)
  })

  it('a PI fan-out sees the switch of a member the PI\'s own handle cannot read', async () => {
    await caseySets(false)
    const raw = env.DB
    const nickEnv = { ...env, DB: viewerDb(raw, personViewer({ slug: 'nick-ingraham', email: 'ingra107@umn.edu', pi: true })) } as unknown as Env
    const request = new Request('https://x/api/digest-email/daily', { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'ingra107@umn.edu' } })
    const res = await handleSendDailyDigests(nickEnv, { kind: 'http', request, unscopedDb: raw })
    expect(res.status).toBe(200)
    expect(recipients()).not.toContain(CASEY)
  })

  it('an unreadable stored value counts as on: only a saved false turns it off', async () => {
    db.prepare('INSERT INTO user_prefs (member_slug, key, value_json) VALUES (?, ?, ?)').run('casey-eddington', DIGEST_EMAIL_PREF, 'null')
    await handleSendDailyDigests(env, { kind: 'cron' })
    expect(recipients()).toContain(CASEY)
  })
})
