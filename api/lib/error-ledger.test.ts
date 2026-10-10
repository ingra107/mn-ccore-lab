// error-ledger.test.ts -- schema-v123 hub_errors: every door records, a flood
// is one row, the ledger never records itself, and no member reads a row.
// Plan: PB Scratch/plans/2026-10-09-hub-error-ledger-reconciled.md.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import worker from '../index'
import type { Env } from '../types'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { _resetPiEmailsCacheForTests } from '../helpers'
import {
  withErrorLedger, recordError, flushErrors, normalizeMessage, fingerprint, topFrame,
  installConsoleCapture, _resetErrorLedgerForTests, _pendingForTests, REPEAT_WINDOW_MS, MAX_PENDING,
} from './error-ledger'
import { personViewer, nobodyViewer, viewerDb } from './viewer-db'
import { ctToday } from './ct-date'

const API_KEY = 'error-ledger-api-key'
const TEST_KEY = 'local-test-key-do-not-use-in-prod'
const NICK = 'ingra107@umn.edu'
const CASEY = 'eddin022@umn.edu'
const STRANGER = 'stranger@umn.edu'

let db: InstanceType<typeof Database>
let env: Env
let bg: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { bg.push(p) }, passThroughOnException: () => {} }) as unknown as ExecutionContext
const settle = async () => { while (bg.length) await Promise.allSettled(bg.splice(0)) }

type Row = { fingerprint: string; day: string; source: string; count: number; sample_message: string; sample_stack: string | null; path: string | null; last_request_id: string | null; last_actor_slug: string | null }
const rows = (): Row[] => db.prepare('SELECT * FROM hub_errors ORDER BY source, sample_message').all() as Row[]

function seed(hooks: Parameters<typeof d1Adapter>[1] = {}) {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([NICK]))
  _resetPiEmailsCacheForTests()
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick Ingraham', slug: 'nick-ingraham', member_type: 'director', email: NICK })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
  env = { DB: d1Adapter(db, hooks), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: API_KEY, REQUIRE_AUTH: '1' } as unknown as Env
}

async function call(method: string, path: string, who: 'apikey' | 'anon' | string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who === 'apikey') headers.Authorization = `Bearer ${API_KEY}`
  else if (who !== 'anon') { headers['X-Test-Mode-Key'] = TEST_KEY; headers['X-Test-User'] = who }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await worker.fetch(
    new Request(`https://hub.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    env, ctx(),
  )
  const text = await res.text()
  await settle()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, text, json }
}

beforeEach(() => {
  bg = []
  _resetErrorLedgerForTests()
  seed()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('stubbed', { status: 503 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('fingerprint normalization', () => {
  it('strips the ids, digits and request_id that differ per occurrence', () => {
    const a = normalizeMessage('task task_01J9ZK3M4N5P6Q7R8S9T0V1W2X not found (request_id=abc123def456) after 3 tries')
    const b = normalizeMessage('task task_01JAAAAAAAAAAAAAAAAAAAAAAA not found (request_id=ffff00001111) after 12 tries')
    expect(a).toBe(b)
    expect(normalizeMessage('row 0123456789abcdef0123456789abcdef gone')).toBe(normalizeMessage('row fedcba9876543210fedcba9876543210 gone'))
    expect(normalizeMessage('id 123e4567-e89b-12d3-a456-426614174000')).toBe('id <uuid>')
  })

  it('keeps different errors apart (the words survive)', () => {
    expect(normalizeMessage('no such table: hub_errors')).not.toBe(normalizeMessage('no such table: tasks'))
    expect(normalizeMessage('no such table: hub_errors')).toBe('no such table: hub_errors')
  })

  it('the top frame drops line and column numbers', () => {
    expect(topFrame('Error: x\n    at handler (index.js:120:7)\n    at other')).toBe('at handler (index.js:#:#)')
    expect(topFrame(null)).toBe('')
  })

  it('fingerprint is 16 hex and depends on the source', async () => {
    const s = await fingerprint('server', 'm', '')
    expect(s).toMatch(/^[0-9a-f]{16}$/)
    expect(await fingerprint('client', 'm', '')).not.toBe(s)
  })
})

describe('the doors', () => {
  it('(a) a console.error during a request is recorded once the request ends', async () => {
    const handlers = withErrorLedger<Env>({
      fetch: async () => { console.error('[Probe] lookup failed:', 'disk on fire 42'); return new Response('ok') },
      scheduled: async () => {},
    })
    const res = await handlers.fetch(new Request('https://hub.test/api/x'), env, ctx())
    expect(res.status).toBe(200)
    await settle()
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ source: 'server', count: 1, sample_message: '[Probe] lookup failed: disk on fire 42' })
  })

  it('(b) a throw through the real app: one row whose last_request_id is the 500 body\'s, and the body has no message', async () => {
    seed({ failSql: /FROM tasks/, failTimes: 100 })
    const res = await call('GET', '/api/tasks', 'apikey')
    expect(res.status).toBe(500)
    expect(res.text).not.toContain('simulated D1 failure')
    const id = res.json.request_id as string
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    const r = rows().filter((x) => x.last_request_id === id)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ source: 'server', path: '/api/tasks', count: 1 })
    expect(r[0].sample_message).toContain('simulated D1 failure')
  })

  it('(c) a rejected waitUntil promise is recorded', async () => {
    const handlers = withErrorLedger<Env>({
      fetch: async (_r, _e, c) => { c.waitUntil(Promise.reject(new Error('background boom'))); return new Response('ok') },
      scheduled: async () => {},
    })
    await handlers.fetch(new Request('https://hub.test/api/bg'), env, ctx())
    await settle()
    await flushErrors(env)
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ source: 'server', path: '/api/bg' })
    expect(r[0].sample_message).toContain('background boom')
  })

  it('(d) a throwing scheduled run is recorded as cron and still rethrows', async () => {
    const handlers = withErrorLedger<Env>({
      fetch: async () => new Response('ok'),
      scheduled: async () => { throw new Error('cron exploded') },
    })
    await expect(handlers.scheduled({ cron: '0 * * * *' } as ScheduledEvent, env, ctx())).rejects.toThrow('cron exploded')
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ source: 'cron', path: '0 * * * *' })
  })

  it('a console.error inside the real cron is recorded as cron', async () => {
    seed({ failSql: /processed_mutations/, failTimes: 100 })
    await worker.scheduled({ cron: '0 * * * *' } as ScheduledEvent, env, ctx())
    const cron = rows().filter((x) => x.source === 'cron')
    expect(cron.length).toBeGreaterThan(0)
    expect(cron.some((x) => x.sample_message.includes('simulated D1 failure'))).toBe(true)
  })
})

describe('flood control and failure', () => {
  it('(e) 1,000 occurrences of one error with different ids are one row, count 1000', async () => {
    for (let i = 0; i < 1000; i++) recordError({ source: 'server', message: `task task_01J9ZK3M4N5P6Q7R8S9T0V${String(i).padStart(4, '0')} missing (try ${i})` })
    await flushErrors(env)
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0].count).toBe(1000)
  })

  it('a repeat inside the window waits; after the window it adds to the same row', async () => {
    const t0 = Date.parse('2026-10-10T12:00:00Z')
    recordError({ source: 'server', message: 'loop error' }, t0)
    await flushErrors(env, t0)
    recordError({ source: 'server', message: 'loop error' }, t0 + 1000)
    recordError({ source: 'server', message: 'loop error' }, t0 + 2000)
    await flushErrors(env, t0 + 2000)
    expect(rows()[0].count).toBe(1)
    expect(_pendingForTests()).toEqual([{ source: 'server', message: 'loop error', count: 2, target: 'prod' }])
    await flushErrors(env, t0 + REPEAT_WINDOW_MS + 1)
    expect(rows()).toHaveLength(1)
    expect(rows()[0].count).toBe(3)
  })

  it('a huge message is cut before normalizing: two that differ past 2,000 chars are one entry', () => {
    const head = 'payload '.repeat(300)
    recordError({ source: 'server', message: `${head}${'a'.repeat(500_000)}` })
    recordError({ source: 'server', message: `${head}${'b'.repeat(500_000)}` })
    const p = _pendingForTests()
    expect(p).toHaveLength(1)
    expect(p[0].count).toBe(2)
    expect(p[0].message.length).toBeLessThanOrEqual(500)
  })

  it('the buffer holds at most MAX_PENDING distinct entries', () => {
    for (let i = 0; i < MAX_PENDING + 50; i++) recordError({ source: 'server', message: `distinct error word${'x'.repeat(i % 7)}${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` })
    expect(_pendingForTests().length).toBeLessThanOrEqual(MAX_PENDING)
  })

  it('(f) a failing flush (table missing) drops its entries and records nothing about itself', async () => {
    installConsoleCapture()
    db.exec('DROP TABLE hub_errors')
    recordError({ source: 'server', message: 'first' })
    await flushErrors(env)
    // The flush failure went to the original console.error, not the buffer.
    expect(_pendingForTests()).toEqual([])
  })

  it('the CHECK refuses a source outside server/cron/client', () => {
    expect(() => db.prepare("INSERT INTO hub_errors (fingerprint, day, source, sample_message) VALUES ('f', '2026-10-10', 'bogus', 'm')").run())
      .toThrow(/CHECK/)
  })

  it('a verified test-mode request writes to DB_TEST, not prod', async () => {
    const testDb = prodSchemaDb()
    env = { ...env, DB_TEST: d1Adapter(testDb) } as Env
    insertRow(testDb, 'team_members', { id: 'tm-casey', name: 'Casey Eddington', slug: 'casey-eddington', member_type: 'research_team', email: CASEY })
    const res = await worker.fetch(new Request('https://hub.test/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Mode': 'true', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': CASEY },
      body: JSON.stringify({ errors: [{ message: 'e2e crash', kind: 'uncaught' }] }),
    }), env, ctx())
    expect(res.status).toBe(202)
    await settle()
    expect(rows()).toEqual([])
    expect((testDb.prepare('SELECT source, last_actor_slug FROM hub_errors').all())).toEqual([{ source: 'client', last_actor_slug: 'casey-eddington' }])
  })
})

describe('no member reads a row (TABLE_SCOPE)', () => {
  it('a person and nobody read zero rows; the raw handle reads them', async () => {
    recordError({ source: 'server', message: 'secret SQL text' })
    await flushErrors(env)
    const raw = d1Adapter(db)
    expect((await raw.prepare('SELECT COUNT(*) AS n FROM hub_errors').first<{ n: number }>())?.n).toBe(1)
    const nick = viewerDb(raw, personViewer({ slug: 'nick-ingraham', email: NICK, pi: true, allProjects: true }))
    expect((await nick.prepare('SELECT * FROM hub_errors').all()).results).toEqual([])
    const nobody = viewerDb(raw, nobodyViewer())
    expect((await nobody.prepare('SELECT * FROM hub_errors').all()).results).toEqual([])
  })
})

describe('POST /api/client-errors', () => {
  const one = { errors: [{ message: 'TypeError: x is undefined', stack: 'TypeError\n    at Today (Today.tsx:10:3)', path: '/portal/dashboard', kind: 'uncaught', count: 3 }] }

  it('anonymous is refused (401) and writes nothing', async () => {
    expect((await call('POST', '/api/client-errors', 'anon', one)).status).toBe(401)
    expect(rows()).toEqual([])
  })

  it('a signed-in non-member is refused (403) and writes nothing', async () => {
    expect((await call('POST', '/api/client-errors', STRANGER, one)).status).toBe(403)
    expect(rows()).toEqual([])
  })

  it('a member writes one client row with their slug and the coalesced count', async () => {
    const res = await call('POST', '/api/client-errors', CASEY, one)
    expect(res.status).toBe(202)
    expect(rows()).toEqual([expect.objectContaining({
      source: 'client', count: 3, path: '/portal/dashboard', last_actor_slug: 'casey-eddington',
      sample_message: '[uncaught] TypeError: x is undefined',
    })])
  })

  it('does not bump /api/version (no refetch loop on a crash)', async () => {
    db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('version', '1')").run()
    const version = () => (db.prepare("SELECT value FROM _meta WHERE key = 'version'").get() as { value: string } | undefined)?.value
    const before = version()
    expect(before).toBe('1')
    expect((await call('POST', '/api/client-errors', CASEY, one)).status).toBe(202)
    expect(version()).toBe(before)
  })

  it('refuses more than 20 items, an empty list, and an item with no message (400)', async () => {
    const many = { errors: Array.from({ length: 21 }, (_, i) => ({ message: `e${i}` })) }
    expect((await call('POST', '/api/client-errors', CASEY, many)).status).toBe(400)
    expect((await call('POST', '/api/client-errors', CASEY, { errors: [] })).status).toBe(400)
    expect((await call('POST', '/api/client-errors', CASEY, { errors: [{ stack: 'x' }] })).status).toBe(400)
    expect(rows()).toEqual([])
  })
})

describe('GET /api/hub-errors/weekly', () => {
  it('a member (Nick included) gets 403; the PB key gets counts per window and source', async () => {
    const today = ctToday()
    const tenDaysAgo = ctToday(-10)
    const ins = db.prepare('INSERT INTO hub_errors (fingerprint, day, source, count, sample_message) VALUES (?, ?, ?, ?, ?)')
    ins.run('a', today, 'server', 4, 'm1')
    ins.run('b', today, 'client', 2, 'm2')
    ins.run('a', tenDaysAgo, 'server', 7, 'm1')
    expect((await call('GET', '/api/hub-errors/weekly', NICK)).status).toBe(403)
    expect((await call('GET', '/api/hub-errors/weekly', CASEY)).status).toBe(403)
    const res = await call('GET', '/api/hub-errors/weekly?weeks=2', 'apikey')
    expect(res.status).toBe(200)
    expect(res.json.weeks).toBe(2)
    expect(res.json.windows[0]).toMatchObject({ weeks_ago: 0, end: today, count: 6, by_source: { server: 4, cron: 0, client: 2 } })
    expect(res.json.windows[1]).toMatchObject({ weeks_ago: 1, count: 7, by_source: { server: 7, cron: 0, client: 0 } })
  })
})
