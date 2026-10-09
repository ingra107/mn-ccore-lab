/**
 * api/index.realtime.test.ts — the main API's side of the hub-realtime
 * contract (shared/realtime.ts).
 *
 * Until 2026-10-08 the Pages deployment bound the NotificationHub namespace,
 * not a service, so notifyClients found no `.fetch` and POSTed every broadcast
 * to the public workers.dev URL, which accepted anyone's POST. Now the API
 * calls the DO's RPC methods and makes no HTTP request, and it is the only
 * place a WebSocket ticket comes from (GET /api/realtime/ticket, behind the
 * route gate).
 *
 * Drives the real worker (worker.fetch, full middleware) over the real schema;
 * the namespace binding is a recording double.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import worker from './index'
import type { Env } from './types'
import { notifyClients } from './lib/notify'
import { REALTIME_TICKET_PATH } from '../shared/realtime'
import { prodSchemaDb, d1Adapter, insertRow } from './test-support/prod-schema-db'

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
const TEST_KEY = 'local-test-key-do-not-use-in-prod'

function fakeNamespace() {
  const calls = { notify: [] as string[], issueTicket: 0, rooms: [] as string[] }
  const ns = {
    idFromName(name: string) { calls.rooms.push(name); return { name } },
    get() {
      return {
        async notify(body: string) { calls.notify.push(body) },
        async issueTicket() { calls.issueTicket++; return `t${calls.issueTicket}` },
        async ping() { return 'ok' },
      }
    },
  }
  return { ns, calls }
}

let db: ReturnType<typeof prodSchemaDb>
beforeAll(() => {
  db = prodSchemaDb()
  insertRow(db, 'team_members', {
    id: 'tm_nate', name: 'Nate Member', slug: 'nate-member', role: 'Fellow', member_type: 'fellow', email: 'nate@umn.edu',
  })
})

function envWith(binding: unknown): Env {
  return { DB: d1Adapter(db), REQUIRE_AUTH: '1', TEST_MODE_KEY: TEST_KEY, NOTIFICATION_HUB: binding } as unknown as Env
}

async function getTicket(env: Env, signedIn: boolean) {
  const headers: Record<string, string> = signedIn ? { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'nate@umn.edu' } : {}
  return worker.fetch(new Request(`https://hub.test${REALTIME_TICKET_PATH}`, { headers }), env, CTX)
}

let fetchSpy: ReturnType<typeof vi.spyOn>
// Mocked so a regression to an HTTP broadcast is caught here instead of reaching the network.
beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests')) })
afterEach(() => { fetchSpy.mockRestore() })

describe('GET /api/realtime/ticket', () => {
  it('refuses an anonymous caller and mints nothing', async () => {
    const { ns, calls } = fakeNamespace()
    const res = await getTicket(envWith(ns), false)
    expect(res.status).toBe(401)
    expect(calls.issueTicket).toBe(0)
  })

  it('gives a signed-in member a ticket from the DO, uncached', async () => {
    const { ns, calls } = fakeNamespace()
    const res = await getTicket(envWith(ns), true)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ticket: 't1' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(calls.rooms).toEqual(['mnccore'])
  })

  it('answers 503 where the namespace is not bound', async () => {
    const res = await getTicket(envWith(undefined), true)
    expect(res.status).toBe(503)
  })

  it('a GET for a ticket does not trigger a broadcast', async () => {
    const { ns, calls } = fakeNamespace()
    await getTicket(envWith(ns), true)
    expect(calls.notify).toEqual([])
  })
})

describe('notifyClients', () => {
  it('broadcasts through the DO binding and makes no HTTP request', async () => {
    const { ns, calls } = fakeNamespace()
    await notifyClients({ NOTIFICATION_HUB: ns }, 'data')
    expect(calls.notify).toHaveLength(1)
    expect(JSON.parse(calls.notify[0])).toMatchObject({ type: 'data' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('with no binding, sends nothing anywhere (no public-URL fallback)', async () => {
    await notifyClients({}, 'data')
    // A service-binding Fetcher (the pre-2026-10-08 shape) is not a namespace either.
    await notifyClients({ NOTIFICATION_HUB: { fetch: async () => new Response('ok') } }, 'data')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never throws when the DO call fails', async () => {
    const ns = { idFromName: () => ({}), get: () => ({ notify: async () => { throw new Error('down') } }) }
    await expect(notifyClients({ NOTIFICATION_HUB: ns }, 'data')).resolves.toBeUndefined()
  })
})

describe('/api/health realtime probe', () => {
  it('reports the DO ping when bound', async () => {
    const { ns } = fakeNamespace()
    const res = await worker.fetch(
      new Request('https://hub.test/api/health', { headers: { 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': 'nate@umn.edu' } }),
      envWith(ns), CTX,
    )
    const body = await res.json() as { checks: { realtime: unknown } }
    expect(body.checks.realtime).toBe('ok')
  })
})
