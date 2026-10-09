// The access contract in shared/realtime.ts, exercised against the real worker
// and Durable Object in workerd. The first two cases fail on the pre-2026-10-08
// worker, which answered an anonymous upgrade with 101 and broadcast any
// public POST body to every connection.
import { describe, it, expect } from 'vitest'
import { env, SELF, runInDurableObject } from 'cloudflare:test'
import {
  REALTIME_PARTY,
  REALTIME_ROOM,
  REALTIME_TICKET_PARAM,
  type RealtimeHubRpc,
} from '../../../shared/realtime'

const ROOM_URL = `https://hub-realtime.test/parties/${REALTIME_PARTY}/${REALTIME_ROOM}`

type Ns = { idFromName(n: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub }
const ns = (env as unknown as { NOTIFICATION_HUB: Ns }).NOTIFICATION_HUB
function hubStub() {
  return ns.get(ns.idFromName(REALTIME_ROOM))
}
function hub(): RealtimeHubRpc {
  return hubStub() as unknown as RealtimeHubRpc
}

function upgrade(ticket?: string) {
  const url = ticket ? `${ROOM_URL}?${REALTIME_TICKET_PARAM}=${ticket}` : ROOM_URL
  return SELF.fetch(url, { headers: { Upgrade: 'websocket' } })
}

/** Open a socket with a fresh member ticket; collect what it receives. */
async function connectMember(member = 'nate-member') {
  const ticket = await hub().issueTicket(member)
  const res = await upgrade(ticket)
  expect(res.status).toBe(101)
  const ws = res.webSocket!
  ws.accept()
  const received: string[] = []
  ws.addEventListener('message', (e) => { received.push(String(e.data)) })
  return { ws, received, ticket }
}

const settle = () => new Promise((r) => setTimeout(r, 50))

describe('hub-realtime access', () => {
  it('refuses a WebSocket upgrade with no ticket', async () => {
    const res = await upgrade()
    expect(res.status).toBe(401)
    expect(res.webSocket).toBeNull()
  })

  it('refuses a public POST and delivers nothing', async () => {
    const { ws, received } = await connectMember()
    const res = await SELF.fetch(ROOM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'data', forged: true }),
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    await settle()
    expect(received).toEqual([])
    ws.close()
  })

  it('refuses a made-up ticket', async () => {
    const res = await upgrade('0'.repeat(64))
    expect(res.status).toBe(401)
  })

  it('refuses a ticket used twice', async () => {
    const { ws, ticket } = await connectMember()
    const again = await upgrade(ticket)
    expect(again.status).toBe(401)
    ws.close()
  })

  it('refuses an expired ticket', async () => {
    await runInDurableObject(hubStub(), async (_instance, state) => {
      await state.storage.put('ticket:stale', { member: 'nate-member', expires: Date.now() - 1 })
    })
    const res = await upgrade('stale')
    expect(res.status).toBe(401)
  })

  it('a ticketed member connects and receives an API broadcast', async () => {
    const { ws, received } = await connectMember()
    await hub().notify(JSON.stringify({ type: 'data', timestamp: 1 }))
    await settle()
    expect(received).toEqual([JSON.stringify({ type: 'data', timestamp: 1 })])
    ws.close()
  })

  it('relays a member message to other members, not back to the sender', async () => {
    const a = await connectMember('alice')
    const b = await connectMember('bob')
    a.ws.send(JSON.stringify({ type: 'presence-ping', slug: 'alice', entityId: 'p1' }))
    await settle()
    expect(b.received.map((m) => JSON.parse(m))).toEqual([{ type: 'presence-ping', slug: 'alice', entityId: 'p1' }])
    expect(a.received).toEqual([])
    a.ws.close()
    b.ws.close()
  })

  it('a member cannot speak as another member: slug is the ticket member', async () => {
    const a = await connectMember('alice')
    const b = await connectMember('bob')
    a.ws.send(JSON.stringify({ type: 'typing-start', slug: 'bob', entityId: 't1' }))
    a.ws.send(JSON.stringify({ type: 'presence-ping', entityId: 't1' }))
    await settle()
    expect(b.received.map((m) => JSON.parse(m).slug)).toEqual(['alice', 'alice'])
    a.ws.close()
    b.ws.close()
  })

  it('drops a message that is not a JSON object', async () => {
    const a = await connectMember('alice')
    const b = await connectMember('bob')
    a.ws.send('not json')
    a.ws.send(JSON.stringify(['array']))
    a.ws.send(JSON.stringify('string'))
    await settle()
    expect(b.received).toEqual([])
    a.ws.close()
    b.ws.close()
  })

  it('a client cannot set its own member header', async () => {
    const ticket = await hub().issueTicket('alice')
    const res = await SELF.fetch(`${ROOM_URL}?${REALTIME_TICKET_PARAM}=${ticket}`, {
      headers: { Upgrade: 'websocket', 'x-hub-member': 'bob' },
    })
    const a = res.webSocket!
    a.accept()
    const b = await connectMember('carol')
    a.send(JSON.stringify({ type: 'presence-ping' }))
    await settle()
    expect(b.received.map((m) => JSON.parse(m).slug)).toEqual(['alice'])
    a.close()
    b.ws.close()
  })

  it('refuses to mint a ticket with no member', async () => {
    // Called inside the DO: an RPC throw is also logged by workerd as an
    // uncaught exception, which vitest counts as a failed run.
    await runInDurableObject(hubStub(), async (instance) => {
      await expect((instance as unknown as RealtimeHubRpc).issueTicket('')).rejects.toThrow(/slug/)
      await expect((instance as unknown as RealtimeHubRpc).issueTicket('  ')).rejects.toThrow(/slug/)
    })
  })

  it('/health stays a bare liveness probe', async () => {
    const res = await SELF.fetch('https://hub-realtime.test/health')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
})
