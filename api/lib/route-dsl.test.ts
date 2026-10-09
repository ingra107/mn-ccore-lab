// route-dsl.test.ts — Z1.1+Z1.2
//
// Unit tests for defineRoute() metadata registration and bindRegistryToHono().

import { Hono } from 'hono'
import {
  defineRoute,
  bindRegistryToHono,
  ROUTE_REGISTRY,
  _resetRegistryForTests,
  type RouteGate,
} from './route-dsl'

const deny = () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
const denyNonMember = () => new Response(JSON.stringify({ error: 'members only', code: 'not_a_member' }), { status: 403 })
const OPEN_GATE: RouteGate = { callerKind: () => 'member', deny, denyNonMember }
const ANON_GATE: RouteGate = { callerKind: () => 'anonymous', deny, denyNonMember }
const NON_MEMBER_GATE: RouteGate = { callerKind: () => 'non-member', deny, denyNonMember }

const jsonRes = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

describe('defineRoute()', () => {
  beforeEach(() => _resetRegistryForTests())

  it('records metadata in ROUTE_REGISTRY', () => {
    const handler = async () => new Response('ok')
    defineRoute({
      method: 'GET',
      path: '/api/test/x',
      auth: 'authed',
      entity: 'tasks',
      visibility: 'pb-aware',
      handler,
    })
    expect(ROUTE_REGISTRY).toHaveLength(1)
    expect(ROUTE_REGISTRY[0]).toMatchObject({
      method: 'GET',
      path: '/api/test/x',
      auth: 'authed',
      entity: 'tasks',
      visibility: 'pb-aware',
    })
    expect(ROUTE_REGISTRY[0].handler).toBe(handler)
  })

  it('rejects duplicate registrations of (method, path)', () => {
    defineRoute({
      method: 'GET',
      path: '/api/test/y',
      auth: 'public',
      anonShape: { data: true },
      handler: async () => new Response(),
    })
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/y',
        auth: 'public',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).toThrow(/duplicate route/i)
  })

  it('accepts auth=public with an anonShape and no entity/visibility', () => {
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/z',
        auth: 'public',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).not.toThrow()
  })

  it('rejects a public GET with no anonShape (load-time half of the type error)', () => {
    expect(() =>
      // @ts-expect-error a public GET without anonShape must not type-check
      defineRoute({
        method: 'GET',
        path: '/api/test/no-shape',
        auth: 'public',
        handler: async () => new Response(),
      }),
    ).toThrow(/no anonShape/i)
  })

  it('rejects an anonShape on a route that is not a public GET', () => {
    expect(() =>
      // @ts-expect-error only a public GET may carry anonShape
      defineRoute({
        method: 'GET',
        path: '/api/test/authed-shape',
        auth: 'authed',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).toThrow(/not a public GET/i)
  })

  it('rejects anonRows on a route that is not a public GET', () => {
    expect(() =>
      // @ts-expect-error only a public GET may carry anonRows
      defineRoute({
        method: 'GET',
        path: '/api/test/authed-rows',
        auth: 'authed',
        anonRows: () => true,
        handler: async () => new Response(),
      }),
    ).toThrow(/anonRows but is not a public GET/i)
  })

  it('rejects unknown auth level', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defineRoute({
        method: 'GET',
        path: '/api/test/w',
        auth: 'wat' as any,
        handler: async () => new Response(),
      }),
    ).toThrow(/auth must be one of/i)
  })
})

describe('bindRegistryToHono()', () => {
  beforeEach(() => _resetRegistryForTests())

  it('binds every registered route to the Hono app', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/a',
      auth: 'public',
      anonShape: { data: true },
      handler: async () => jsonRes({ data: 'a', secret: 's' }),
    })
    defineRoute({
      method: 'POST',
      path: '/api/bind-test/b',
      auth: 'authed',
      handler: async () => jsonRes({ data: 'b' }),
    })
    const app = new Hono()
    bindRegistryToHono(app, OPEN_GATE)
    const resA = await app.request('/api/bind-test/a')
    const resB = await app.request('/api/bind-test/b', { method: 'POST' })
    // An identified caller gets the handler's response untouched.
    expect(await resA.json()).toEqual({ data: 'a', secret: 's' })
    expect(await resB.json()).toEqual({ data: 'b' })
  })

  it('anonymous: a public GET is cut to its anonShape, an authed GET is denied before its handler', async () => {
    let authedHandlerRan = false
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/pub',
      auth: 'public',
      anonShape: { data: [{ id: true }], count: true },
      handler: async () => jsonRes({ data: [{ id: 'p1', note: 'private', nested: { x: 1 } }], count: 1, extra: 'x' }),
    })
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/priv',
      auth: 'authed',
      handler: async () => {
        authedHandlerRan = true
        return jsonRes({ data: 'secret' })
      },
    })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    const pub = await app.request('/api/bind-test/pub')
    expect(pub.status).toBe(200)
    expect(await pub.json()).toEqual({ data: [{ id: 'p1' }], count: 1 })
    const priv = await app.request('/api/bind-test/priv')
    expect(priv.status).toBe(401)
    expect(authedHandlerRan).toBe(false)
    // Hono routes HEAD through GET handlers; the gate covers it too.
    const head = await app.request('/api/bind-test/priv', { method: 'HEAD' })
    expect(head.status).toBe(401)
    expect(authedHandlerRan).toBe(false)
  })

  it('anonymous: a non-2xx from a public GET passes only the error envelope', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/err',
      auth: 'public',
      anonShape: { data: true },
      handler: async () => new Response(JSON.stringify({ error: 'Not found', detail: 'SELECT ...' }), { status: 404 }),
    })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    const res = await app.request('/api/bind-test/err')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('anonymous: anonRows drops refused rows before the shape and recomputes count', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/rows',
      auth: 'public',
      // status is NOT in the shape: the filter reads the raw row.
      anonShape: { data: [{ id: true }], count: true },
      anonRows: (r) => r.status === 'Published',
      handler: async () => jsonRes({
        data: [{ id: 'a', status: 'Published' }, { id: 'b', status: 'In Review' }, 'not-a-row'],
        count: 3,
      }),
    })
    const signedIn = new Hono()
    bindRegistryToHono(signedIn, OPEN_GATE)
    expect((await (await signedIn.request('/api/bind-test/rows')).json()).count).toBe(3)
    const anon = new Hono()
    bindRegistryToHono(anon, ANON_GATE)
    const res = await anon.request('/api/bind-test/rows')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [{ id: 'a' }], count: 1 })
  })

  it('anonymous: anonRows on a body with no data array fails closed (500), never sends every row', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/rows-bad',
      auth: 'public',
      anonShape: { rows: [{ id: true }] },
      anonRows: () => false,
      handler: async () => jsonRes({ rows: [{ id: 'secret-row' }] }),
    })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    const res = await app.request('/api/bind-test/rows-bad')
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('secret-row')
  })

  it('non-member: anonRows drops refused rows exactly as for an anonymous caller', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/rows-nm',
      auth: 'public',
      anonShape: { data: [{ id: true }], count: true },
      anonRows: (r) => r.status === 'Published',
      handler: async () => jsonRes({ data: [{ id: 'a', status: 'Published' }, { id: 'b', status: 'In Review' }], count: 2 }),
    })
    const app = new Hono()
    bindRegistryToHono(app, NON_MEMBER_GATE)
    expect(await (await app.request('/api/bind-test/rows-nm')).json()).toEqual({ data: [{ id: 'a' }], count: 1 })
  })

  it('non-member: 403 on every route that is not a public GET, every method, before the handler', async () => {
    let ran = 0
    const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const
    for (const method of methods) {
      defineRoute({ method, path: '/api/bind-test/m', auth: 'authed', handler: async () => { ran++; return jsonRes({ data: 'member data' }) } })
      defineRoute({ method, path: '/api/bind-test/pi', auth: 'pi', handler: async () => { ran++; return jsonRes({ data: 'pi data' }) } })
    }
    defineRoute({ method: 'POST', path: '/api/bind-test/pubpost', auth: 'public', handler: async () => { ran++; return jsonRes({ ok: true }) } })
    const app = new Hono()
    bindRegistryToHono(app, NON_MEMBER_GATE)
    for (const method of methods) {
      for (const path of ['/api/bind-test/m', '/api/bind-test/pi']) {
        const res = await app.request(path, { method })
        expect(res.status, `${method} ${path}`).toBe(403)
        expect(await res.json()).toEqual({ error: 'members only', code: 'not_a_member' })
      }
    }
    expect((await app.request('/api/bind-test/pubpost', { method: 'POST' })).status).toBe(403)
    expect((await app.request('/api/bind-test/m', { method: 'HEAD' })).status).toBe(403)
    expect(ran).toBe(0)
  })

  it('non-member: a public GET is cut to its anonShape; only servesNonMembers gets the handler in full', async () => {
    defineRoute({
      method: 'GET', path: '/api/bind-test/pub', auth: 'public', anonShape: { data: [{ id: true }] },
      handler: async () => jsonRes({ data: [{ id: 'p1', note: 'private' }] }),
    })
    defineRoute({
      method: 'GET', path: '/api/bind-test/me', auth: 'public', anonShape: { authenticated: true }, servesNonMembers: true,
      handler: async () => jsonRes({ authenticated: true, isMember: false }),
    })
    const app = new Hono()
    bindRegistryToHono(app, NON_MEMBER_GATE)
    expect(await (await app.request('/api/bind-test/pub')).json()).toEqual({ data: [{ id: 'p1' }] })
    expect(await (await app.request('/api/bind-test/me')).json()).toEqual({ authenticated: true, isMember: false })
  })

  it('anonymous: every write is denied before its handler', async () => {
    let ran = false
    defineRoute({ method: 'POST', path: '/api/bind-test/w', auth: 'authed', handler: async () => { ran = true; return jsonRes({}) } })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    expect((await app.request('/api/bind-test/w', { method: 'POST' })).status).toBe(401)
    expect(ran).toBe(false)
  })

  it('servesNonMembers is refused anywhere but a public GET', () => {
    expect(() =>
      defineRoute({
        method: 'GET', path: '/api/bind-test/x', auth: 'authed',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ servesNonMembers: true } as any),
        handler: async () => new Response(),
      }),
    ).toThrow(/servesNonMembers/)
  })
})
